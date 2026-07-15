import { test, expect } from '@playwright/test'
import { computePlacement, coversTarget, RESIZE_TARGETS } from '../src/lib/resize'

const MOBILE = RESIZE_TARGETS[0]
const PC = RESIZE_TARGETS[1]

test.describe('computePlacement', () => {
  test('width 를 규격 폭에 맞추고 비율 유지로 높이를 계산한다 (Mobile)', () => {
    // 400×200 → width 293, 높이 round(293*200/400)=147.
    const p = computePlacement(400, 200, MOBILE)
    expect(p.scaledW).toBe(293)
    expect(p.scaledH).toBe(147)
    expect(p.fits).toBe(true)
  })

  test('하단 정렬: 이미지 하단이 캔버스 바닥에 붙는다 (Mobile, gap 0)', () => {
    const p = computePlacement(400, 200, MOBILE)
    // drawY + scaledH == 캔버스 높이(바닥에 딱 붙음).
    expect(p.drawY + p.scaledH).toBe(MOBILE.h)
    expect(p.drawY).toBe(248 - 147)
  })

  test('PC 도 바닥에 붙는다', () => {
    // 400×200 → width 195, 높이 round(195*200/400)=98.
    const p = computePlacement(400, 200, PC)
    expect(p.scaledW).toBe(195)
    expect(p.scaledH).toBe(98)
    // 이미지 하단이 캔버스 바닥에 딱 붙음(= h).
    expect(p.drawY + p.scaledH).toBe(PC.h)
    expect(p.fits).toBe(true)
  })

  test('높이가 배치 가능 높이를 넘으면 fits=false', () => {
    // 세로형 400×600 → Mobile 높이 round(293*600/400)=440 > 248.
    const p = computePlacement(400, 600, MOBILE)
    expect(p.scaledH).toBe(440)
    expect(p.fits).toBe(false)
  })
})

test.describe('coversTarget', () => {
  test('가로형은 각 규격에 들어간다', () => {
    expect(coversTarget(400, 200, 'Mobile')).toBe(true)
    expect(coversTarget(400, 200, 'PC')).toBe(true)
  })

  test('세로형은 Mobile 커버 불가', () => {
    // round(293*600/400)=440 > 248.
    expect(coversTarget(400, 600, 'Mobile')).toBe(false)
  })

  test('경계: 195×145 는 PC 에 딱 들어가 커버 가능', () => {
    // PC 높이 round(195*145/195)=145 == 규격 높이 145. 통과.
    expect(computePlacement(195, 145, PC).scaledH).toBe(145)
    expect(coversTarget(195, 145, 'PC')).toBe(true)
  })

  test('경계: 195×146 는 PC 높이를 넘겨 커버 불가', () => {
    // PC 높이 round(195*146/195)=146 > 145.
    expect(computePlacement(195, 146, PC).scaledH).toBe(146)
    expect(coversTarget(195, 146, 'PC')).toBe(false)
  })
})
