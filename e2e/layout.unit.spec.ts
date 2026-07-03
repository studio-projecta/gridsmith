import { test, expect } from '@playwright/test'
import { cellRect, imageRect, clamp, type Rect } from '../src/lib/layout'
import { computeAutoOutput, reflowCells } from '../src/types'
import type { GridLayout, CellSlot } from '../src/types'

function layout(patch: Partial<GridLayout>): GridLayout {
  return {
    typeId: 't',
    rows: 2,
    cols: 2,
    cells: [],
    bgColor: '#ffffff',
    outputWidth: 400,
    outputHeight: 400,
    gap: 0,
    fit: 'cover',
    ...patch,
  }
}

function eq(a: Rect, b: Rect) {
  expect(a.x).toBeCloseTo(b.x, 5)
  expect(a.y).toBeCloseTo(b.y, 5)
  expect(a.w).toBeCloseTo(b.w, 5)
  expect(a.h).toBeCloseTo(b.h, 5)
}

test.describe('cellRect', () => {
  test('gap 이 있는 2x2: 셀 위치·크기가 여백을 반영', () => {
    const L = layout({ rows: 2, cols: 2, gap: 20, outputWidth: 400, outputHeight: 400 })
    // cellW = (400 - 20*3)/2 = 170
    eq(cellRect(L, 0), { x: 20, y: 20, w: 170, h: 170 })
    eq(cellRect(L, 1), { x: 210, y: 20, w: 170, h: 170 }) // col1
    eq(cellRect(L, 2), { x: 20, y: 210, w: 170, h: 170 }) // row1
    eq(cellRect(L, 3), { x: 210, y: 210, w: 170, h: 170 })
  })

  test('gap 0, 5x5, 1500px: 셀 폭 300', () => {
    const L = layout({ rows: 5, cols: 5, gap: 0, outputWidth: 1500, outputHeight: 1500 })
    eq(cellRect(L, 6), { x: 300, y: 300, w: 300, h: 300 }) // row1,col1
  })

  test('직사각 출력: 셀도 직사각', () => {
    const L = layout({ rows: 1, cols: 2, gap: 0, outputWidth: 800, outputHeight: 400 })
    eq(cellRect(L, 0), { x: 0, y: 0, w: 400, h: 400 })
    eq(cellRect(L, 1), { x: 400, y: 0, w: 400, h: 400 })
  })
})

test.describe('imageRect', () => {
  const cell: Rect = { x: 0, y: 0, w: 100, h: 100 }

  test('cover: 정사각 이미지가 셀을 정확히 채움', () => {
    eq(imageRect(cell, 200, 200, 'cover', 'center'), { x: 0, y: 0, w: 100, h: 100 })
  })

  test('cover: 가로로 긴 이미지는 가로가 넘쳐 잘림', () => {
    // base = max(100/200, 100/100) = 1 → 200x100, 중앙정렬 → x=-50
    eq(imageRect(cell, 200, 100, 'cover', 'center'), { x: -50, y: 0, w: 200, h: 100 })
  })

  test('contain: 가로로 긴 이미지는 안쪽에 레터박스', () => {
    // base = min(100/200, 100/100) = 0.5 → 100x50, 세로 중앙 → y=25
    eq(imageRect(cell, 200, 100, 'contain', 'center'), { x: 0, y: 25, w: 100, h: 50 })
  })

  test('align top: 레터박스 이미지의 윗변을 셀 윗변에 맞춤', () => {
    // contain 200x100 → 100x50 (셀보다 낮음), top → y=0
    eq(imageRect(cell, 200, 100, 'contain', 'top'), { x: 0, y: 0, w: 100, h: 50 })
  })

  test('align bottom: 레터박스 이미지의 아랫변을 셀 아랫변에 맞춤', () => {
    // contain 200x100 → 100x50, bottom → y = 100 - 50 = 50
    eq(imageRect(cell, 200, 100, 'contain', 'bottom'), { x: 0, y: 50, w: 100, h: 50 })
  })
})

test.describe('computeAutoOutput', () => {
  test('셀=이미지 원본이 되도록 출력 크기 산출 (gap 0)', () => {
    // 100x80 이미지, 3열 2행 → 300 x 160
    expect(computeAutoOutput(2, 3, 0, 100, 80)).toEqual({ outputWidth: 300, outputHeight: 160 })
  })

  test('gap 포함: 바깥 여백까지 반영', () => {
    // 200x200, 2x2, gap 20 → 200*2 + 20*3 = 460
    expect(computeAutoOutput(2, 2, 20, 200, 200)).toEqual({ outputWidth: 460, outputHeight: 460 })
  })

  test('cellRect 역산과 일치: 산출된 출력에서 셀 폭이 정확히 이미지 폭', () => {
    const { outputWidth, outputHeight } = computeAutoOutput(2, 3, 10, 120, 90)
    const L = layout({ rows: 2, cols: 3, gap: 10, outputWidth, outputHeight })
    const c0 = cellRect(L, 0)
    expect(c0.w).toBeCloseTo(120, 5)
    expect(c0.h).toBeCloseTo(90, 5)
  })
})

test.describe('reflowCells', () => {
  const slot = (id: string): CellSlot => ({ id } as unknown as CellSlot)
  const ids = (cells: (CellSlot | null)[]) =>
    cells.map((c) => (c ? (c as unknown as { id: string }).id : null))

  test('열 축소: 넘치는 항목이 다음 줄로 밀리고 행이 늘어남(유실 없음)', () => {
    const cells = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map(slot) // 2x5
    const r = reflowCells(cells, 2, 3)
    expect(r.rows).toBe(4) // ceil(10/3)
    expect(r.cells).toHaveLength(12)
    expect(ids(r.cells)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', null, null])
  })

  test('열 확대: 위로 당겨지고 행이 필요한 만큼으로 복귀', () => {
    const cells = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map(slot)
    const back = reflowCells(cells, 2, 5) // 요청 2행
    expect(back.rows).toBe(2)
    expect(back.cells).toHaveLength(10)
    expect(ids(back.cells)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
  })

  test('중간 빈칸은 선형 순서로 보존', () => {
    const cells = [slot('a'), null, slot('b')] // 1x3
    const r = reflowCells(cells, 1, 2)
    expect(r.rows).toBe(2)
    expect(ids(r.cells)).toEqual(['a', null, 'b', null])
  })

  test('요청 행이 부족해도 이미지 담기게 행 확장', () => {
    const cells = ['0', '1', '2', '3', '4', '5'].map(slot)
    const r = reflowCells(cells, 1, 2) // 1행 요청, 6개
    expect(r.rows).toBe(3)
    expect(ids(r.cells)).toEqual(['0', '1', '2', '3', '4', '5'])
  })
})

test.describe('clamp', () => {
  test('범위 밖 값 절단', () => {
    expect(clamp(5, 0, 1)).toBe(1)
    expect(clamp(-2, -1, 1)).toBe(-1)
    expect(clamp(0.5, 0, 1)).toBe(0.5)
  })
})
