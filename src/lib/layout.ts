import type { GridLayout, CellSlot, FitMode, VAlign } from '../types'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** 출력 px 좌표계에서 index 번째 셀의 사각형. 바깥 여백은 marginX/Y(미지정 시 gap), 셀 사이만 gap. */
export function cellRect(layout: GridLayout, index: number): Rect {
  const { rows, cols, gap, outputWidth, outputHeight } = layout
  const mx = layout.marginX ?? gap
  const my = layout.marginY ?? gap
  const cellW = (outputWidth - mx * 2 - gap * (cols - 1)) / cols
  const cellH = (outputHeight - my * 2 - gap * (rows - 1)) / rows
  const col = index % cols
  const row = Math.floor(index / cols)
  return {
    x: mx + col * (cellW + gap),
    y: my + row * (cellH + gap),
    w: cellW,
    h: cellH,
  }
}

/**
 * 셀 안에 그릴 이미지의 사각형(출력 px 좌표계).
 * fit(cover/contain) 기준 배율로 맞추고, 가로는 중앙, 세로는 align(top/center/bottom) 으로
 * 정렬한다. align 은 그리드 전역값이라 모든 셀에 동일하게 적용된다.
 * 편집 미리보기(DOM)와 Canvas 합성이 이 함수를 공유해 WYSIWYG 를 보장한다.
 */
export function imageRect(
  cell: Rect,
  imgW: number,
  imgH: number,
  fit: FitMode,
  align: VAlign = 'center',
): Rect {
  const base =
    fit === 'cover'
      ? Math.max(cell.w / imgW, cell.h / imgH)
      : Math.min(cell.w / imgW, cell.h / imgH)
  const dw = imgW * base
  const dh = imgH * base
  // align 으로 이미지 세로 위치를 정한다: top=이미지 윗변을 셀 윗변에, bottom=아랫변을 셀 아랫변에.
  const cy =
    align === 'top'
      ? cell.y + dh / 2
      : align === 'bottom'
        ? cell.y + cell.h - dh / 2
        : cell.y + cell.h / 2
  const cx = cell.x + cell.w / 2
  return { x: cx - dw / 2, y: cy - dh / 2, w: dw, h: dh }
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/**
 * 모든 칸이 빈 행/열을 제거해 그리드를 압축한다.
 * 셀 크기(cellW/cellH)는 유지하고 남은 행·열만큼 출력 크기를 다시 계산하므로,
 * 빈 여백이 사라지고 가로:세로 비율이 실제 배치에 맞게 재조정된다.
 * 제거할 빈 행/열이 없거나 배치된 셀이 하나도 없으면 원본을 그대로(동일 참조) 반환한다.
 */
export function trimEmptyLines(layout: GridLayout): GridLayout {
  const { rows, cols, cells, gap, outputWidth, outputHeight } = layout
  const rowKeep: boolean[] = new Array(rows).fill(false)
  const colKeep: boolean[] = new Array(cols).fill(false)
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i]) continue
    rowKeep[Math.floor(i / cols)] = true
    colKeep[i % cols] = true
  }
  const keptRows = rowKeep.filter(Boolean).length
  const keptCols = colKeep.filter(Boolean).length
  // 배치가 전혀 없으면 압축 기준이 없고, 뺄 게 없으면 변화가 없다.
  if (keptRows === 0 || keptCols === 0) return layout
  if (keptRows === rows && keptCols === cols) return layout

  const nextCells: (CellSlot | null)[] = []
  for (let r = 0; r < rows; r++) {
    if (!rowKeep[r]) continue
    for (let c = 0; c < cols; c++) {
      if (!colKeep[c]) continue
      nextCells.push(cells[r * cols + c] ?? null)
    }
  }

  // 셀 크기 유지 → 남은 행·열 기준으로 출력 크기 재계산(비율 재조정).
  // 바깥 여백은 marginX/Y(미지정 시 gap)로 고정, 셀 사이만 gap.
  const mx = layout.marginX ?? gap
  const my = layout.marginY ?? gap
  const cellW = (outputWidth - mx * 2 - gap * (cols - 1)) / cols
  const cellH = (outputHeight - my * 2 - gap * (rows - 1)) / rows
  return {
    ...layout,
    rows: keptRows,
    cols: keptCols,
    cells: nextCells,
    outputWidth: Math.round(cellW * keptCols + mx * 2 + gap * (keptCols - 1)),
    outputHeight: Math.round(cellH * keptRows + my * 2 + gap * (keptRows - 1)),
    // 출력 크기를 직접 재계산했으므로 autoSize 로 되돌려지지 않게 고정한다.
    autoSize: false,
  }
}
