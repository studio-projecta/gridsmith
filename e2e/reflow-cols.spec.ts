import { test, expect } from '@playwright/test'
import { makeSolidPNG } from './png'

const COLORS: [number, number, number][] = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 255, 0],
  [255, 0, 255],
  [0, 255, 255],
]

test('열을 줄였다 늘려도 이미지가 사라지지 않고 리플로우된다', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')

  await page.getByPlaceholder('새 유형 이름').fill('리플로우')
  await page.getByRole('button', { name: '추가' }).click()
  await page.locator('input[type=file]').setInputFiles(
    COLORS.map((c, i) => ({ name: `c${i}.png`, mimeType: 'image/png', buffer: makeSolidPNG(120, 120, c) })),
  )
  await expect(page.locator('.tray-list .thumb')).toHaveCount(6)

  const nums = page.getByRole('spinbutton') // [rows, cols, gap, outW, outH]
  await nums.nth(0).fill('2')
  await nums.nth(1).fill('3')

  await page.getByRole('button', { name: '자동 채우기' }).click()
  await expect(page.locator('.grid-cell img')).toHaveCount(6)

  // 열 3 → 2: 이미지 6개 유지, 행은 3으로 자동 확장
  await nums.nth(1).fill('2')
  await expect(page.locator('.grid-cell img')).toHaveCount(6)
  await expect(nums.nth(0)).toHaveValue('3')

  // 열 2 → 3: 이미지 6개 유지(위로 당겨짐)
  await nums.nth(1).fill('3')
  await expect(page.locator('.grid-cell img')).toHaveCount(6)

  // 행 3 → 2: 깔끔한 2x3, 여전히 6개
  await nums.nth(0).fill('2')
  await expect(page.locator('.grid-cell img')).toHaveCount(6)
  await expect(page.locator('.grid-cell')).toHaveCount(6)
})
