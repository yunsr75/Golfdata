# 골프 데이터 대시보드 업데이트 가이드

Steve의 골프 스코어카드 스크린샷을 받아 대시보드를 업데이트하는 표준 절차.

**데이터 원본(source of truth)은 GitHub 저장소 `yunsr75/Golfdata`다.**
claude.ai 지식 폴더에는 데이터를 두지 않는다(용량 절약 + 1.1MB 파일이 앞부분만 읽히는 문제 회피).
`index.html`은 매번 `app_template.html` + `golf_db.json`으로 새로 조립하는 배포용 산출물이며,
Netlify 업로드는 Steve가 직접 한다.

> 마지막 업데이트: 2026-11-15 (No.849 오크밸리 2026-11-15까지, 총 846라운드, hc20 6.0 / WHS 5.7). WHS는 `whs.py`로 전 라운드 재계산. 스코어만 있는 라운드(퍼트·GIR·비거리 미기록)는 해당 값 null, holeData는 avg/vs/d/n만 갱신하고 girP/putts/pen/nd는 기존값 유지.

## 0. 새 라운드가 올라오면 (매번 이 순서)

1. **저장소 연결·최신 데이터 가져오기**
   - 세션에 저장소가 없으면 `add_repo`(owner `yunsr75`, repo `Golfdata`, access `push`)로 연결
   - `git clone --depth 1 https://github.com/yunsr75/golfdata` (이미 있으면 `git pull`)
   - 반드시 GitHub의 `golf_db.json`을 기준으로 작업. 대화·지식 폴더의 옛 사본을 쓰지 말 것
2. **스크린샷 판독 → `golf_db.json` 갱신** (아래 2~3장 절차, 4장 체크리스트)
   - 쓸 때 형식 유지: `json.dump(db, f, ensure_ascii=False, indent=1)`
   - 기존 라운드·holeData가 원본과 동일한지(신규 분만 바뀌었는지) 검산
3. **`python3 whs.py` 실행** → 전 라운드 `diff`/`ags`/`whs` 재계산 (3장 Step 5-2)
   - 이어서 **`python3 gnb_link.py`** 실행 → GNB 월례회 표시 재연결(6장)
4. **`index.html` 조립·검증** (3장 Step 6)
5. **GitHub에 커밋·푸시**: `golf_db.json`, `index.html`(템플릿·README가 바뀌었으면 함께)
   - 커밋 메시지 예: `Add round No.844 (2026-11-01 코스명 78)`
   - 푸시 전 `git fetch origin main` 후 앞서 있는지 확인
6. **Steve에게 `index.html` 전달** → Steve가 Netlify에 직접 업로드

## 1. 파일 구성

| 파일 | 위치 | 내용 |
|---|---|---|
| `golf_db.json` | GitHub | 통합 데이터. 최상위 6개 키: `rounds` / `lastRound` / `holeData` / `streaks` / `courseRatings` / `gnb` |
| `gnb_link.py` | GitHub | GNB 월례회 ↔ 개인 라운드 연결기. `db['gnb']`와 `rounds[*].gnb`를 관리(6장) |
| `whs.py` | GitHub | WHS 지수 계산기. `courseRatings`로 전 라운드 `diff`·`ags`·`whs`를 재계산해 golf_db.json에 기록 |
| `app_template.html` | GitHub | 자리표시자 `__DATA__` 가 **정확히 1개** 있는 템플릿 (`const DB = __DATA__;`) |
| `index.html` | GitHub + Netlify(Steve 직접 업로드) | 템플릿의 `__DATA__` 를 golf_db.json 전체로 치환한 결과물. 직접 편집 금지 |

`golf_db.json`의 6개 키 내용:

| 키 | 내용 |
|---|---|
| `rounds` | 전체 라운드 배열(2015~현재). 라운드당 1개 객체 |
| `lastRound` | 가장 최근 라운드의 홀별 상세 기록 |
| `holeData` | 골프장별 홀별 누적 통계(평균 타수, GIR%, 퍼트, 페널티, 스코어 분포) |
| `streaks` | 버디/파 연속 기록(올타임 최고 + 현재 진행 중) |
| `courseRatings` | 골프장별 코스 레이팅·슬로프 `{tee, cr, slope, src}` (국내 화이트티, 영국 옐로티 기준) + `_default`(미확보 골프장 기본값: CR = 코스 파 −0.8, Slope 130 — 조사된 국내 화이트티 7곳 평균) |
| `gnb` | Steve의 GNB 월례회 출전 기록 `events[]` `{season, event, code, club, sub, gross(GNB 엑셀값), round, date, match}` + `src` |

