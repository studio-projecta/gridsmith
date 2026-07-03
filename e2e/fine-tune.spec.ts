import { test, expect } from '@playwright/test'
import { makeSolidPNG } from './png'

const RED: [number, number, number] = [255, 0, 0]

test('셀 선택 시 미세조정 패널로 배율·위치 조절이 미리보기에 반영', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')

  await page.getByPlaceholder('새 유형 이름').fill('미세조정')
  await page.getByRole('button', { name: '추가' }).click()
  await page.locator('input[type=file]').setInputFiles([
    { name: 'red.png', mimeType: 'image/png', buffer: makeSolidPNG(200, 200, RED) },
  ])
  await expect(page.locator('.tray-list .thumb')).toHaveCount(1)

  await page.getByRole('button', { name: '자동 채우기' }).click()
  const img = page.locator('.grid-cell img').first()
  await expect(img).toBeVisible()

  // 선택 전엔 패널 없음
  await expect(page.locator('.fine-tune')).toHaveCount(0)

  await page.locator('.grid-cell').first().click()
  await expect(page.locator('.fine-tune')).toBeVisible()

  const widthBefore = await img.evaluate((el) => (el as HTMLElement).style.width)

  const scaleField = page.locator('.fine-tune .ft-field').nth(0)
  const scaleRange = scaleField.locator('input[type=range]')
  const scaleNum = scaleField.locator('.ft-num')

  // 슬라이더로 조절 → 숫자 입력이 값을 따라오고 이미지 width % 증가.
  await scaleRange.fill('3')
  expect(parseFloat(await scaleNum.inputValue())).toBeCloseTo(3, 2)
  const widthAfter = await img.evaluate((el) => (el as HTMLElement).style.width)
  expect(parseFloat(widthAfter)).toBeGreaterThan(parseFloat(widthBefore))

  // 숫자 직접 입력으로도 조절 → 슬라이더가 값을 따라오고 width % 가 줄어듦.
  await scaleNum.fill('1.5')
  expect(parseFloat(await scaleRange.inputValue())).toBeCloseTo(1.5, 2)
  const widthTyped = await img.evaluate((el) => (el as HTMLElement).style.width)
  expect(parseFloat(widthTyped)).toBeLessThan(parseFloat(widthAfter))

  // 초기화: 원래 width 로 복귀
  await page.getByRole('button', { name: '초기화' }).click()
  const widthReset = await img.evaluate((el) => (el as HTMLElement).style.width)
  expect(parseFloat(widthReset)).toBeCloseTo(parseFloat(widthBefore), 3)
})
