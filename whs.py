#!/usr/bin/env python3
"""WHS(World Handicap System) 지수 계산 — golf_db.json 의 모든 라운드를 처음부터 재계산한다.

사용: python3 whs.py            (golf_db.json 을 읽고 rounds[*].diff / ags / whs 를 다시 써넣음)

입력
  db['courseRatings'][코스명] = {tee, cr, slope, src}   ← 조사된 골프장
  db['courseRatings']['_default']                      ← 미확보 골프장 기본값(아래 DEFAULT_RULE)
  db['holeData'][코스명][i]['par'/'vs']                 ← 홀별 파, 네트 더블보기 상한용 난이도 순위

계산 (WHS 2024 규칙을 데이터가 허용하는 범위에서 적용)
  1) AGS(조정 총타수): 홀별 상한 = 파 + 2 + 받는 스트로크(네트 더블보기)
     - 코스 핸디캡 = 직전 지수 × slope/113 + (CR − 파)
     - 받는 스트로크 배분은 스트로크 인덱스(SI) 대신, holeData의 '내 평균 대비 파(vs)'가 큰 홀부터 배정
     - 지수가 아직 없으면(첫 라운드들) 상한 = 파 + 5
     - 홀별 스코어나 홀별 파가 없으면 gross 그대로
  2) Score Differential = (AGS − CR) × 113 / slope, 소수 1자리 (PCC = 0)
  3) 지수 = 최근 20개 differential 중 최저 8개 평균 (20개 미만이면 WHS 표 적용)
  4) 이례적 스코어 감액(ESR), 소프트캡(+3 초과분 50%)·하드캡(+5) 적용 — 기준 '최저 지수'는 직전 365일
"""
import json, sys
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

DB_PATH = sys.argv[1] if len(sys.argv) > 1 else 'golf_db.json'


def r1(x):
    return float(Decimal(str(x)).quantize(Decimal('0.1'), ROUND_HALF_UP))


def rating_for(course, ratings, holeData):
    par = sum(h['par'] for h in holeData[course]) if course in holeData else 72
    cr = ratings.get(course)
    if cr:
        return cr['cr'], cr['slope'], par, False
    d = ratings['_default']
    return r1(par + d['crMinusPar']), d['slope'], par, True


def ags_for(rnd, idx, cr, slope, par, holeData):
    holes = rnd.get('holes')
    hd = holeData.get(rnd['course'])
    if not holes or len(holes) != 18 or not hd:
        return rnd['gross']
    pars = [h['par'] for h in hd]
    if idx is None:
        caps = [p + 5 for p in pars]
    else:
        ch = round(idx * slope / 113 + (cr - par))
        ch = max(ch, 0)
        order = sorted(range(18), key=lambda i: -(hd[i].get('vs') or 0))  # 어려운 홀부터
        strokes = [ch // 18] * 18
        for i in order[: ch % 18]:
            strokes[i] += 1
        caps = [pars[i] + 2 + strokes[i] for i in range(18)]
    return sum(min(s, c) for s, c in zip(holes, caps))


def table_index(diffs):
    m = len(diffs)
    if m < 3:
        return None
    s = sorted(diffs)
    use, adj = {3: (1, -2), 4: (1, -1), 5: (1, 0), 6: (2, -1), 7: (2, 0), 8: (2, 0)}.get(m, (None, 0))
    if use is None:
        use = 3 if m <= 11 else 4 if m <= 14 else 5 if m <= 16 else 6 if m <= 18 else 7 if m == 19 else 8
    return r1(sum(s[:use]) / use + adj)


def main():
    db = json.load(open(DB_PATH))
    ratings, holeData = db['courseRatings'], db['holeData']
    order = sorted(range(len(db['rounds'])), key=lambda i: (db['rounds'][i]['date'], db['rounds'][i]['no']))
    hist = []          # [{'date', 'diff'(ESR 반영 전 원값), 'esr'(누적 감액)}]
    idx_hist = []      # [(date, index)]
    idx = None
    for i in order:
        rnd = db['rounds'][i]
        cr, slope, par, dflt = rating_for(rnd['course'], ratings, holeData)
        ags = ags_for(rnd, idx, cr, slope, par, holeData)
        diff = r1((ags - cr) * 113 / slope)
        hist.append({'date': rnd['date'], 'diff': diff, 'esr': 0.0})
        # 이례적 스코어 감액: 직전 지수보다 7.0 이상 좋으면 최근 20개에 -1, 10.0 이상이면 -2
        if idx is not None and len(hist) >= 20:
            gap = idx - diff
            red = 2.0 if gap >= 10 else 1.0 if gap >= 7 else 0.0
            for h in hist[-20:]:
                h['esr'] += red
        new = table_index([h['diff'] - h['esr'] for h in hist[-20:]])
        # 캡: 20개 이상 쌓인 뒤, 직전 365일 최저 지수 기준
        if new is not None and len(hist) >= 20:
            d0 = date.fromisoformat(rnd['date']) - timedelta(days=365)
            lows = [v for (d, v) in idx_hist if date.fromisoformat(d) >= d0 and v is not None]
            if lows:
                low = min(lows)
                if new - low > 3:
                    new = r1(low + 3 + (new - low - 3) * 0.5)
                new = min(new, r1(low + 5))
        idx = new
        idx_hist.append((rnd['date'], idx))
        rnd['ags'] = ags
        rnd['diff'] = diff
        rnd['whs'] = idx
        rnd['crDefault'] = dflt
    if 'lastRound' in db and db['rounds']:
        last = db['rounds'][order[-1]]
        db['lastRound']['whs'] = last['whs']
    json.dump(db, open(DB_PATH, 'w'), ensure_ascii=False, indent=1)
    last = db['rounds'][order[-1]]
    print(f"rounds={len(order)}  last={last['date']} {last['course']} gross={last['gross']} ags={last['ags']} diff={last['diff']} whs={last['whs']}")


if __name__ == '__main__':
    main()
