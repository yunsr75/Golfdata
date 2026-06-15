import { deriveRound, validateRound, normalizeCourse, coursePar } from '../../lib/golf.mjs';
import { loadAll } from '../../lib/store.mjs';

export const config = { path: '/api/extract-round' };

const MODEL = process.env.VISION_MODEL || 'claude-sonnet-4-6';

const PROMPT = `You are reading a Voice Caddie golf scorecard screenshot (Korean app, dark theme).

Layout:
- Header shows total SCORE (e.g. "78 (+6)"), GIR %, average putts, and the course name + date (YYYY.MM.DD).
- Two tables: first covers HOLE 1-9, second covers HOLE 10-18. Each has a "Total" column.
- Rows in order: Par, Score, Putt, Penalty, GIR, Tempo (Tee Shot), Dist (Tee Shot).
- Score cells may have a colored highlight box (blue = over par, red/pink = under par). The box is decoration only — read the number inside.
- GIR row: a check mark (✓) means GIR was hit on that hole; blank means missed.
- Penalty / Tempo / Dist may show "-" meaning none/not recorded.

Return ONLY a JSON object, no prose, no markdown fences, with this exact shape:
{
  "date": "YYYY-MM-DD",
  "courseRaw": "<course name exactly as shown>",
  "gross": <number from header SCORE>,
  "putts": <number, header total putts if shown else sum>,
  "girPercent": <number, header GIR % e.g. 33.3>,
  "holes": [
    {"hole":1,"par":4,"score":4,"putt":1,"penalty":0,"gir":false},
    ... 18 entries, holes 1..18 in order ...
  ]
}
Rules: penalty "-" -> 0. gir ✓ -> true, blank -> false. Every hole 1..18 must appear. Numbers must be integers for par/score/putt/penalty.`;

export default async (req) => {
  try {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return Response.json({ error: 'ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.' }, { status: 500 });

    const { imageBase64, mediaType = 'image/jpeg' } = await req.json();
    if (!imageBase64) return Response.json({ error: '이미지가 없습니다.' }, { status: 400 });

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: PROMPT },
          ],
        }],
      }),
    });
    const data = await resp.json();
    if (data.error) return Response.json({ error: 'Vision API: ' + (data.error.message || 'unknown') }, { status: 502 });

    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    let parsed;
    try { parsed = JSON.parse(text.replace(/```json|```/g, '').trim()); }
    catch { return Response.json({ error: '판독 결과 파싱 실패', raw: text }, { status: 502 }); }

    const course = normalizeCourse(parsed.courseRaw);
    const holeRows = (parsed.holes || []).map(h => ({
      hole: +h.hole, par: +h.par, score: +h.score,
      putt: h.putt == null ? null : +h.putt,
      pen: h.penalty == null ? 0 : +h.penalty,
      gir: !!h.gir,
    })).sort((a, b) => a.hole - b.hole);

    const header = { gross: parsed.gross, putts: parsed.putts, girp: parsed.girPercent != null ? parsed.girPercent / 100 : null };
    const validation = validateRound(holeRows, header);

    // 다음 라운드 번호 제안
    const { rounds } = await loadAll();
    const nextNo = Math.max(0, ...rounds.map(r => r.no || 0)) + 1;
    const draftRound = deriveRound({ date: parsed.date, course, no: nextNo, holeRows });

    return Response.json({
      courseRaw: parsed.courseRaw,
      course,
      par: coursePar(course),
      holeRows,
      draftRound,
      validation,
    });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
};
