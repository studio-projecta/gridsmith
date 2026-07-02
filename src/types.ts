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
export type EditMode = 'reorder' | 'adjust'

/** 유형당 1개. cells 길이 = rows*cols, 행 우선(row-major). */
export interface GridLayout {
  typeId: string
  rows: number
  cols: number
  cells: (CellSlot | null)[]
  bgColor: string
  outputWidth: number
  outputHeight: number
  /** 셀 간격(출력 px 기준). 바깥 여백에도 동일 적용. */
  gap: number
  fit: FitMode
  /**
   * true 면 출력 크기를 첫 이미지 원본 크기 × 그리드 기준으로 자동 계산한다.
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

/** rows/cols 변경 시 기존 셀 내용을 최대한 보존하며 배열 크기를 재조정. */
export function resizeCells(
  cells: (CellSlot | null)[],
  oldCols: number,
  newRows: number,
  newCols: number,
): (CellSlot | null)[] {
  const next: (CellSlot | null)[] = new Array(newRows * newCols).fill(null)
  const oldRows = oldCols > 0 ? Math.ceil(cells.length / oldCols) : 0
  for (let r = 0; r < Math.min(oldRows, newRows); r++) {
    for (let c = 0; c < Math.min(oldCols, newCols); c++) {
      next[r * newCols + c] = cells[r * oldCols + c] ?? null
    }
  }
  return next
}
