// 모바일용·PC용 이미지를 각각 별도로 입력받아 web 배포용 규격에 맞춘다.
// 각 이미지는 width 를 규격 폭에 맞춰 비율 유지로 스케일한 뒤 고정 크기 투명 캔버스에
// 하단 정렬해 그린다(PC 는 바닥에서 1px 띄움). width 스케일 결과 높이가 배치 가능 높이를
// 넘으면 그 규격으로 커버 불가다. 모바일 이미지는 _Mobile 리사이즈본과 _Weflab 원본이 되고,
// PC 이미지는 _PC 리사이즈본이 된다.

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

function targetOf(key: ResizeTarget['key']): ResizeTarget {
  const t = RESIZE_TARGETS.find((x) => x.key === key)
  if (!t) throw new Error(`알 수 없는 규격: ${key}`)
  return t
}

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

/** 이미지가 해당 규격 하나에 온전히 들어가면 true(높이가 넘치면 커버 불가). */
export function coversTarget(srcW: number, srcH: number, key: ResizeTarget['key']): boolean {
  return computePlacement(srcW, srcH, targetOf(key)).fits
}

// 한 규격의 투명 캔버스에 하단 정렬로 그려 PNG(oxipng, 부족하면 손실 폴백으로 50KB)로 인코딩한다.
async function renderTarget(
  bitmap: ImageBitmap,
  t: ResizeTarget,
): Promise<{ blob: Blob; rawSize: number; lossy: boolean }> {
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
  return encodeCanvas(canvas, 'png', 0.92, 50 * 1024)
}

// 원본 파일명의 확장자(점 포함, 없으면 빈 문자열). _Weflab 은 원본 확장자를 보존한다.
function extOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot) : ''
}

/**
 * 모바일용·PC용 이미지를 각각 리사이즈해 하나의 파일 목록으로 반환한다.
 * 모바일 이미지 이름을 stem 으로 폴더를 만들고, 폴더 안에
 * {stem}_Mobile.png(모바일 리사이즈), {stem}_PC.png(PC 리사이즈),
 * {stem}_Weflab.{모바일 원본확장자}(모바일 원본 그대로) 3개를 담는다.
 */
export async function resizePair(
  mobile: { name: string; blob: Blob },
  pc: { name: string; blob: Blob },
): Promise<SplitResult> {
  const mobileT = targetOf('Mobile')
  const pcT = targetOf('PC')
  const mBitmap = await createImageBitmap(mobile.blob)
  const pBitmap = await createImageBitmap(pc.blob)
  try {
    if (!computePlacement(mBitmap.width, mBitmap.height, mobileT).fits) {
      throw new Error('모바일 이미지 높이가 규격을 초과해 커버할 수 없습니다.')
    }
    if (!computePlacement(pBitmap.width, pBitmap.height, pcT).fits) {
      throw new Error('PC 이미지 높이가 규격을 초과해 커버할 수 없습니다.')
    }

    const mob = await renderTarget(mBitmap, mobileT)
    const pcRes = await renderTarget(pBitmap, pcT)

    const stem = folderBase(mobile.name)
    const files: SplitFile[] = [
      { name: `${stem}/${stem}_Mobile.png`, blob: mob.blob },
      { name: `${stem}/${stem}_PC.png`, blob: pcRes.blob },
      { name: `${stem}/${stem}_Weflab${extOf(mobile.name)}`, blob: mobile.blob },
    ]
    return {
      files,
      rawBytes: mob.rawSize + pcRes.rawSize,
      optBytes: mob.blob.size + pcRes.blob.size,
      lossy: mob.lossy || pcRes.lossy,
    }
  } finally {
    mBitmap.close()
    pBitmap.close()
  }
}
