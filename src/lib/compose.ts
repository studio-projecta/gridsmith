import type { GridLayout, StoredImage } from '../types'
import { cellRect, imageRect } from './layout'

/**
 * 레이아웃을 outputWidth×outputHeight 캔버스에 합성해 Blob 으로 반환.
 * 셀 사각형/이미지 배치는 편집 미리보기와 동일한 layout.ts 수식을 사용한다.
 */
export async function composeToBlob(
  layout: GridLayout,
  images: StoredImage[],
  format: 'png' | 'jpeg',
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

  const imgMap = new Map(images.map((i) => [i.id, i]))

  for (let i = 0; i < layout.cells.length; i++) {
    const slot = layout.cells[i]
    if (!slot) continue
    const meta = imgMap.get(slot.imageId)
    if (!meta) continue

    const bitmap = await createImageBitmap(meta.blob)
    const cell = cellRect(layout, i)
    const ir = imageRect(cell, meta.width, meta.height, layout.fit, layout.align)

    ctx.save()
    ctx.beginPath()
    ctx.rect(cell.x, cell.y, cell.w, cell.h)
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

  const mime = format === 'png' ? 'image/png' : 'image/jpeg'
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mime, quality),
  )
  if (!blob) throw new Error('이미지 생성에 실패했습니다.')
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
