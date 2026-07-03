export interface GroupType {
  id: string
  name: string
  createdAt: number
}

export interface StoredImage {
  id: string
  typeId: string
  name: string
  blob: Blob
  /** 에디터 미리보기용 다운스케일 썸네일. 원본은 blob(내보내기 품질용). 과거 이미지엔 없을 수 있음. */
  thumbBlob?: Blob
  width: number
  height: number
}

/** 셀 내 이미지 미세 이동/확대. */
export interface CellTransform {
  /** -1..1, 셀 폭 기준 정규화 오프셋. */
  offsetX: number
  /** -1..1, 셀 높이 기준 정규화 오프셋. */
  offsetY: number
  /** 1 = fit(cover/contain) 기준 배율. */
  scale: number
}

export interface CellSlot {
  imageId: string
  transform: CellTransform
}

export type FitMode = 'cover' | 'contain'
/** 셀 안 이미지의 세로 정렬(전체 셀 일괄 적용). */
export type VAlign = 'top' | 'center' | 'bottom'

/**
 * 드래그 중 드롭 조준 상태. 포인터가 셀 경계 근처면 insert(사이=밀기),
 * 셀 중앙이면 cell(빈 칸=이동 / 있는 칸=자리바꿈).
 * insert.index 는 읽기순서상 삽입 위치(0..N).
 */
export type DropIntent =
  | { kind: 'insert'; index: number }
  | { kind: 'cell'; index: number; mode: 'move' | 'swap' }

/** 유형당 1개. cells 길이 = rows*cols, 행 우선(row-major). */
export interface GridLayout {
  typeId: string
  rows: number
  cols: number
  cells: (CellSlot | null)[]
  bgColor: string
  /** true 면 배경을 채우지 않음(투명). PNG 에서만 유지되고 JPEG 은 검정으로 채워짐. */
  transparentBg: boolean
  outputWidth: number
  outputHeight: number
  /** 셀 간격(출력 px 기준). marginX/Y 미지정 시 바깥 여백에도 적용. */
  gap: number
  /**
   * 바깥 여백(출력 px). marginX=좌우, marginY=상하.
   * 미지정이면 gap 을 바깥 여백으로 쓴다. 지정하면 셀 간 gap 과 독립적으로 바깥만 이 크기로 비워,
   * gap 이 달라도 바깥 라인이 여백값으로 고정된다.
   */
  marginX?: number
  marginY?: number
  fit: FitMode
  /** 셀 안 이미지의 세로 정렬. 없으면 'center'(과거 레이아웃 호환). */
  align?: VAlign
  /**
   * true 면 출력 크기를 그리드 첫 배치 셀 이미지의 원본 크기 × 그리드 기준으로 자동 계산한다.
   * 사용자가 출력 px 를 직접 지정하면 false 로 고정된다.
   */
  autoSize: boolean
}

export const DEFAULT_TRANSFORM: CellTransform = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
}

export function makeDefaultLayout(typeId: string): GridLayout {
  const rows = 5
  const cols = 5
  return {
    typeId,
    rows,
    cols,
    cells: new Array(rows * cols).fill(null),
    bgColor: '#ffffff',
    transparentBg: false,
    outputWidth: 1500,
    outputHeight: 1500,
    gap: 0,
    fit: 'cover',
    align: 'center',
    autoSize: true,
  }
}

/** 셀=이미지 원본 크기가 되도록 출력 px 를 계산. cellRect 의 역산과 일치한다. */
export function computeAutoOutput(
  rows: number,
  cols: number,
  gap: number,
  imgW: number,
  imgH: number,
  marginX?: number,
  marginY?: number,
): { outputWidth: number; outputHeight: number } {
  const mx = marginX ?? gap
  const my = marginY ?? gap
  return {
    outputWidth: Math.round(imgW * cols + gap * (cols - 1) + mx * 2),
    outputHeight: Math.round(imgH * rows + gap * (rows - 1) + my * 2),
  }
}

/**
 * rows/cols 변경 시 셀 내용을 읽기순서(행 우선, 선형 인덱스) 기준으로 리플로우한다.
 * 열을 줄이면 넘치는 항목이 다음 줄로 밀리고, 늘리면 위로 당겨진다.
 * 배치된 이미지가 모두 담기도록 필요하면 행 수를 늘려(never-lose) requestedRows 를 상한이 아닌 하한으로 취급한다.
 */
export function reflowCells(
  cells: (CellSlot | null)[],
  requestedRows: number,
  newCols: number,
): { rows: number; cells: (CellSlot | null)[] } {
  let lastFilled = -1
  for (let i = 0; i < cells.length; i++) if (cells[i]) lastFilled = i
  const neededRows = lastFilled >= 0 ? Math.floor(lastFilled / newCols) + 1 : 0
  const rows = Math.max(1, requestedRows, neededRows)
  const size = rows * newCols
  const next: (CellSlot | null)[] = new Array(size).fill(null)
  for (let i = 0; i < Math.min(cells.length, size); i++) next[i] = cells[i] ?? null
  return { rows, cells: next }
}
