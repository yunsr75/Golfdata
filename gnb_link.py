#!/usr/bin/env python3
"""GNB 월례회 기록 ↔ 개인 라운드 연결 — golf_db.json 의 db['gnb'] 와 rounds[*].gnb 를 관리한다.

원칙
  - GNB 랭킹·넷·포인트의 원본은 GNB 쪽(GNB_시즌결과_2026.csv → gnb_dashboard.py → Cloudflare)이다.
    여기에는 Steve(윤성렬/올드헤드)의 월례회 출전 기록만 옮겨 와서 개인 라운드에 '표시'만 붙인다.
  - 정보는 GNB → 개인 한 방향. 개인 라운드는 GNB 랭킹에 절대 반영되지 않는다.
  - 개인 rounds 의 gross·통계·WHS 는 건드리지 않는다. 스코어가 다르면 보고만 한다(자동 수정 금지).

사용
  python3 gnb_link.py                               # db['gnb']['events'] 로 rounds[*].gnb 재연결 + 대조 보고
  python3 gnb_link.py --csv GNB_시즌결과_2026.csv   # GNB 시즌 CSV에서 Steve 행을 가져와 events 에 추가(중복 무시) 후 재연결

매칭 규칙
  같은 연·월 + 같은 골프장(아래 COURSE_MAP)의 개인 라운드. 후보가 여럿이면 gross 가 같은 라운드 → 없으면 연결 안 함.
  match = 'ok'(스코어 일치) / 'score'(라운드는 찾았으나 스코어 다름) / 'none'(개인 기록에 없음)
"""
import csv, json, re, sys

DB_PATH = 'golf_db.json'
ME = '윤성렬'
COURSE_MAP = {'베크포': '베어크리크포천', '베크춘': '베어크리크춘천', '올드': '라비에벨', '뉴서울': '뉴서울'}


def parse_event(name):
    m = re.match(r'(베크포|베크춘|올드|뉴서울)(\d+)월', name)
    if not m:
        raise ValueError(f'event 이름 해석 실패: {name}')
    return m.group(1), int(m.group(2))


def import_csv(db, path, season=2026):
    evs = db['gnb']['events']
    have = {(e['season'], e['event']) for e in evs}
    added = 0
    for r in csv.DictReader(open(path, encoding='utf-8-sig')):
        if r['실명'] != ME or (season, r['event']) in have:
            continue
        evs.append(dict(season=season, event=r['event'], code=r['구장코드'], club=r['구장명'],
                        sub=r['세부코스'] or None, gross=int(r['그로스'])))
        have.add((season, r['event']))
        added += 1
    print(f'CSV에서 새 월례회 {added}건 추가')


def link(db):
    rounds = db['rounds']
    for r in rounds:
        r.pop('gnb', None)
    used = set()
    for e in db['gnb']['events']:
        code, mo = parse_event(e['event'])
        pre = f"{e['season']}-{mo:02d}"
        cand = [r for r in rounds if r['date'].startswith(pre) and r['course'] == COURSE_MAP[code] and id(r) not in used]
        if len(cand) > 1:
            cand = [r for r in cand if r['gross'] == e['gross']]
        if len(cand) == 1:
            r = cand[0]
            used.add(id(r))
            r['gnb'] = e['event']
            e['round'], e['date'] = r['no'], r['date']
            e['match'] = 'ok' if r['gross'] == e['gross'] else 'score'
        else:
            e['round'] = e['date'] = None
            e['match'] = 'none'
    db['gnb']['events'].sort(key=lambda e: (e['date'] or f"{e['season']}-{parse_event(e['event'])[1]:02d}-99"))


def report(db):
    evs = db['gnb']['events']
    ok = sum(e['match'] == 'ok' for e in evs)
    print(f'월례회 {len(evs)}건: 일치 {ok} / 스코어 다름 {sum(e["match"]=="score" for e in evs)} / 개인 기록 없음 {sum(e["match"]=="none" for e in evs)}')
    for e in evs:
        if e['match'] == 'score':
            mine = next(r['gross'] for r in db['rounds'] if r['no'] == e['round'])
            print(f"  ⚠ {e['season']} {e['event']}: GNB {e['gross']} vs 개인 No.{e['round']} {mine}")
        elif e['match'] == 'none':
            print(f"  ⚠ {e['season']} {e['event']}: 개인 기록에서 짝을 못 찾음")


def main():
    db = json.load(open(DB_PATH, encoding='utf-8'))
    db.setdefault('gnb', {'events': []})
    if '--csv' in sys.argv:
        import_csv(db, sys.argv[sys.argv.index('--csv') + 1])
    link(db)
    report(db)
    with open(DB_PATH, 'w', encoding='utf-8') as f:
        json.dump(db, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
