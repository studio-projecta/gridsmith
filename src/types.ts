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
