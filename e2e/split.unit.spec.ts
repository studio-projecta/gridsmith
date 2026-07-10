import { test, expect } from '@playwright/test'
import { computeSplitGeometry } from '../src/lib/split'

test.describe('computeSplitGeometry', () => {
  test('딱 떨어지는 예시: 1441×452, 2×3, sep 1 → 720×150 6개, 버림 없음', () => {
    const g = computeSplitGeometry(1441, 452, 2, 3, 1)
    expect(g.cellW).toBe(720)
    expect(g.cellH).toBe(150)
    expect(g.droppedX).toBe(0)
    expect(g.droppedY).toBe(0)
    expect(g.rects).toHaveLength(6)
  })

  test('셀 소스 좌표는 (cellW+sep)·(cellH+sep) 간격의 행 우선', () => {
    const g = computeSplitGeometry(1441, 452, 2, 3, 1)
    // r0c0, r0c1, r1c0, ...
    expect(g.rects[0]).toMatchObject({ r: 0, c: 0, sx: 0, sy: 0 })
    expect(g.rects[1]).toMatchObject({ r: 0, c: 1, sx: 721, sy: 0 })
    expect(g.rects[2]).toMatchObject({ r: 1, c: 0, sx: 0, sy: 151 })
    // 마지막 셀 우하단이 이미지 안에 들어온다.
    const last = g.rects[5]
    expect(last.sx + g.cellW).toBeLessThanOrEqual(1441)
    expect(last.sy + g.cellH).toBeLessThanOrEqual(452)
  })

  test('나눠떨어지지 않으면 우측·하단에서 균등 floor 로 버림', () => {
    // 1000×452, 2×3, sep 1: usableW=999 → cellW=499, droppedX=1. usableH=450 → cellH=150, droppedY=0.
    const g = computeSplitGeometry(1000, 452, 2, 3, 1)
    expect(g.cellW).toBe(499)
    expect(g.droppedX).toBe(1)
    expect(g.cellH).toBe(150)
    expect(g.droppedY).toBe(0)
  })

  test('sep 0: 구분선 없이 단순 균등 분할', () => {
    const g = computeSplitGeometry(300, 200, 3, 2, 0)
    expect(g.cellW).toBe(100)
    expect(g.cellH).toBe(100)
    expect(g.droppedX).toBe(0)
    expect(g.droppedY).toBe(0)
  })
})
