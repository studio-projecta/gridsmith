import type { GridLayout, CellSlot, CellTransform, FitMode, VAlign } from '../types'

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
 * 셀 안쪽 여백을 적용한 이미지 배치 영역(출력 px). 여백 = 전역 cellPadX/Y + 셀별 transform.padX/Y.
 * 이미지는 이 영역 기준으로 fit/align/scale/offset 이 계산되고 이 영역으로 클립돼, 바깥은 배경이 보인다.
 * 여백이 셀을 삼켜 폭/높이가 0 이하가 되지 않도록 각 축에서 최소 1px 콘텐츠를 남긴다.
 */
export function cellContentRect(layout: GridLayout, index: number, transform?: CellTransform): Rect {
  const cell = cellRect(layout, index)
  const padX = (layout.cellPadX ?? 0) + (transform?.padX ?? 0)
  const padY = (layout.cellPadY ?? 0) + (transform?.padY ?? 0)
  const ipx = Math.min(Math.max(padX, 0), (cell.w - 1) / 2)
  const ipy = Math.min(Math.max(padY, 0), (cell.h - 1) / 2)
  return { x: cell.x + ipx, y: cell.y + ipy, w: cell.w - 2 * ipx, h: cell.h - 2 * ipy }
}

/**
 * 셀 안에 그릴 이미지의 사각형(출력 px 좌표계).
 * fit(cover/contain) 기준 base 배율에 transform.scale 을 곱하고, 세로는 align(top/center/bottom)
 * 으로 정렬한 뒤 transform 의 offsetX/Y(-1..1) 로 셀 절반 기준 평행이동(미세조정)한다.
 * align 은 그리드 전역값이라 모든 셀에 동일하게 적용되고, transform 은 셀별 미세조정값이다.
 * 편집 미리보기(DOM)와 Canvas 합성이 이 함수를 공유해 WYSIWYG 를 보장한다.
 */
export function imageRect(
  cell: Rect,
  imgW: number,
  imgH: number,
  fit: FitMode,
  align: VAlign = 'center',
  transform?: CellTransform,
): Rect {
  const scale = transform?.scale ?? 1
  const offsetX = transform?.offsetX ?? 0
  const offsetY = transform?.offsetY ?? 0
  const base =
    fit === 'cover'
      ? Math.max(cell.w / imgW, cell.h / imgH)
      : Math.min(cell.w / imgW, cell.h / imgH)
  const dw = imgW * base * scale
  const dh = imgH * base * scale
  // align 으로 이미지 세로 위치를 정한다: top=이미지 윗변을 셀 윗변에, bottom=아랫변을 셀 아랫변에.
  const alignCy =
    align === 'top'
      ? cell.y + dh / 2
      : align === 'bottom'
        ? cell.y + cell.h - dh / 2
        : cell.y + cell.h / 2
  // offset(-1..1) 은 셀 절반 기준이라 ×(cell.w/2), ×(cell.h/2).
  const cx = cell.x + cell.w / 2 + (offsetX * cell.w) / 2
  const cy = alignCy + (offsetY * cell.h) / 2
  return { x: cx - dw / 2, y: cy - dh / 2, w: dw, h: dh }
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/**
 * 레이아웃을 factor 배로 균일 스케일한다. gap·바깥/안쪽 여백·테두리·셀별 여백은 모두 절대 px 라,
 * 출력 크기와 같은 배율로 함께 스케일해야 셀 사각형(cellRect) 비율이 보존된다. 이 값들을 고정하면
 * 비율이 틀어져 cover 클립량이 달라지고 이미지 사이드가 잘린다.
 * offset(-1..1)/scale 은 크기 비의존값이라 스케일하지 않는다. undefined 여백은 유지해 gap 폴백을 보존한다.
 */
export function scaleLayoutBy(layout: GridLayout, factor: number): GridLayout {
  const s = (v: number | undefined) => (v === undefined ? undefined : Math.round(v * factor))
  return {
    ...layout,
    outputWidth: Math.round(layout.outputWidth * factor),
    outputHeight: Math.round(layout.outputHeight * factor),
    gap: Math.round(layout.gap * factor),
    borderWidth: Math.round((layout.borderWidth ?? 0) * factor),
    marginX: s(layout.marginX),
    marginY: s(layout.marginY),
    cellPadX: s(layout.cellPadX),
    cellPadY: s(layout.cellPadY),
    cells: layout.cells.map((c) =>
      c
        ? { ...c, transform: { ...c.transform, padX: s(c.transform.padX), padY: s(c.transform.padY) } }
        : c,
    ),
  }
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
