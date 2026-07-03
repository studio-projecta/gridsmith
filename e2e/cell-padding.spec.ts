import { test, expect } from '@playwright/test'
import { makeSolidPNG } from './png'

const RED: [number, number, number] = [255, 0, 0]

function near(actual: number[], expected: number[], tol = 12) {
  return expected.every((v, i) => Math.abs(actual[i] - v) <= tol)
}

test('전역 셀 내부 여백: 내보내기 출력에서 이미지가 안쪽으로 들어가고 여백은 배경(흰색)', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')

  await page.getByPlaceholder('새 유형 이름').fill('내부 여백')
  await page.getByRole('button', { name: '추가' }).click()

  // 200x200 이미지 1장, 1x1 그리드 → 자동 크기 200x200, 셀이 출력 전체.
  await page.locator('input[type=file]').setInputFiles([
    { name: 'red.png', mimeType: 'image/png', buffer: makeSolidPNG(200, 200, RED) },
  ])
  await expect(page.locator('.tray-list .thumb')).toHaveCount(1)

  const nums = page.getByRole('spinbutton')
  await nums.nth(0).fill('1')
  await nums.nth(1).fill('1')
  await page.getByRole('button', { name: '자동 채우기' }).click()
  await expect(page.locator('.grid-cell img')).toHaveCount(1)

  // 전역 셀 내부 여백 40px(좌우·상하). 콘텐츠 영역은 40..160 → 120x120.
  await page.getByLabel('셀 내부 여백 가로', { exact: true }).fill('40')
  await page.getByLabel('셀 내부 여백 세로', { exact: true }).fill('40')
  await page.waitForTimeout(500) // 저장 디바운스

  await page.locator('.export-group').getByRole('button').click()
  const modal = page.locator('.export-modal')
  await expect(modal).toBeVisible()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    modal.getByRole('button', { name: /내보내기/ }).click(),
  ])
  const filePath = await download.path()

  const fs = await import('node:fs')
  const b64 = fs.readFileSync(filePath!).toString('base64')
  const result = await page.evaluate(async (dataUrl) => {
    const img = new Image()
    await new Promise((res, rej) => {
      img.onload = res
      img.onerror = rej
      img.src = dataUrl
    })
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const px = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data)
    return {
      w: img.naturalWidth,
      h: img.naturalHeight,
      corner: px(5, 5), // 여백(0..40) → 배경 흰색
      leftBand: px(20, 100), // 좌측 여백 밴드 → 흰색
      topBand: px(100, 20), // 상단 여백 밴드 → 흰색
      inside: px(60, 100), // 콘텐츠(40..160) → 이미지 red
      center: px(100, 100), // 중앙 → red
    }
  }, `data:image/png;base64,${b64}`)

  // 내부 여백은 출력 크기를 바꾸지 않는다.
  expect(result.w).toBe(200)
  expect(result.h).toBe(200)
  expect(near(result.corner, [255, 255, 255, 255])).toBeTruthy()
  expect(near(result.leftBand, [255, 255, 255, 255])).toBeTruthy()
  expect(near(result.topBand, [255, 255, 255, 255])).toBeTruthy()
  expect(near(result.inside, [255, 0, 0, 255])).toBeTruthy()
  expect(near(result.center, [255, 0, 0, 255])).toBeTruthy()
})

test('셀별 내부 여백: 미세조정 슬라이더가 해당 셀 이미지 영역을 좁힘', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')

  await page.getByPlaceholder('새 유형 이름').fill('셀별내부 여백')
  await page.getByRole('button', { name: '추가' }).click()
  await page.locator('input[type=file]').setInputFiles([
    { name: 'red.png', mimeType: 'image/png', buffer: makeSolidPNG(200, 200, RED) },
  ])
  await expect(page.locator('.tray-list .thumb')).toHaveCount(1)

  const nums = page.getByRole('spinbutton')
  await nums.nth(0).fill('1')
  await nums.nth(1).fill('1')
  await page.getByRole('button', { name: '자동 채우기' }).click()

  const wrap = page.locator('.cell-img-wrap').first()
  await page.locator('.grid-cell').first().click()
  await expect(page.locator('.fine-tune')).toBeVisible()

  // 여백 전엔 콘텐츠가 셀 전체(높이 100%).
  const hBefore = await wrap.evaluate((el) => (el as HTMLElement).style.height)
  expect(parseFloat(hBefore)).toBeCloseTo(100, 1)

  // 셀별 내부 여백 ↕ 를 올리면 콘텐츠 높이가 줄어든다.
  const padY = page.locator('.ft-field', { hasText: '내부 여백 ↕' }).locator('input[type=range]')
  await padY.fill('30')
  const hAfter = await wrap.evaluate((el) => (el as HTMLElement).style.height)
  expect(parseFloat(hAfter)).toBeLessThan(parseFloat(hBefore))

  // 초기화로 복귀.
  await page.getByRole('button', { name: '초기화' }).click()
  const hReset = await wrap.evaluate((el) => (el as HTMLElement).style.height)
  expect(parseFloat(hReset)).toBeCloseTo(100, 1)
})
