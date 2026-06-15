// ───────────────────────────────────────────────────────────────
// 골프 데이터 핵심 로직 (순수 함수)
//  - 보이스캐디 캡처에서 추출한 홀 데이터를 golf_data 한 줄로 변환
//  - hole_data(코스별 홀 평균) 증분 갱신
//  - streak_data(버디/파 스트릭, 사이클링 버디) 증분 갱신
//  - 코스명 정규화
// ───────────────────────────────────────────────────────────────

// 캡처에 표시되는 코스명 → 저장용 코스명 매핑
export const COURSE_ALIASES = {
  '잭 니클라우스 GC 코리아': '잭니클라우스',
  '잭니클라우스 GC 코리아': '잭니클라우스',
};

export function normalizeCourse(raw) {
  if (!raw) return raw;
  const t = String(raw).trim();
  if (COURSE_ALIASES[t]) return COURSE_ALIASES[t];
  // 흔한 접미사 제거 후 재시도 (GC/CC/코리아/골프클럽 등)
  const stripped = t
    .replace(/\s*(GC|CC|G\.?C\.?|골프클럽|컨트리클럽|골프장)\s*코리아?\s*$/i, '')
    .replace(/\s*(GC|CC|골프클럽|컨트리클럽)\s*$/i, '')
    .trim();
  return COURSE_ALIASES[stripped] || stripped || t;
}

const round2 = n => Math.round(n * 100) / 100;
const round1 = n => Math.round(n * 10) / 10;
const round4 = n => Math.round(n * 10000) / 10000;

// 파 오버라이드 (WHS 근사 계산용 코스 파)
export const PAR_OVERRIDE = { '아난티남해': 73, '카스카디아': 71, '골프존카운티송도': 71 };
export const coursePar = c => PAR_OVERRIDE[c] || 72;

// holeRows: [{hole,par,score,putt,pen,gir(boolean),tempo,dist}, ...18]
// 캡처에 없는 필드(net,fw,fwp,uda,udq,hc20,dist)는 null 유지
export function deriveRound({ date, course, no, holeRows, extra = {} }) {
  const tally = { alb: 0, egl: 0, bir: 0, par: 0, bog: 0, dbl: 0, trp: 0 };
  let gross = 0, putts = 0, p3 = 0, gir = 0;
  for (const h of holeRows) {
    gross += h.score;
    if (h.putt != null) { putts += h.putt; if (h.putt >= 3) p3 += 1; }
    if (h.gir) gir += 1;
    const d = h.score - h.par;
    if (d <= -3) tally.alb++;
    else if (d === -2) tally.egl++;
    else if (d === -1) tally.bir++;
    else if (d === 0) tally.par++;
    else if (d === 1) tally.bog++;
    else if (d === 2) tally.dbl++;
    else tally.trp++;          // +3 이상은 모두 trp(트리플 이상)
  }
  const girp = round4(gir / holeRows.length);
  return {
    date,
    course,
    no,
    gross,
    net: extra.net ?? null,
    putts,
    p3,
    fw: extra.fw ?? null,
    fwp: extra.fwp ?? null,
    gir,
    girp,
    uda: extra.uda ?? null,
    udq: extra.udq ?? null,
    hc20: extra.hc20 ?? null,
    ...tally,
    dist: extra.dist ?? null,
  };
}

// hole_data 증분 갱신: 해당 코스 18홀 평균/가중치 업데이트 (기존 평균 + 새 라운드)
export function updateHoleData(holeData, course, holeRows) {
  const list = holeData[course] ? holeData[course].map(o => ({ ...o })) : [];
  const byHole = new Map(list.map(o => [o.h, o]));
  for (const h of holeRows) {
    const g = h.gir ? 1 : 0;
    const ex = byHole.get(h.hole);
    if (ex) {
      const n1 = ex.n + 1;
      const avg = (ex.avg * ex.n + h.score) / n1;
      const girP = ((ex.girP / 100) * ex.n + g) / n1 * 100;
      const putts = h.putt != null ? (ex.putts * ex.n + h.putt) / n1 : ex.putts;
      ex.n = n1;
      ex.avg = round2(avg);
      ex.vs = round2(avg - ex.par);
      ex.girP = round1(girP);
      ex.putts = round2(putts);
    } else {
      const o = {
        h: h.hole, par: h.par,
        avg: round2(h.score), vs: round2(h.score - h.par),
        girP: round1(g * 100), putts: h.putt != null ? round2(h.putt) : null,
        n: 1,
      };
      byHole.set(h.hole, o);
      list.push(o);
    }
  }
  list.sort((a, b) => a.h - b.h);
  holeData[course] = list;
  return holeData;
}

