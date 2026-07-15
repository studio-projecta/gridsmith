import { test, expect } from '@playwright/test'
import { medianCut } from '../src/lib/quantize'

// RGBA 배열에서 서로 다른 색의 개수를 센다.
function distinctColors(data: Uint8ClampedArray): number {
  const set = new Set<number>()
  for (let o = 0; o < data.length; o += 4) {
    set.add(((data[o] << 24) | (data[o + 1] << 16) | (data[o + 2] << 8) | data[o + 3]) >>> 0)
  }
  return set.size
}

// [r,g,b,a] 픽셀 목록을 평평한 RGBA 배열로.
function pixels(list: number[][]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(list.length * 4)
  list.forEach((p, i) => out.set(p, i * 4))
  return out
}

test.describe('medianCut', () => {
  test('단색 이미지는 색 수 유지(변화 없음)', () => {
    const data = pixels([
      [10, 20, 30, 255],
      [10, 20, 30, 255],
      [10, 20, 30, 255],
      [10, 20, 30, 255],
    ])
    const out = medianCut(data, 2, 2, 4)
    expect(Array.from(out)).toEqual(Array.from(data))
  })

  test('유니크 색이 maxColors 보다 많으면 결과 색 수 ≤ maxColors', () => {
    const data = pixels([
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
      [255, 255, 0, 255],
    ])
    const out = medianCut(data, 2, 2, 2)
    expect(distinctColors(out)).toBeLessThanOrEqual(2)
    expect(out.length).toBe(data.length)
  })

  test('완전 투명 픽셀은 알파 0 을 유지한다', () => {
    const data = pixels([
      [0, 0, 0, 0], // 투명
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
    ])
    const out = medianCut(data, 2, 2, 3)
    // 첫 픽셀(투명)의 알파는 0 이어야 한다.
    expect(out[3]).toBe(0)
    expect(distinctColors(out)).toBeLessThanOrEqual(3)
  })

  test('결정성: 같은 입력은 같은 출력', () => {
    const data = pixels([
      [12, 200, 5, 255],
      [240, 30, 90, 255],
      [7, 7, 250, 128],
      [99, 99, 99, 255],
      [255, 255, 255, 255],
      [1, 2, 3, 4],
    ])
    const a = medianCut(data, 3, 2, 3)
    const b = medianCut(data, 3, 2, 3)
    expect(Array.from(a)).toEqual(Array.from(b))
    expect(distinctColors(a)).toBeLessThanOrEqual(3)
  })
})
