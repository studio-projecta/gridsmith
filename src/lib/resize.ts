// 이미지를 web 배포용 두 규격(모바일/PC)의 고정 크기 투명 캔버스에 배치한다.
// width 를 규격 폭에 맞춰 비율 유지로 스케일한 뒤 하단 정렬해 그린다(PC 는 바닥에서 1px 띄움).
// width 스케일 결과 높이가 배치 가능 높이를 넘으면 그 이미지는 해당 규격으로 커버 불가다.

import { encodeCanvas } from './encode'
import { folderBase, type SplitFile, type SplitResult } from './split'

export interface ResizeTarget {
  key: 'Mobile' | 'PC'
  w: number
  h: number
  // 캔버스 바닥에서 이미지 하단까지 띄우는 여백(px). PC 는 1px.
  bottomGap: number
}

export const RESIZE_TARGETS: ResizeTarget[] = [
  { key: 'Mobile', w: 293, h: 248, bottomGap: 0 },
  { key: 'PC', w: 195, h: 145, bottomGap: 1 },
]

export interface Placement {
  scaledW: number
  scaledH: number
  drawY: number
  // width 스케일 후 높이가 배치 가능 높이(h - bottomGap) 이하라 캔버스 안에 온전히 들어가는가.
  fits: boolean
}

// width 를 규격 폭에 맞추고, 하단 정렬(바닥에서 bottomGap 만큼 띄움) 그리기 좌표를 계산한다.
export function computePlacement(srcW: number, srcH: number, t: ResizeTarget): Placement {
  const scaledW = t.w
  const scaledH = Math.round((t.w * srcH) / srcW)
  const usableH = t.h - t.bottomGap
  return { scaledW, scaledH, drawY: usableH - scaledH, fits: scaledH <= usableH }
}

/** 모든 규격에서 이미지가 온전히 들어가면 true(어느 하나라도 넘치면 커버 불가). */
export function isCoverable(srcW: number, srcH: number): boolean {
  return RESIZE_TARGETS.every((t) => computePlacement(srcW, srcH, t).fits)
}

// 한 규격의 투명 캔버스에 하단 정렬로 그려 PNG(oxipng)로 인코딩한다.
async function renderTarget(
  bitmap: ImageBitmap,
  t: ResizeTarget,
): Promise<{ blob: Blob; rawSize: number }> {
  const p = computePlacement(bitmap.width, bitmap.height, t)
  const canvas = document.createElement('canvas')
  canvas.width = t.w
  canvas.height = t.h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context 를 생성할 수 없습니다.')
  ctx.clearRect(0, 0, t.w, t.h)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, p.drawY, p.scaledW, p.scaledH)
  // 무손실로 부족하면 손실 폴백으로 50KB 이하로 맞춘다.
  return encodeCanvas(canvas, 'png', 0.92, 50 * 1024)
}

export interface ResizeImageResult {
  // 규격별 생성 PNG(_Mobile, _PC). _Weflab 원본은 호출부에서 원본 blob 을 그대로 붙인다.
  targets: { key: ResizeTarget['key']; blob: Blob }[]
  rawBytes: number
  optBytes: number
}

/** 이미지 한 장을 모든 규격으로 렌더링해 PNG blob 을 반환한다. */
export async function resizeImage(file: Blob): Promise<ResizeImageResult> {
  const bitmap = await createImageBitmap(file)
  try {
    if (!isCoverable(bitmap.width, bitmap.height)) {
      throw new Error('이미지 높이가 규격 크기를 초과해 커버할 수 없습니다.')
    }
    const targets: { key: ResizeTarget['key']; blob: Blob }[] = []
    let rawBytes = 0
    let optBytes = 0
    for (const t of RESIZE_TARGETS) {
      const { blob, rawSize } = await renderTarget(bitmap, t)
      rawBytes += rawSize
      optBytes += blob.size
      targets.push({ key: t.key, blob })
    }
    return { targets, rawBytes, optBytes }
  } finally {
    bitmap.close()
  }
}

// 원본 파일명의 확장자(점 포함, 없으면 빈 문자열). _Weflab 은 원본 확장자를 보존한다.
function extOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot) : ''
}

/**
 * 여러 이미지를 규격별로 리사이즈해 하나의 파일 목록으로 반환한다.
 * 이미지마다 파일명 stem 폴더로 묶고(중복 stem 은 -1,-2), 폴더 안에
 * {stem}_Mobile.png, {stem}_PC.png, {stem}_Weflab.{원본확장자}(원본 그대로) 3개를 담는다.
 */
export async function resizeFiles(
  inputs: { name: string; blob: Blob }[],
): Promise<SplitResult> {
  const seen = new Map<string, number>()
  const out: SplitFile[] = []
  let rawBytes = 0
  let optBytes = 0
  for (const input of inputs) {
    const res = await resizeImage(input.blob)
    rawBytes += res.rawBytes
    optBytes += res.optBytes

    let base = folderBase(input.name)
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    const folder = n > 0 ? `${base}-${n}` : base
    // 파일명 stem 은 폴더명(sanitize 후)과 동일하게 맞춘다.
    const stem = base

    for (const t of res.targets) {
      out.push({ name: `${folder}/${stem}_${t.key}.png`, blob: t.blob })
    }
    out.push({ name: `${folder}/${stem}_Weflab${extOf(input.name)}`, blob: input.blob })
  }
  return { files: out, rawBytes, optBytes }
}
