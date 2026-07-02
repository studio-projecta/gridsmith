# ImageGen — 진행상황

이미지 그리드 합성 웹앱. 그룹유형별로 이미지를 업로드해 그리드(예: 5×5)로 배치하고 하나의 이미지로 합쳐 다운로드한다. 순수 프론트엔드(서버 없음), 데이터는 브라우저 IndexedDB에 저장.

## 아키텍처 요약

- **스택**: React 18 + Vite + TypeScript, Zustand(상태), @dnd-kit(드래그), idb(IndexedDB), Canvas(합성)
- **저장**: IndexedDB object store 3개 — `types`, `images`(Blob 포함), `layouts`(typeId 키)
- **핵심 설계**: 편집 미리보기(DOM)와 내보내기(Canvas)가 동일한 배치 수식(`src/lib/layout.ts`)을 공유 → WYSIWYG 보장
- **드래그 2종**: 툴바 모드 토글 — "재배치"(셀 스왑) / "미세조정"(셀 내 offset·scale)

### 배치 수식
```
cellW = (outputWidth  - gap*(cols+1)) / cols
cellH = (outputHeight - gap*(rows+1)) / rows
cell(i).x = gap + col*(cellW+gap);  cell(i).y = gap + row*(cellH+gap)
```
셀 내 이미지: fit(cover/contain) base 크기 × transform.scale, transform.offset 로 평행이동.

### 데이터 모델 (src/types.ts)
GroupType, StoredImage(blob), CellTransform(offsetX/Y, scale), CellSlot(imageId, transform), GridLayout(rows/cols, cells[], bgColor, outputW/H, gap, fit)

## 구현 체크리스트

- [x] 1. Vite React-TS 스캐폴딩 + 의존성 설치 — `npm run build` 성공
- [x] 2. 타입 정의 + IndexedDB 계층(`src/db/idb.ts`) + Zustand 스토어(`src/store/useStore.ts`) 하이드레이션
- [x] 3. App 셸 + TypeSidebar + ImageUploader + ImageTray — 빌드/서버 정상
- [x] 4. `layout.ts` + GridEditor/GridCell(재배치 모드) + ControlPanel
- [x] 5. 미세조정 모드(offset/scale 드래그 + 슬라이더 + 휠)
- [x] 6. `compose.ts` + ExportButton (Canvas → PNG/JPEG 다운로드)

## 최종 검증 (E2E) — 통과 ✅
Playwright E2E(`e2e/grid.spec.ts`)로 자동 검증: 유형 생성 → 이미지 4장 업로드 → 2×2·gap20·400×400·배경 magenta 설정 → 자동채우기 → 내보내기 PNG 를 다시 디코드해 **크기 400×400 / 배경 magenta / 셀0=red·셀1=green(순서·배치)** 확인 → 새로고침 후 4셀 유지(영속성).

실행: `npm run dev` (개발), `npm run test:e2e` (E2E), `npm run build` (타입체크+빌드).

## 조작 방법 요약
- 좌측: 그룹유형 추가/선택(더블클릭 이름변경, ✕ 삭제)
- 상단: 이미지 업로드(클릭/드래그) → 썸네일 트레이
- 툴바: **재배치**(셀↔셀 드래그 스왑, 트레이→셀 드래그) / **미세조정**(셀 클릭 후 이미지 드래그·휠 확대, 우측 슬라이더) 모드 전환, 자동채우기/비우기, 내보내기(PNG/JPEG)
- 우측: 행/열, gap, 셀맞춤(cover/contain), 출력 px(+프리셋), 배경색