// 한 라운드 내 최장 연속 런(birdie 이상 / par 이상) 길이와 홀 목록
function bestRun(holeRows, pred) {
  let best = [], cur = [];
  for (const h of holeRows) {
    if (pred(h)) { cur.push(h); if (cur.length > best.length) best = [...cur]; }
    else cur = [];
  }
  // 끝까지 이어진 trailing run
  let tail = 0;
  for (let i = holeRows.length - 1; i >= 0; i--) { if (pred(holeRows[i])) tail++; else break; }
  return { best, tail };
}

// streak_data 증분 갱신 (스트릭은 라운드 내에서 판정)
export function updateStreaks(streak, { date, course }, holeRows) {
  const s = JSON.parse(JSON.stringify(streak));
  const isBir = h => (h.score - h.par) <= -1;
  const isPar = h => (h.score - h.par) <= 0;

  const bir = bestRun(holeRows, isBir);
  if (bir.best.length > (s.birBest || 0)) {
    s.birBest = bir.best.length;
    s.birHoles = bir.best.map(h => ({ date, course, hole: h.hole }));
  }
  s.birCur = bir.tail;

  const par = bestRun(holeRows, isPar);
  if (par.best.length > (s.parBest || 0)) {
    s.parBest = par.best.length;
    s.parHoles = par.best.map(h => ({ date, course, hole: h.hole }));
  }
  s.parCur = par.tail;

  // 사이클링 버디: 연속 3홀에 파3·파4·파5가 모두 포함 + 모두 버디 이상
  s.cycling = s.cycling || [];
  for (let i = 0; i + 2 < holeRows.length; i++) {
    const w = holeRows.slice(i, i + 3);
    const pars = new Set(w.map(h => h.par));
    const allBir = w.every(isBir);
    if (allBir && pars.has(3) && pars.has(4) && pars.has(5)) {
      const exists = s.cycling.some(c => c.date === date && c.course === course
        && c.holes[0].hole === w[0].hole);
      if (!exists) {
        s.cycling.push({
          date, course,
          holes: w.map(h => ({ hole: h.hole, par: h.par, vs: h.score - h.par })),
        });
      }
    }
  }
  return s;
}

// 검증: 캡처 합계가 일관적인지 (홀 합 = gross, 18홀, 퍼팅 합 등)
export function validateRound(holeRows, header = {}) {
  const issues = [];
  if (holeRows.length !== 18) issues.push(`홀 수가 ${holeRows.length}개입니다 (18개 필요).`);
  const gross = holeRows.reduce((a, h) => a + (h.score || 0), 0);
  if (header.gross != null && header.gross !== gross)
    issues.push(`홀 합계 ${gross} ≠ 표시 스코어 ${header.gross}.`);
  const putts = holeRows.reduce((a, h) => a + (h.putt || 0), 0);
  if (header.putts != null && header.putts !== putts)
    issues.push(`퍼팅 합계 ${putts} ≠ 표시 ${header.putts}.`);
  const gir = holeRows.filter(h => h.gir).length;
  if (header.girp != null) {
    const exp = Math.round(header.girp * 18);
    if (Math.abs(gir - exp) > 0) issues.push(`GIR ${gir}개가 표시 ${(header.girp * 100).toFixed(1)}%와 불일치.`);
  }
  for (const h of holeRows) {
    if (![3, 4, 5].includes(h.par)) issues.push(`${h.hole}번 홀 파(${h.par})가 비정상.`);
    if (h.score < 1 || h.score > 15) issues.push(`${h.hole}번 홀 스코어(${h.score})가 비정상.`);
  }
  return { ok: issues.length === 0, gross, putts, gir, issues };
}
