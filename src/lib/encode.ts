import { optimise } from '@jsquash/oxipng'

export type ImageFormat = 'png' | 'jpeg'

export interface EncodeResult {
  blob: Blob
  // 최적화 전(canvas 원본) 바이트. PNG 만 optimise 를 거치므로 JPEG 는 blob.size 와 같다.
  rawSize: number
}

// oxipng 무손실 최적화 레벨(0-6). 6 은 최대 압축이며 가장 느리다.
const PNG_OPT_LEVEL = 6

/**
 * 캔버스를 Blob 으로 인코딩한다. 분할·합성 등 모든 출력 경로가 공유한다.
 * PNG 는 oxipng 로 무손실 재압축해 용량을 줄인다(디코드 결과 픽셀 동일).
 * JPEG 는 손실 포맷이라 무손실 재압축 이득이 없어 canvas 결과를 그대로 쓴다.
 * rawSize 로 최적화 전 크기를 함께 돌려줘 호출부가 절감량을 표시할 수 있다.
 */
export async function encodeCanvas(
  canvas: HTMLCanvasElement,
  format: ImageFormat,
  quality = 0.92,
): Promise<EncodeResult> {
  const mime = format === 'png' ? 'image/png' : 'image/jpeg'
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mime, quality),
  )
  if (!blob) throw new Error('이미지 생성에 실패했습니다.')
  if (format !== 'png') return { blob, rawSize: blob.size }

  const optimised = await optimise(await blob.arrayBuffer(), { level: PNG_OPT_LEVEL })
  return { blob: new Blob([optimised], { type: 'image/png' }), rawSize: blob.size }
}