템플릿 안에서는 다음과 같이 풀어서 쓴다(수정하지 말 것):

```js
const DB = __DATA__;
const EMBEDDED    = DB.rounds;
const HOLE_DATA   = DB.holeData;
const STREAK_DATA = DB.streaks;
const LAST_ROUND  = DB.lastRound;
```

## 2. 스크린샷에서 읽어야 할 값

한국 골프 스코어카드 앱 캡처 화면에서 홀별(1~18)로 추출:
- Par, Score
- Putt (퍼트 수)
- Penalty ("-"는 0)
- GIR (체크 표시 있는 홀만 true)
- Tempo / Dist (Tee Shot) — 파3 홀은 보통 "-" (결측 처리)
- 헤더의 총타수, GIR%, 홀당 평균 퍼트, 전체 걸음수

**주의**: 후반 9홀 상세가 없으면 알 수 있는 값만으로 등록하고 나머지는 null로 두되,
그 사실을 답변에 명시할 것. 숫자를 억지로 추정하지 말 것.

## 3. 업데이트 절차

### Step 1 — 라운드 기본값 계산
- `gross` = 전체 타수 합, 코스 파는 보통 72
- 카테고리 집계(`alb/egl/bir/par/bog/dbl/trp`): 홀별 `score - par`
  (`-3 이하`→alb, `-2`→egl, `-1`→bir, `0`→par, `1`→bog, `2`→dbl, `3 이상`→trp)
- `gir` = GIR 홀 수, `girp` = gir/18
- `putts` = 퍼트 합, `p3` = 3퍼트 이상 홀 수
- `nines` = 스코어카드에 표시된 코스 명칭(예: `["남","남"]`)
- `course`는 `rounds` 기존 표기 규칙을 따름(공백/GC 제거, 예: "베어크리크포천", "레이크사이드")
- `drvDist` / `drvTempo` = 티샷 거리·템포의 단순 평균(파3 제외). 앱 산출값과 소수점이
  다를 수 있으므로 답변에 "카드 기준 단순 평균"임을 밝힐 것
- `hc20` = **최근 20라운드(이번 라운드 포함, `rounds` 배열 끝 20개) gross 중 낮은 8개 평균 − 72**, 소수 1자리
  ```python
  hc20 = round(sum(sorted(x['gross'] for x in db['rounds'][-20:])[:8]) / 8 - 72, 1)  # 새 라운드 append 후
  ```
  - 2026-11-08 기존 826라운드와 대조해 796개 일치 확인(파이썬 `round` 그대로 사용, 7.25→7.2 / 4.75→4.8이 앱과 같음)
  - 매 라운드 계산해서 `rounds[-1].hc20`과 `lastRound.hc20`에 동일하게 넣을 것. 직전 값 복사 금지
  - 2025-09~2026-02 일부 라운드는 앱 값과 0.1~0.2 차이가 있으나 원래 기록 유지(소급 수정 금지)

### Step 2 — `DB.rounds` 에 라운드 추가
배열 맨 끝에 새 객체 추가(`no`는 직전 +1), `holes`는 18개 스코어 배열.

### Step 3 — `DB.lastRound` 교체
새 라운드로 통째로 덮어씀. `holes` 배열은 홀별 `{h, par, sc, pt, pen, gir, tempo, dist}`.
상세가 없는 홀은 pt/pen/gir/tempo/dist를 null로. `course`는 스크린샷 원문 표기
("레이크사이드 CC")를 쓰는 기존 관행 유지.

### Step 4 — `DB.holeData[코스]` 누적 업데이트 (해당 골프장만)
**증분 평균**으로 갱신(전체 재계산 아님):
```
newN  = n + 1
avg   = (avg*n + score) / newN
vs    = avg - par
girP  = (girP*n + (100 if gir else 0)) / newN   # 퍼센트 단위
putts = (putts*n + newPutt) / newN
pen   = (pen*n + newPen) / newN
```
- 반올림: avg/vs/putts는 소수 1자리, girP는 정수, pen은 소수 2자리
- `d` 배열은 6칸 `[이글이하, 버디, 파, 보기, 더블, 트리플이상]`. 해당 칸만 +1
  (`d`의 합 == 갱신 후 `n` 이어야 함 — 반드시 검산)
