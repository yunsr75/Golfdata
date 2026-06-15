import { deriveRound, updateHoleData, updateStreaks, validateRound, normalizeCourse } from '../../lib/golf.mjs';
import { loadAll, saveAll } from '../../lib/store.mjs';

export const config = { path: '/api/commit-round' };

export default async (req) => {
  try {
    const body = await req.json();
    const date = body.date;
    const course = normalizeCourse(body.course);
    const holeRows = (body.holeRows || []).map(h => ({
      hole: +h.hole, par: +h.par, score: +h.score,
      putt: h.putt == null ? null : +h.putt,
      pen: h.pen == null ? 0 : +h.pen,
      gir: !!h.gir,
    })).sort((a, b) => a.hole - b.hole);

    const validation = validateRound(holeRows, { gross: body.gross });
    if (!validation.ok && !body.force)
      return Response.json({ error: '검증 실패', validation }, { status: 400 });

    const { rounds, holeData, streak, holeRecords } = await loadAll();

    // 중복 방지: 같은 날짜+코스 라운드가 이미 있으면 거부 (force로 우회)
    if (!body.force && rounds.some(r => r.date === date && r.course === course))
      return Response.json({ error: `${date} ${course} 라운드가 이미 존재합니다.`, duplicate: true }, { status: 409 });

    const nextNo = body.no || (Math.max(0, ...rounds.map(r => r.no || 0)) + 1);
    const round = deriveRound({
      date, course, no: nextNo, holeRows,
      extra: { net: body.net ?? null, fw: body.fw ?? null, fwp: body.fwp ?? null,
               uda: body.uda ?? null, udq: body.udq ?? null, hc20: body.hc20 ?? null, dist: body.dist ?? null },
    });

    const newRounds = [...rounds, round].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.no || 0) - (b.no || 0)));
    const newHoleData = updateHoleData(JSON.parse(JSON.stringify(holeData)), course, holeRows);
    const newStreak = updateStreaks(streak, { date, course }, holeRows);
    const newRecords = [
      ...holeRecords,
      ...holeRows.map(h => ({ no: nextNo, date, course, hole: h.hole, par: h.par, score: h.score, putt: h.putt, penalty: h.pen, gir: h.gir })),
    ];

    await saveAll({ rounds: newRounds, holeData: newHoleData, streak: newStreak, holeRecords: newRecords });
    return Response.json({ ok: true, no: nextNo, round });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
};
