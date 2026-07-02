import type { GridLayout, CellTransform, FitMode, VAlign } from '../types'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** 출력 px 좌표계에서 index 번째 셀의 사각형. gap 은 바깥 여백에도 동일 적용. */
export function cellRect(layout: GridLayout, index: number): Rect {
  const { rows, cols, gap, outputWidth, outputHeight } = layout
  const cellW = (outputWidth - gap * (cols + 1)) / cols
  const cellH = (outputHeight - gap * (rows + 1)) / rows
  const col = index % cols
  const row = Math.floor(index / cols)
  return {
    x: gap + col * (cellW + gap),
    y: gap + row * (cellH + gap),
    w: cellW,
    h: cellH,
  }
}

/**
 * 셀 안에 그릴 이미지의 사각형(출력 px 좌표계).
 * fit(cover/contain) 기준 base 배율에 transform.scale 을 곱하고,
 * 세로는 align(top/center/bottom) 으로 정렬한 뒤 offsetX/Y(-1..1) 로 평행이동한다.
 * 편집 미리보기(DOM)와 Canvas 합성이 이 함수를 공유해 WYSIWYG 를 보장한다.
 */
export function imageRect(
  cell: Rect,
  imgW: number,
  imgH: number,
  fit: FitMode,
  transform: CellTransform,
  align: VAlign = 'center',
): Rect {
  const base =
    fit === 'cover'
      ? Math.max(cell.w / imgW, cell.h / imgH)
      : Math.min(cell.w / imgW, cell.h / imgH)
  const dw = imgW * base * transform.scale
  const dh = imgH * base * transform.scale
  // align 으로 이미지 세로 중심을 정한다: top=이미지 윗변을 셀 윗변에, bottom=아랫변을 셀 아랫변에.
  const alignCy =
    align === 'top'
      ? cell.y + dh / 2
      : align === 'bottom'
        ? cell.y + cell.h - dh / 2
        : cell.y + cell.h / 2
  const cx = cell.x + cell.w / 2 + (transform.offsetX * cell.w) / 2
  const cy = alignCy + (transform.offsetY * cell.h) / 2
  return { x: cx - dw / 2, y: cy - dh / 2, w: dw, h: dh }
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}
