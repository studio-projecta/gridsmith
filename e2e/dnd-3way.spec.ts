import { test, expect, type Page } from '@playwright/test'
import { makeSolidPNG } from './png'

const COLORS: Record<string, [number, number, number]> = {
  R: [255, 0, 0],
  G: [0, 255, 0],
  B: [0, 0, 255],
  Y: [255, 255, 0],
}

async function setup(page: Page, name: string, count: number) {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')
  await page.getByPlaceholder('새 유형 이름').fill(name)
  await page.getByRole('button', { name: '추가' }).click()
  await page.locator('input[type=file]').setInputFiles(
    Object.entries(COLORS)
      .slice(0, count)
      .map(([n, rgb]) => ({ name: `${n}.png`, mimeType: 'image/png', buffer: makeSolidPNG(100, 100, rgb) })),
  )
  await page.locator('.tray-list .thumb').first().waitFor()
  const nums = page.getByRole('spinbutton')
  await nums.nth(0).fill('1')
  await nums.nth(1).fill('4')
  await nums.nth(2).fill('0')
  await page.getByRole('button', { name: '자동 채우기' }).click()
  await page.locator('.grid-cell img').first().waitFor()
  await page.waitForTimeout(150)
}

async function box(page: Page, i: number) {
  const b = await page.locator('.grid-cell').nth(i).boundingBox()
  if (!b) throw new Error('no bbox ' + i)
  return b
}

// fromCell 중앙에서 잡아 to(x,y)로 드래그
async function drag(page: Page, fromIdx: number, toX: number, toY: number) {
  const f = await box(page, fromIdx)
  await page.mouse.move(f.x + f.width / 2, f.y + f.height / 2)
  await page.mouse.down()
  await page.mouse.move(f.x + f.width / 2 + 12, f.y + f.height / 2, { steps: 3 })
  await page.mouse.move(toX, toY, { steps: 14 })
  await page.mouse.move(toX, toY, { steps: 2 }) // 마지막 위치 확정
  await page.mouse.up()
  await page.waitForTimeout(250)
}

async function order(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const name = (r: number, g: number, b: number) => {
      if (r > 200 && g < 80 && b < 80) return 'R'
      if (g > 200 && r < 80 && b < 80) return 'G'
      if (b > 200 && r < 80 && g < 80) return 'B'
      if (r > 200 && g > 200 && b < 80) return 'Y'
      return '_'
    }
    const out: string[] = []
    for (const cell of Array.from(document.querySelectorAll('.grid-cell'))) {
      const img = cell.querySelector('img') as HTMLImageElement | null
      if (!img) { out.push('_'); continue }
      const p = new Image()
      p.src = img.src
      await new Promise((r) => (p.complete ? r(null) : (p.onload = () => r(null))))
      const c = document.createElement('canvas')
      c.width = p.naturalWidth || 1
      c.height = p.naturalHeight || 1
      const ctx = c.getContext('2d')!
      ctx.drawImage(p, 0, 0)
      const [r, g, b] = Array.from(ctx.getImageData(c.width >> 1, c.height >> 1, 1, 1).data)
      out.push(name(r, g, b))
    }
    return out.join(',')
  })
}

test('있는 칸 중앙에 드롭 → 서로 자리 바꿈(swap)', async ({ page }) => {
  await setup(page, 'swap', 4) // R,G,B,Y
  const b2 = await box(page, 2)
  await drag(page, 0, b2.x + b2.width / 2, b2.y + b2.height / 2) // 셀2 중앙
  expect(await order(page)).toBe('B,G,R,Y')
})

test('셀 경계에 드롭 → 끼워넣고 뒤로 밀기(insert)', async ({ page }) => {
  await setup(page, 'insert', 4) // R,G,B,Y
  const b2 = await box(page, 2)
  await drag(page, 0, b2.x + b2.width * 0.1, b2.y + b2.height / 2) // 셀2 왼쪽 경계
  expect(await order(page)).toBe('G,R,B,Y')
})

test('빈 칸 중앙에 드롭 → 그 자리로 이동(move)', async ({ page }) => {
  await setup(page, 'move', 2) // R,G,_,_
  const b2 = await box(page, 2)
  await drag(page, 0, b2.x + b2.width / 2, b2.y + b2.height / 2) // 빈 셀2 중앙
  expect(await order(page)).toBe('_,G,R,_')
})