- `nd`는 티샷 거리 데이터가 있는 라운드 수. 거리 "-"인 홀은 올리지 않음
- `holeData`의 `par` 값은 코스별 9홀 조합(남/동/서)에 따라 이번 라운드와 다를 수 있으나
  기존 값을 그대로 유지한다
- 새 골프장이면 18홀짜리 배열을 새로 추가

### Step 5 — `DB.streaks` 갱신
대시보드 표시 기준과 맞춘다(기록 탭의 카드 제목·설명 참고).
- **연속 파(파 이하)는 한 라운드 안에서만 센다.** 이전 라운드의 `parCur`에 이어 붙이지 말 것
  - 이번 라운드 1번홀부터 새로 세고, 라운드 내 최장 연속이 `parBest`를 넘으면 `parBest`/`parHoles` 갱신
  - `parCur` = 이번 라운드 마지막 홀에서 끝나는 연속 수(다음 라운드에 이어지지 않음)
  - 예: 직전 라운드가 파 5연속으로 끝나고 이번에 1~8번 파 이하여도 기록은 8홀(13홀 아님)
- **연속 버디(버디 이상, `score-par <= -1`)도 한 라운드 안에서만 센다.** 이전 라운드의 `birCur`에 이어 붙이지 말 것
  - 라운드 내 최장 연속이 `birBest`를 넘으면 `birBest`/`birHoles` 갱신
  - `birCur` = 이번 라운드 마지막 홀에서 끝나는 연속 수(다음 라운드에 이어지지 않음)
- 대부분의 라운드는 경신 없이 `parCur`/`birCur`만 갱신됨

### Step 5-2 — WHS 지수 (`python3 whs.py`)
- 새 라운드를 넣은 뒤 매번 실행. 전 라운드를 날짜순으로 처음부터 재계산하므로 순서·중복 걱정 없음
- 라운드별 필드: `ags`(네트 더블보기 상한 적용 조정 타수), `diff`(Score Differential), `whs`(그 라운드 직후 지수), `crDefault`(기본값 사용 여부)
- 대시보드의 'WHS 핸디캡'·추이 차트·역대 최저는 `rounds[*].whs`를 그대로 표시. `hc20`(앱 방식: 베스트 8/20 − 72)은 비교용으로 계속 별도 계산
- **새 골프장 레이팅을 찾으면** `courseRatings`에 `{tee, cr, slope, src}`로 추가(국내 화이트, 해외 옐로/남성 일반 티). 코스명은 `rounds[*].course` 표기와 정확히 일치해야 함
- 근사 사항: 홀 핸디캡(SI) 대신 holeData의 '내 평균 대비 파(vs)' 순위로 스트로크 배분, PCC=0, 27홀 골프장은 holeData 파 조합 그대로 사용
- 답변에 WHS 변화량과, 이번 골프장이 기본값을 썼는지 명시

### Step 6 — index.html 조립 (필수)
1. `app_template.html`을 읽는다
2. `__DATA__`(정확히 1곳)를 `golf_db.json` 전체 JSON 문자열로 치환
   (`json.dumps(db, ensure_ascii=False, separators=(',',':'))`)
3. 결과 HTML의 `<script>` 블록들을 추출해 `node --check`로 문법 검증
4. 작업 폴더(저장소 클론)에 `golf_db.json`과 `index.html`을 저장

### Step 7 — 백업·전달
- `golf_db.json`, `index.html` → GitHub `yunsr75/Golfdata`에 커밋·푸시 (템플릿은 바뀌었을 때만)
- `index.html` → Steve에게 파일로 전달. Netlify 업로드는 Steve가 직접
- 지식 폴더에는 쓰지 않는다

## 4. 검증 체크리스트 (매번)
- [ ] 전반+후반 합 = 헤더 총타수(+/-par)와 일치
- [ ] 카테고리 합이 18
- [ ] GIR 개수 = 헤더 GIR% × 18
- [ ] `holeData` 각 홀 `d` 합 == 갱신된 `n`
- [ ] 템플릿의 `__DATA__` 가 정확히 1개, 조립 후 0개
- [ ] index.html 안 `const DB = ` 블록이 유효 JSON으로 파싱되고 `node --check` 통과
- [ ] hc20을 공식으로 새로 계산했고 직전 값과 다르면 변화량을 답변에 명시
- [ ] `whs.py` 실행 후 마지막 라운드 `whs`가 null이 아님, 기본값 사용 여부를 답변에 명시
- [ ] 추정값(drvDist 등)을 답변에 명시
- [ ] GitHub 푸시 완료(`git log origin/main -1`로 확인)

