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
  /** 셀 간격(출력 px 기준). 바깥 여백에도 동일 적용. */
  gap: number
  fit: FitMode
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
): { outputWidth: number; outputHeight: number } {
  return {
    outputWidth: Math.round(imgW * cols + gap * (cols + 1)),
    outputHeight: Math.round(imgH * rows + gap * (rows + 1)),
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
