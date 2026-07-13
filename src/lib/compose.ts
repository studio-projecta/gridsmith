import type { GridLayout, StoredImage } from '../types'
import { cellRect, cellContentRect, imageRect } from './layout'
import { encodeCanvas, type ImageFormat } from './encode'

/**
 * 레이아웃을 outputWidth×outputHeight 캔버스에 합성해 Blob 으로 반환.
 * 셀 사각형/이미지 배치는 편집 미리보기와 동일한 layout.ts 수식을 사용한다.
 */
export async function composeToBlob(
  layout: GridLayout,
  images: StoredImage[],
  format: ImageFormat,
  quality = 0.92,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = layout.outputWidth
  canvas.height = layout.outputHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context 를 생성할 수 없습니다.')

  // 배경 채우기. 투명 배경이면 채우지 않아 알파 0 으로 남는다(PNG 에서만 유지).
  // JPEG 는 알파가 없어 투명 영역이 검정으로 합성된다.
  if (!(layout.transparentBg && format === 'png')) {
    ctx.fillStyle = layout.bgColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  // 셀 배경: 각 셀 사각형만 채워 셀 간격·바깥 여백에는 bgColor 가 남는다.
  // 이미지보다 먼저 그려 내부 여백/contain 여백에 이 색이 비치게 한다.
  if (layout.cellBgColor) {
    ctx.fillStyle = layout.cellBgColor
    for (let i = 0; i < layout.cells.length; i++) {
      const cell = cellRect(layout, i)
      ctx.fillRect(cell.x, cell.y, cell.w, cell.h)
    }
  }

  const imgMap = new Map(images.map((i) => [i.id, i]))

  for (let i = 0; i < layout.cells.length; i++) {
    const slot = layout.cells[i]
    if (!slot) continue
    const meta = imgMap.get(slot.imageId)
    if (!meta) continue

    const bitmap = await createImageBitmap(meta.blob)
    // 안쪽 여백을 반영한 콘텐츠 영역으로 배치·클립해 미리보기와 동일하게 여백 바깥은 배경이 남는다.
    const content = cellContentRect(layout, i, slot.transform)
    const ir = imageRect(content, meta.width, meta.height, layout.fit, layout.align, slot.transform)

    ctx.save()
    ctx.beginPath()
    ctx.rect(content.x, content.y, content.w, content.h)
    ctx.clip()
    ctx.drawImage(bitmap, ir.x, ir.y, ir.w, ir.h)
    ctx.restore()
    bitmap.close()
  }

  // 배경 테두리: 출력 가장자리 안쪽에 stroke 로 얹는다. lineWidth 는 경로 중심 기준이라
  // 절반이 밖으로 잘리지 않도록 bw/2 만큼 안쪽으로 들여 그린다(전체가 캔버스 안에 들어옴).
  const bw = layout.borderWidth ?? 0
  if (bw > 0) {
    ctx.lineWidth = bw
    ctx.strokeStyle = layout.borderColor ?? '#000000'
    ctx.strokeRect(bw / 2, bw / 2, canvas.width - bw, canvas.height - bw)
  }

  const { blob } = await encodeCanvas(canvas, format, quality)
  return blob
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