## 5. 자주 나오는 함정
- **파3의 Tempo/Dist는 "-"** → null, `nd` 카운터도 올리지 않음
- **골프장 표기 불일치**: `rounds`는 축약형("레이크사이드"), `lastRound`는 원문("레이크사이드 CC")
- **hc20을 직전 값 복사로 두지 말 것** — 2026-08~11에 4.8로 고정되는 문제가 있었음(2026-11-08 No.839~848 재계산으로 수정)
- **퍼트 총합을 헤더 평균에서 역산하지 말 것** — 반드시 홀별 상세 합계 사용
- **템플릿 안 주석·문자열에 `__DATA__` 를 쓰지 말 것** — 치환이 두 곳에 일어남
- **데이터는 항상 GitHub에서** — 지식 폴더 Projects 읽기는 약 256KB까지만 읽혀 1.1MB인 golf_db.json이 잘린다. 잘린 데이터로 덮어쓰면 기록이 사라진다

## 6. GNB 월례회 연결 (2026-11-16 추가)

**원칙: GNB 랭킹의 원본은 GNB 쪽, 정보는 GNB → 개인 한 방향.**
- GNB 순위·넷·포인트는 월례회 기록만으로 정해진다(원본: GNB 지식폴더의 `GNB_시즌결과_2026.csv` → `gnb_dashboard.py` → Cloudflare). 개인 라운드는 GNB 랭킹에 절대 반영하지 않는다
- 여기에는 Steve(윤성렬/올드헤드) 행만 옮겨 와 `rounds[*].gnb = "베크포9월"`처럼 **표시만** 붙인다. 다른 회원 데이터는 넣지 않는다
- 개인 `gross`·통계·WHS는 그대로. 스코어가 다르면 `match:"score"`로 보고만 하고 자동 수정 금지(대시보드에 'GNB 엑셀 N타 · 확인 필요'로 표시)
- **GNB 엑셀은 수기 기록이라 틀릴 수 있다.** 불일치는 어느 쪽이 맞는지 Steve에게 확인을 요청하고, GNB 쪽이 틀렸으면 클럽 기록 수정은 GNB 쪽에서 한다
- 같은 달·같은 골프장 후보가 여럿일 때 gross 일치로 고르는 규칙도 엑셀 오기에 취약하다 — 이 경우 매칭 결과를 답변에 명시

**매칭 규칙**: 같은 연·월 + 같은 골프장(`베크포→베어크리크포천`, `베크춘→베어크리크춘천`, `올드→라비에벨`, `뉴서울→뉴서울`). 후보가 여럿이면 gross가 같은 라운드. GNB CSV에는 날짜가 없고 월만 있으므로 이 규칙에 의존한다

**새 월례회가 끝나면**
1. 개인 라운드를 평소대로 추가(0장)
2. GNB 시즌 CSV 최신본을 받아 `python3 gnb_link.py --csv GNB_시즌결과_2026.csv` → Steve 행 중 새 event만 추가 후 재연결(중복 무시)
   - CSV가 없으면 `db['gnb']['events']`에 `{season, event, code, club, sub, gross}` 한 줄을 직접 추가하고 `python3 gnb_link.py`
3. 출력의 `일치/스코어 다름/개인 기록 없음` 건수를 답변에 명시
4. 2027 시즌부터는 `--csv` 가져오기의 `season` 기본값(2026)을 바꿀 것

**초기 적재(2026-11-16)**: 2025 7건(클럽 엑셀 `25스코어` 시트) + 2026 7건(`GNB_시즌결과_2026.csv` 9/16판) = 14건, 일치 13 / 스코어 다름 1(2026 베크포4월 GNB 82 vs 개인 No.800 83). 9/16 이후 월례회는 9/16판 CSV에 없음 → 최신 CSV를 받으면 2번 절차로 추가

**대시보드**: 기록 탭 'GNB 월례회' 카드(월례회 평균 vs 같은 기간 평소, 출전 목록) + 라운드 목록의 `GNB` 배지. `DB.gnb`가 비어 있으면 카드는 숨겨진다

