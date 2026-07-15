import { test, expect } from '@playwright/test'
import { computePlacement, isCoverable, RESIZE_TARGETS } from '../src/lib/resize'

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

  test('PC 는 바닥에서 1px 띄운다', () => {
    // 400×200 → width 195, 높이 round(195*200/400)=98.
    const p = computePlacement(400, 200, PC)
    expect(p.scaledW).toBe(195)
    expect(p.scaledH).toBe(98)
    // 이미지 하단이 캔버스 바닥보다 1px 위(= h-1).
    expect(p.drawY + p.scaledH).toBe(PC.h - 1)
    expect(p.fits).toBe(true)
  })

  test('높이가 배치 가능 높이를 넘으면 fits=false', () => {
    // 세로형 400×600 → Mobile 높이 round(293*600/400)=440 > 248.
    const p = computePlacement(400, 600, MOBILE)
    expect(p.scaledH).toBe(440)
    expect(p.fits).toBe(false)
  })
})

test.describe('isCoverable', () => {
  test('가로형은 두 규격 모두 들어간다', () => {
    expect(isCoverable(400, 200)).toBe(true)
  })

  test('세로형은 커버 불가(Mobile 높이 초과)', () => {
    expect(isCoverable(400, 600)).toBe(false)
  })

  test('경계: 195×144 는 PC 에 딱 들어가 커버 가능', () => {
    // PC 높이 round(195*144/195)=144 == usableH(145-1). 통과.
    expect(computePlacement(195, 144, PC).scaledH).toBe(144)
    expect(isCoverable(195, 144)).toBe(true)
  })

  test('경계: 195×145 는 PC 1px 여백을 넘겨 커버 불가', () => {
    // PC 높이 145 > usableH 144.
    expect(computePlacement(195, 145, PC).scaledH).toBe(145)
    expect(isCoverable(195, 145)).toBe(false)
  })
})
