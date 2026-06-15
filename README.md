# 골프 라운드 분석 앱 — 자동 입력 버전

보이스캐디 스코어카드 캡처를 웹에서 올리면 자동으로 18홀을 읽어 기록이 갱신됩니다.
정적 페이지 + Netlify Functions + Netlify Blobs(무료) + Claude 비전 API로 동작합니다.

## 구조

```
golf-app/
├── public/index.html          앱 (런타임에 /api/data 로 데이터 로드 + 라운드 추가 UI)
├── netlify/functions/
│   ├── get-data.mjs           GET  /api/data          → rounds+holeData+streak 반환
│   ├── extract-round.mjs      POST /api/extract-round  → 캡처 이미지 판독(검증만, 저장X)
│   ├── commit-round.mjs       POST /api/commit-round   → 확인된 라운드 저장 + 집계 갱신
│   └── export-xlsx.mjs        GET  /api/export-xlsx    → 엑셀(Data+HoleData) 다운로드
├── lib/golf.mjs               핵심 계산(추출·집계·스트릭·코스명 정규화) — 실측 검증 완료
├── lib/store.mjs              Netlify Blobs 접근 + 최초 1회 시드
├── data/*.json                시드용 현재 데이터(815R / 30코스 / 스트릭)
├── netlify.toml, package.json
└── scripts/build.mjs          app_template.html → public/index.html 재생성용
```

## 데이터 원본(source of truth)
- 첫 배포 후 `/api/data` 최초 호출 때 `data/*.json`이 **Netlify Blobs로 1회 시드**됩니다.
- 이후 모든 추가/갱신은 Blobs에 저장되고, 페이지는 새로고침만으로 즉시 반영됩니다. (재빌드 불필요)

## 셋업 (1회, 전부 무료)

### 1) Anthropic API 키 발급
- console.anthropic.com → API Keys → 키 생성 → 복사 (캡처 판독용, 1장당 수 센트)

### 2) GitHub에 코드 올리기
- 새 저장소 생성 후 이 폴더 전체를 푸시 (`node_modules`는 올리지 않음 — `.gitignore` 포함됨)
- GitHub 웹에서 직접 업로드해도 됩니다.

### 3) Netlify에 연결
- Netlify → **Add new project → Import an existing project → GitHub** → 저장소 선택
- 빌드 설정: Publish directory `public`, 빌드 명령 비워둠(이미 빌드된 index.html 포함). 함수는 `netlify.toml`로 자동 인식.
- **환경변수 추가**: Site configuration → Environment variables → `ANTHROPIC_API_KEY` = 발급한 키
  - (선택) `VISION_MODEL` 로 모델 변경 가능. 기본 `claude-sonnet-4-6`, 비용 절감 시 `claude-haiku-4-5-20251001`.
- Deploy → 완료. 사이트 접속 시 자동 시드됩니다.

### 4) 도메인
- 기존 `golfdataanalytics.netlify.app`는 드래그&드롭 사이트였으므로, 새 저장소 기반 사이트로 도메인을 옮기거나 새 주소를 쓰면 됩니다. (Netlify Domain management에서 이전 가능)

## 사용
1. 앱 우하단 **＋** 버튼 → 보이스캐디 캡처 선택 → **분석하기**
2. 자동으로 읽힌 18홀 표가 뜨고 합계 검증 결과 표시 → 필요시 셀 직접 수정
3. **저장** → Blobs 갱신 → 화면 자동 새로고침

## 알아둘 점 / 한계
- **캡처에 없는 필드**(net, 페어웨이 fw/fwp, 업앤다운 uda/udq, hc20)는 자동으로 채워지지 않고 `null`로 둡니다. 필요하면 나중에 보강 가능.
- **스트릭은 라운드 내 판정**(연속 버디/파, 사이클링 버디). 라운드 경계를 넘는 연속은 계산하지 않습니다(기존 데이터 방식과 동일).
- **엑셀 내보내기**의 `HoleData` 시트는 앱으로 추가한 라운드의 홀별 원시행만 누적됩니다. 과거 1,116행 전체가 필요하면, 기존 마스터 엑셀을 한 번 시드하는 작업을 별도로 진행하면 됩니다. (차트가 들어간 마스터 워크북 자동 동기화는 범위에서 제외)
- 중복 방지: 같은 날짜+코스 라운드는 거부됩니다.

## 검증 완료(실측)
2026-06-13 잭니클라우스(78타) 캡처로 추출한 값이 기존 저장본과 **불일치 0**:
gross 78 · putts 27 · p3 1 · gir 6 · girp 0.3333 · 버디1·파13·보기3·트리플+1.
hole_data 증분 갱신 라운드트립 복원 일치, 스트릭 불변 확인.
