import { test, expect } from '@playwright/test'
import { makeSolidPNG } from './png'

const RED: [number, number, number] = [255, 0, 0]
const GREEN: [number, number, number] = [0, 255, 0]

test('자동 채우기: 이미 배치된 이미지는 중복으로 다시 넣지 않는다', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')

  await page.getByPlaceholder('새 유형 이름').fill('중복방지')
  await page.getByRole('button', { name: '추가' }).click()
  await page.locator('input[type=file]').setInputFiles([
    { name: 'red.png', mimeType: 'image/png', buffer: makeSolidPNG(200, 200, RED) },
    { name: 'green.png', mimeType: 'image/png', buffer: makeSolidPNG(200, 200, GREEN) },
  ])
  await expect(page.locator('.tray-list .thumb')).toHaveCount(2)

  // 이미지 2장, 셀 3칸
  const nums = page.getByRole('spinbutton')
  await nums.nth(0).fill('1')
  await nums.nth(1).fill('3')

  // 1차 자동채우기: 셀0=red, 셀1=green, 셀2 빈칸
  await page.getByRole('button', { name: '자동 채우기' }).click()
  await expect(page.locator('.grid-cell img')).toHaveCount(2)

  // 셀0 비우기 → 남은 사용중 이미지는 green 뿐
  await page.locator('.grid-cell').nth(0).click()
  await page.keyboard.press('Delete')
  await expect(page.locator('.grid-cell img')).toHaveCount(1)

  // 2차 자동채우기: 미사용 이미지(red)만 채워져야 함 → 총 2개(green 중복 X)
  await page.getByRole('button', { name: '자동 채우기' }).click()
  await expect(page.locator('.grid-cell img')).toHaveCount(2)
})
