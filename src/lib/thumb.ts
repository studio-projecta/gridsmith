// 에디터는 원본 대신 이 썸네일을 렌더해 그리드가 커져도 디코드 부하를 낮춘다.
const THUMB_MAX_EDGE = 256

export interface ImageMeta {
  width: number
  height: number
  thumbBlob: Blob
}

/** 원본 blob 1회 디코드로 원본 크기와 다운스케일 썸네일(PNG)을 함께 만든다. */
export async function decodeMeta(blob: Blob): Promise<ImageMeta> {
  const bitmap = await createImageBitmap(blob)
  const { width, height } = bitmap
  const scale = Math.min(1, THUMB_MAX_EDGE / Math.max(width, height))
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    // 폴백: 썸네일 생성 불가 시 원본을 그대로 미리보기에 쓴다.
    return { width, height, thumbBlob: blob }
  }
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const thumb = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
  return { width, height, thumbBlob: thumb ?? blob }
}
