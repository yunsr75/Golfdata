# 골프 데이터 대시보드 업데이트 가이드

Steve의 골프 스코어카드 스크린샷을 받아 대시보드를 업데이트하는 표준 절차.

**데이터 원본(source of truth)은 GitHub 저장소 `yunsr75/Golfdata`다.**
claude.ai 지식 폴더에는 데이터를 두지 않는다(용량 절약 + 1.1MB 파일이 앞부분만 읽히는 문제 회피).
`index.html`은 매번 `app_template.html` + `golf_db.json`으로 새로 조립하는 배포용 산출물이며,
Netlify 업로드는 Steve가 직접 한다.

> 마지막 업데이트: 2026-10-25 (No.843 한성 CC 2026-10-23까지, 총 840라운드).

## 0. 새 라운드가 올라오면 (매번 이 순서)

1. **저장소 연결·최신 데이터 가져오기**
   - 세션에 저장소가 없으면 `add_repo`(owner `yunsr75`, repo `Golfdata`, access `push`)로 연결
   - `git clone --depth 1 https://github.com/yunsr75/golfdata` (이미 있으면 `git pull`)
   - 반드시 GitHub의 `golf_db.json`을 기준으로 작업. 대화·지식 폴더의 옛 사본을 쓰지 말 것
2. **스크린샷 판독 → `golf_db.json` 갱신** (아래 2~3장 절차, 4장 체크리스트)
   - 쓸 때 형식 유지: `json.dump(db, f, ensure_ascii=False, indent=1)`
   - 기존 라운드·holeData가 원본과 동일한지(신규 분만 바뀌었는지) 검산
3. **`index.html` 조립·검증** (3장 Step 6)
4. **GitHub에 커밋·푸시**: `golf_db.json`, `index.html`(템플릿·README가 바뀌었으면 함께)
   - 커밋 메시지 예: `Add round No.844 (2026-11-01 코스명 78)`
   - 푸시 전 `git fetch origin main` 후 앞서 있는지 확인
5. **Steve에게 `index.html` 전달** → Steve가 Netlify에 직접 업로드

## 1. 파일 구성

| 파일 | 위치 | 내용 |
|---|---|---|
| `golf_db.json` | GitHub | 통합 데이터. 최상위 4개 키: `rounds` / `lastRound` / `holeData` / `streaks` |
| `app_template.html` | GitHub | 자리표시자 `__DATA__` 가 **정확히 1개** 있는 템플릿 (`const DB = __DATA__;`) |
| `index.html` | GitHub + Netlify(Steve 직접 업로드) | 템플릿의 `__DATA__` 를 golf_db.json 전체로 치환한 결과물. 직접 편집 금지 |

`golf_db.json`의 4개 키 내용:

| 키 | 내용 |
|---|---|
| `rounds` | 전체 라운드 배열(2015~현재). 라운드당 1개 객체 |
| `lastRound` | 가장 최근 라운드의 홀별 상세 기록 |
| `holeData` | 골프장별 홀별 누적 통계(평균 타수, GIR%, 퍼트, 페널티, 스코어 분포) |
| `streaks` | 버디/파 연속 기록(올타임 최고 + 현재 진행 중) |

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
- `hc20`은 앱 내부 계산값이라 재현 불가 → 직전 라운드 값 유지

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

### Step 5 — `DB.streaks` 갱신 (필요 시에만)
- 18홀을 순서대로 이어 "파 이하" 연속을 기존 `parCur`에 이어서 계산
- `parBest` 초과 시 `parBest`/`parHoles` 갱신, 아니면 `parCur`만. 보기로 끝나면 `parCur`=0
- 버디 스트릭(`birBest`/`birCur`/`birHoles`)도 동일, 기준은 `score-par <= -1`
- 대부분의 라운드는 경신 없이 `parCur`/`birCur`만 0으로 갱신됨

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
- [ ] 추정/보류한 값(hc20, drvDist 등)을 답변에 명시
- [ ] GitHub 푸시 완료(`git log origin/main -1`로 확인)

## 5. 자주 나오는 함정
- **파3의 Tempo/Dist는 "-"** → null, `nd` 카운터도 올리지 않음
- **골프장 표기 불일치**: `rounds`는 축약형("레이크사이드"), `lastRound`는 원문("레이크사이드 CC")
- **hc20은 앱 내부값** — 재현 불가, 직전 값 유지
- **퍼트 총합을 헤더 평균에서 역산하지 말 것** — 반드시 홀별 상세 합계 사용
- **템플릿 안 주석·문자열에 `__DATA__` 를 쓰지 말 것** — 치환이 두 곳에 일어남
- **데이터는 항상 GitHub에서** — 지식 폴더 Projects 읽기는 약 256KB까지만 읽혀 1.1MB인 golf_db.json이 잘린다. 잘린 데이터로 덮어쓰면 기록이 사라진다
