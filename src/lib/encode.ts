import { optimise } from '@jsquash/oxipng'
import { quantizePng } from './quantize'

export type ImageFormat = 'png' | 'jpeg'

export interface EncodeResult {
  blob: Blob
  // 최적화 전(canvas 원본) 바이트. 손실 폴백과 무관하게 절감 표시에 쓰인다.
  rawSize: number
  // 목표 용량을 맞추려 손실 압축(양자화/품질 저하)을 적용했는가. 무손실(oxipng)만이면 false.
  lossy: boolean
}

// oxipng 무손실 최적화 레벨(0-6). 6 은 최대 압축이며 가장 느리다.
const PNG_OPT_LEVEL = 6
// PNG 손실 폴백에서 시도하는 팔레트 색상 수(높은 품질부터 낮춰가며 목표 용량을 맞춘다).
const QUANT_STEPS = [256, 128, 64, 32, 16, 8, 4, 2]
// JPEG 손실 폴백에서 낮춰가는 품질 단계.
const JPEG_QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.25, 0.15]

function toBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('이미지 생성에 실패했습니다.'))),
      mime,
      quality,
    ),
  )
}

async function optimisePng(blob: Blob): Promise<Blob> {
  const optimised = await optimise(await blob.arrayBuffer(), { level: PNG_OPT_LEVEL })
  return new Blob([optimised], { type: 'image/png' })
}

/**
 * 캔버스를 Blob 으로 인코딩한다. 분할·리사이즈·합성 등 모든 출력 경로가 공유한다.
 * PNG 는 oxipng 로 무손실 재압축한다. targetBytes 가 주어지고 무손실 결과가 그보다 크면
 * libimagequant(WASM) 색상 양자화(손실, 디더링)로 색 수를 낮춰가며 목표 이하로 맞춘다(알파 보존).
 * JPEG 는 targetBytes 초과 시 quality 를 낮춰 맞춘다.
 * rawSize 로 최적화 전 크기를 함께 돌려줘 호출부가 절감량을 표시할 수 있다.
 */
export async function encodeCanvas(
  canvas: HTMLCanvasElement,
  format: ImageFormat,
  quality = 0.92,
  targetBytes?: number,
): Promise<EncodeResult> {
  const mime = format === 'png' ? 'image/png' : 'image/jpeg'
  const raw = await toBlob(canvas, mime, quality)
  const rawSize = raw.size

  if (format !== 'png') {
    if (!targetBytes || raw.size <= targetBytes) return { blob: raw, rawSize, lossy: false }
    // JPEG 손실 폴백: 품질을 낮춰가며 첫 통과(없으면 가장 작은 것) 반환.
    let best = raw
    let bestLossy = false
    for (const q of JPEG_QUALITY_STEPS) {
      const b = await toBlob(canvas, mime, q)
      if (b.size < best.size) {
        best = b
        bestLossy = true
      }
      if (b.size <= targetBytes) return { blob: b, rawSize, lossy: true }
    }
    return { blob: best, rawSize, lossy: bestLossy }
  }

  const lossless = await optimisePng(raw)
  if (!targetBytes || lossless.size <= targetBytes) return { blob: lossless, rawSize, lossy: false }

  // PNG 손실 폴백: 색상 수를 낮춰가며 imagequant(디더링) 팔레트 PNG → oxipng.
  // 첫 통과(없으면 가장 작은 것) 반환.
  const ctx = canvas.getContext('2d')
  if (!ctx) return { blob: lossless, rawSize, lossy: false }
  const src = ctx.getImageData(0, 0, canvas.width, canvas.height)

  let best = lossless
  let bestLossy = false
  for (const colors of QUANT_STEPS) {
    const png = await quantizePng(src.data, canvas.width, canvas.height, colors)
    // wasm 메모리 뷰일 수 있어 새 배열로 복사(BlobPart 타입도 만족).
    const opt = await optimisePng(new Blob([new Uint8Array(png)], { type: 'image/png' }))
    if (opt.size < best.size) {
      best = opt
      bestLossy = true
    }
    if (opt.size <= targetBytes) return { blob: opt, rawSize, lossy: true }
  }
  return { blob: best, rawSize, lossy: bestLossy }
}
