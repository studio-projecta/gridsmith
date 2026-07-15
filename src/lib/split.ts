// 이미지 한 장을 cols×rows 로 분할한다. 셀 사이에 sep(px) 폭의 구분선이 있다고 보고
// 그 구분선을 버리며 잘라낸다: 최종 셀 = floor((변-구분선총합)/개수). 나눠떨어지지 않는
// 나머지 px 는 우측·하단에서 버린다(모든 셀이 동일 크기가 되도록).

import { encodeCanvas, type ImageFormat } from './encode'

export interface SplitRect {
  r: number
  c: number
  sx: number
  sy: number
}

export interface SplitGeometry {
  cellW: number
  cellH: number
  droppedX: number
  droppedY: number
  rects: SplitRect[]
}

export function computeSplitGeometry(
  W: number,
  H: number,
  cols: number,
  rows: number,
  sep: number,
): SplitGeometry {
  const usableW = W - (cols - 1) * sep
  const usableH = H - (rows - 1) * sep
  const cellW = Math.floor(usableW / cols)
  const cellH = Math.floor(usableH / rows)
  const droppedX = usableW - cellW * cols
  const droppedY = usableH - cellH * rows

  const rects: SplitRect[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      rects.push({ r, c, sx: c * (cellW + sep), sy: r * (cellH + sep) })
    }
  }
  return { cellW, cellH, droppedX, droppedY, rects }
}

export interface SplitFile {
  name: string
  blob: Blob
}

export interface SplitResult {
  files: SplitFile[]
  // 최적화 전/후 총 바이트(모든 조각 합). PNG 최적화 절감량 표시에 쓴다.
  rawBytes: number
  optBytes: number
}

/** 이미지를 분할해 각 셀을 개별 Blob 으로 반환한다(행 우선 rNcM 명명). */
export async function splitImage(
  file: Blob,
  cols: number,
  rows: number,
  sep: number,
  format: ImageFormat,
  quality = 0.92,
): Promise<SplitResult> {
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) {
    throw new Error('분할 수는 1 이상의 정수여야 합니다.')
  }

  const bitmap = await createImageBitmap(file)
  try {
    const geo = computeSplitGeometry(bitmap.width, bitmap.height, cols, rows, sep)
    if (geo.cellW < 1 || geo.cellH < 1) {
      throw new Error('분할 수가 이미지 크기에 비해 너무 큽니다.')
    }

    const { cellW, cellH } = geo
    const canvas = document.createElement('canvas')
    canvas.width = cellW
    canvas.height = cellH
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d context 를 생성할 수 없습니다.')

    const ext = format
    const files: SplitFile[] = []
    let rawBytes = 0
    let optBytes = 0
    for (const { r, c, sx, sy } of geo.rects) {
      // JPEG 는 알파가 없으므로 이전 셀의 잔상을 지우려 매 셀 클리어.
      ctx.clearRect(0, 0, cellW, cellH)
      ctx.drawImage(bitmap, sx, sy, cellW, cellH, 0, 0, cellW, cellH)
      const { blob, rawSize } = await encodeCanvas(canvas, format, quality)
      rawBytes += rawSize
      optBytes += blob.size
      files.push({ name: `r${r + 1}c${c + 1}.${ext}`, blob })
    }
    return { files, rawBytes, optBytes }
  } finally {
    bitmap.close()
  }
}

// 확장자를 떼고 경로 구분자만 정리해 ZIP 폴더 이름으로 쓴다(한글·공백 유지).
export function folderBase(name: string): string {
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  return stem.replace(/[/\\]+/g, '_').trim() || 'image'
}

/**
 * 여러 이미지를 같은 비율로 분할해 하나의 파일 목록으로 반환한다.
 * 2장 이상이면 원본 파일명 폴더로 묶어 조각을 담고(중복명은 -1,-2), 1장이면 평면 이름을 쓴다.
 */
export async function splitFiles(
  inputs: { name: string; blob: Blob }[],
  cols: number,
  rows: number,
  sep: number,
  format: ImageFormat,
  quality = 0.92,
): Promise<SplitResult> {
  const single = inputs.length === 1
  const seen = new Map<string, number>()
  const out: SplitFile[] = []
  let rawBytes = 0
  let optBytes = 0
  for (const input of inputs) {
    const res = await splitImage(input.blob, cols, rows, sep, format, quality)
    rawBytes += res.rawBytes
    optBytes += res.optBytes
    if (single) {
      out.push(...res.files)
      continue
    }
    let base = folderBase(input.name)
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    if (n > 0) base = `${base}-${n}`
    for (const p of res.files) out.push({ name: `${base}/${p.name}`, blob: p.blob })
  }
  return { files: out, rawBytes, optBytes }
}
