// PNG 의 픽셀 크기는 그대로 두고 파일 용량만 줄인다.
// quality 는 무손실 재압축(픽셀 동일), size 는 256색 양자화(손실) 후 재압축이다.

import { optimisePng } from './encode'
import { quantizePng } from './quantize'

export type CompressMode = 'quality' | 'size'

export interface CompressResult {
  blob: Blob
  // 색상 양자화(손실)를 거친 결과인가. 무손실 재압축이거나 원본 그대로면 false.
  lossy: boolean
}

// 용량 우선 모드의 팔레트 색상 수. 팔레트 PNG 가 담을 수 있는 최대치다.
const SIZE_MODE_COLORS = 256

async function quantized(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d context 를 생성할 수 없습니다.')
    ctx.drawImage(bitmap, 0, 0)
    const src = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const png = await quantizePng(src.data, canvas.width, canvas.height, SIZE_MODE_COLORS)
    // wasm 메모리 뷰일 수 있어 새 배열로 복사(BlobPart 타입도 만족).
    return optimisePng(new Blob([new Uint8Array(png)], { type: 'image/png' }))
  } finally {
    bitmap.close()
  }
}

/**
 * PNG 한 장을 압축한다. 어느 모드든 결과가 원본보다 작지 않으면 원본을 그대로 돌려줘
 * 용량이 늘어나는 일이 없다.
 */
export async function compressPng(file: Blob, mode: CompressMode): Promise<CompressResult> {
  if (mode === 'size') {
    const q = await quantized(file)
    if (q.size < file.size) return { blob: q, lossy: true }
  }
  // 캔버스를 거치지 않고 원본 바이트를 바로 재압축해 알파 프리멀티플라이 반올림 없이 픽셀을 보존한다.
  const lossless = await optimisePng(file)
  return { blob: lossless.size < file.size ? lossless : file, lossy: false }
}

/** 같은 이름이 겹치면 확장자 앞에 -1, -2 를 붙여 ZIP 안에서 서로 덮어쓰지 않게 한다. */
export function uniqueNames(names: string[]): string[] {
  const used = new Set<string>()
  return names.map((name) => {
    const dot = name.lastIndexOf('.')
    const stem = dot > 0 ? name.slice(0, dot) : name
    const ext = dot > 0 ? name.slice(dot) : ''
    let candidate = name
    for (let n = 1; used.has(candidate); n++) candidate = `${stem}-${n}${ext}`
    used.add(candidate)
    return candidate
  })
}
