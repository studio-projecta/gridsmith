import { test, expect } from '@playwright/test'
import { cellRect, imageRect, clamp, scaleLayoutBy, trimEmptyLines, type Rect } from '../src/lib/layout'
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

  test('여백 지정: 바깥은 marginX/Y, 셀 사이만 gap', () => {
    const L = layout({ rows: 2, cols: 2, gap: 20, marginX: 50, marginY: 10, outputWidth: 400, outputHeight: 400 })
    // cellW = (400 - 50*2 - 20*1)/2 = 140, cellH = (400 - 10*2 - 20*1)/2 = 180
    eq(cellRect(L, 0), { x: 50, y: 10, w: 140, h: 180 })
    eq(cellRect(L, 1), { x: 210, y: 10, w: 140, h: 180 }) // 50 + (140+20)
    eq(cellRect(L, 3), { x: 210, y: 210, w: 140, h: 180 })
  })

  test('바깥 라인은 gap 과 무관하게 여백으로 고정(그룹 간 일관성)', () => {
    const mk = (gap: number) =>
      layout({ rows: 1, cols: 3, gap, marginX: 40, marginY: 40, outputWidth: 1000, outputHeight: 300 })
    for (const gap of [0, 30, 120]) {
      const L = mk(gap)
      const first = cellRect(L, 0)
      const last = cellRect(L, 2)
      expect(first.x).toBeCloseTo(40, 5) // 좌측 바깥 = marginX
      expect(last.x + last.w).toBeCloseTo(1000 - 40, 5) // 우측 바깥 = marginX
    }
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

  test('여백 지정: 바깥을 여백으로 두고도 셀=이미지 원본(cellRect 역산)', () => {
    const { outputWidth, outputHeight } = computeAutoOutput(2, 3, 10, 120, 90, 50, 25)
    // 120*3 + 10*2 + 50*2 = 480, 90*2 + 10*1 + 25*2 = 240
    expect({ outputWidth, outputHeight }).toEqual({ outputWidth: 480, outputHeight: 240 })
    const L = layout({ rows: 2, cols: 3, gap: 10, marginX: 50, marginY: 25, outputWidth, outputHeight })
    const c0 = cellRect(L, 0)
    expect(c0.w).toBeCloseTo(120, 5)
    expect(c0.h).toBeCloseTo(90, 5)
    expect(c0.x).toBeCloseTo(50, 5)
    expect(c0.y).toBeCloseTo(25, 5)
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

test.describe('trimEmptyLines', () => {
  const slot = (id: string): CellSlot => ({ id } as unknown as CellSlot)
  const ids = (cells: (CellSlot | null)[]) =>
    cells.map((c) => (c ? (c as unknown as { id: string }).id : null))

  test('빈 마지막 행·열 제거 + 비율 재조정', () => {
    // 3x3, cell 100. 좌상단 2x2 만 채움 → 오른쪽 열/아래 행이 빔.
    const cells = new Array(9).fill(null) as (CellSlot | null)[]
    cells[0] = slot('a')
    cells[1] = slot('b')
    cells[3] = slot('c')
    cells[4] = slot('d')
    const L = layout({ rows: 3, cols: 3, gap: 0, outputWidth: 300, outputHeight: 300, cells })
    const t = trimEmptyLines(L)
    expect(t.rows).toBe(2)
    expect(t.cols).toBe(2)
    expect(t.outputWidth).toBe(200)
    expect(t.outputHeight).toBe(200)
    expect(ids(t.cells)).toEqual(['a', 'b', 'c', 'd'])
  })

  test('가운데 빈 열만 제거되고 사이 배치는 압축', () => {
    // 1x3, cell 100. 가운데 열만 빔 → 양쪽만 남아 200 폭.
    const cells: (CellSlot | null)[] = [slot('a'), null, slot('b')]
    const L = layout({ rows: 1, cols: 3, gap: 0, outputWidth: 300, outputHeight: 100, cells })
    const t = trimEmptyLines(L)
    expect(t.cols).toBe(2)
    expect(t.outputWidth).toBe(200)
    expect(ids(t.cells)).toEqual(['a', 'b'])
  })

  test('gap 유지하며 1칸으로 압축', () => {
    // 2x2, gap 20, output 400 → cell 170. 좌상단만 채움 → 1x1, 170 + 20*2 = 210.
    const cells: (CellSlot | null)[] = [slot('a'), null, null, null]
    const L = layout({ rows: 2, cols: 2, gap: 20, outputWidth: 400, outputHeight: 400, cells })
    const t = trimEmptyLines(L)
    expect(t.rows).toBe(1)
    expect(t.cols).toBe(1)
    expect(t.outputWidth).toBe(210)
    expect(t.outputHeight).toBe(210)
  })

  test('뺄 빈 행/열이 없으면 원본 그대로(동일 참조)', () => {
    // 대각선 배치 → 모든 행·열에 최소 1개.
    const cells: (CellSlot | null)[] = [slot('a'), null, null, slot('b')]
    const L = layout({ rows: 2, cols: 2, gap: 0, cells })
    expect(trimEmptyLines(L)).toBe(L)
  })

  test('배치가 하나도 없으면 원본 그대로(동일 참조)', () => {
    const L = layout({ rows: 2, cols: 2, cells: [null, null, null, null] })
    expect(trimEmptyLines(L)).toBe(L)
  })
})

test.describe('clamp', () => {
  test('범위 밖 값 절단', () => {
    expect(clamp(5, 0, 1)).toBe(1)
    expect(clamp(-2, -1, 1)).toBe(-1)
    expect(clamp(0.5, 0, 1)).toBe(0.5)
  })
})

test.describe('scaleLayoutBy', () => {
  const cellAspect = (L: GridLayout) => {
    const c = cellRect(L, 0)
    return c.w / c.h
  }

  test('여백 지정 시에도 스케일 후 셀 가로:세로 비율 보존(사이드 잘림 회귀)', () => {
    // marginX 를 안 스케일하면 셀 비율이 틀어져 cover 클립량이 달라진다.
    const L = layout({
      rows: 2,
      cols: 2,
      gap: 20,
      marginX: 50,
      marginY: 10,
      outputWidth: 400,
      outputHeight: 400,
    })
    for (const factor of [0.5, 2, 3.7]) {
      const scaled = scaleLayoutBy(L, factor)
      expect(cellAspect(scaled)).toBeCloseTo(cellAspect(L), 5)
    }
  })

  test('절대 px 필드를 factor 로 함께 스케일', () => {
    const L = layout({
      gap: 20,
      marginX: 50,
      marginY: 10,
      cellPadX: 8,
      cellPadY: 4,
      borderWidth: 6,
      outputWidth: 400,
      outputHeight: 200,
    })
    const s = scaleLayoutBy(L, 2)
    expect(s.outputWidth).toBe(800)
    expect(s.outputHeight).toBe(400)
    expect(s.gap).toBe(40)
    expect(s.marginX).toBe(100)
    expect(s.marginY).toBe(20)
    expect(s.cellPadX).toBe(16)
    expect(s.cellPadY).toBe(8)
    expect(s.borderWidth).toBe(12)
  })

  test('미지정 여백은 undefined 로 유지(gap 폴백 보존)', () => {
    const L = layout({ gap: 10, outputWidth: 400, outputHeight: 400 })
    const s = scaleLayoutBy(L, 2)
    expect(s.marginX).toBeUndefined()
    expect(s.marginY).toBeUndefined()
    expect(s.cellPadX).toBeUndefined()
    expect(s.cellPadY).toBeUndefined()
  })

  test('셀별 transform.padX/Y 는 스케일, offset/scale 은 불변', () => {
    const cells: (CellSlot | null)[] = [
      { imageId: 'a', transform: { offsetX: 0.3, offsetY: -0.4, scale: 1.5, padX: 10, padY: 6 } },
      null,
      null,
      null,
    ]
    const L = layout({ rows: 2, cols: 2, outputWidth: 400, outputHeight: 400, cells })
    const s = scaleLayoutBy(L, 2)
    const t = s.cells[0]!.transform
    expect(t.padX).toBe(20)
    expect(t.padY).toBe(12)
    expect(t.offsetX).toBe(0.3)
    expect(t.offsetY).toBe(-0.4)
    expect(t.scale).toBe(1.5)
    expect(s.cells[1]).toBeNull()
  })
})
