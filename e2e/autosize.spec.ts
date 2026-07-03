import { test, expect } from '@playwright/test'
import { makeSolidPNG } from './png'

const RED: [number, number, number] = [255, 0, 0]

test('자동 맞춤: 출력 크기가 첫 이미지 원본 × 그리드로 계산되고 그리드 변경 시 재계산된다', async ({
  page,
}) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')

  await page.getByPlaceholder('새 유형 이름').fill('오토')
  await page.getByRole('button', { name: '추가' }).click()

  const nums = page.getByRole('spinbutton') // [rows, cols, gap]
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

  // 셀에 배치되면 첫 배치 이미지 기준으로 출력이 계산된다.
  await page.getByRole('button', { name: '자동 채우기' }).click()
  await expect(page.locator('.grid-cell img')).toHaveCount(1)

  // 툴바 리드아웃에 계산된 출력 크기가 표시된다. 100x80, 3열 2행 → 300 x 160.
  const readout = page.locator('.tb-readout')
  await expect(readout).toContainText('300×160')

  // 그리드 변경 시 재계산: 열 3 → 4 이면 폭 400.
  await nums.nth(1).fill('4')
  await expect(readout).toContainText('400×160')
})
