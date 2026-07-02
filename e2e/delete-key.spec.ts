import { test, expect } from '@playwright/test'
import { makeSolidPNG } from './png'

const RED: [number, number, number] = [255, 0, 0]
const GREEN: [number, number, number] = [0, 255, 0]

test('셀 선택 후 Delete 키로 해당 칸 비우기 (트레이 원본은 유지)', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')

  await page.getByPlaceholder('새 유형 이름').fill('삭제키')
  await page.getByRole('button', { name: '추가' }).click()
  await page.locator('input[type=file]').setInputFiles([
    { name: 'red.png', mimeType: 'image/png', buffer: makeSolidPNG(200, 200, RED) },
    { name: 'green.png', mimeType: 'image/png', buffer: makeSolidPNG(200, 200, GREEN) },
  ])
  await expect(page.locator('.tray-list .thumb')).toHaveCount(2)

  const nums = page.getByRole('spinbutton')
  await nums.nth(0).fill('1')
  await nums.nth(1).fill('2')

  await page.getByRole('button', { name: '자동 채우기' }).click()
  await expect(page.locator('.grid-cell img')).toHaveCount(2)

  // 셀0 선택 후 Delete
  await page.locator('.grid-cell').nth(0).click()
  await expect(page.locator('.grid-cell').nth(0)).toHaveClass(/selected/)
  await page.keyboard.press('Delete')

  // 셀0 비워짐: 그리드 이미지 1개, 셀0 은 빈칸 표시
  await expect(page.locator('.grid-cell img')).toHaveCount(1)
  await expect(page.locator('.grid-cell').nth(0).locator('.cell-empty')).toBeVisible()
  // 트레이 원본은 그대로 2개
  await expect(page.locator('.tray-list .thumb')).toHaveCount(2)

  // Backspace 로도 동작: 남은 셀1 선택 후 삭제
  await page.locator('.grid-cell').nth(1).click()
  await page.keyboard.press('Backspace')
  await expect(page.locator('.grid-cell img')).toHaveCount(0)
})
