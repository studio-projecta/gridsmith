import { test, expect } from '@playwright/test'
import { makeSolidPNG } from './png'

const RED: [number, number, number] = [255, 0, 0]

test('자동 맞춤: 출력 크기가 첫 이미지 원본 × 그리드로 계산되고, 수동 지정 시 고정된다', async ({
  page,
}) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')

  await page.getByPlaceholder('새 유형 이름').fill('오토')
  await page.getByRole('button', { name: '추가' }).click()

  const nums = page.getByRole('spinbutton') // [rows, cols, gap, outW, outH]
  // 2행 3열, gap 0
  await nums.nth(0).fill('2')
  await nums.nth(1).fill('3')
  await nums.nth(2).fill('0')

  // 기본 autoSize on: 첫 이미지 업로드 시 출력이 이미지×그리드로 맞춰진다.
  await expect(page.getByRole('checkbox', { name: /자동 맞춤/ })).toBeChecked()
  await page
    .locator('input[type=file]')
    .setInputFiles([{ name: 'r.png', mimeType: 'image/png', buffer: makeSolidPNG(100, 80, RED) }])
  await expect(page.locator('.tray-list .thumb')).toHaveCount(1)

  // 100x80 이미지, 3열 2행 → 300 x 160
  await expect(nums.nth(3)).toHaveValue('300')
  await expect(nums.nth(4)).toHaveValue('160')
  // 자동일 때 출력 입력은 비활성.
  await expect(nums.nth(3)).toBeDisabled()

  // 그리드 변경 시 재계산: 열 3 → 4 이면 폭 400.
  await nums.nth(1).fill('4')
  await expect(nums.nth(3)).toHaveValue('400')
  await expect(nums.nth(4)).toHaveValue('160')

  // 자동 끄고 수동 지정 → 고정(pin).
  await page.getByRole('checkbox', { name: /자동 맞춤/ }).uncheck()
  await expect(nums.nth(3)).toBeEnabled()
  await nums.nth(3).fill('500')

  // 이제 그리드를 바꿔도 출력 폭은 500 유지(자동 재계산 안 함).
  await nums.nth(1).fill('2')
  await expect(nums.nth(3)).toHaveValue('500')
})
