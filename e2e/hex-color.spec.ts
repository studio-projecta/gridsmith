import { test, expect } from '@playwright/test'
import { makeSolidPNG } from './png'

const RED: [number, number, number] = [255, 0, 0]

function near(actual: number[], expected: number[], tol = 12) {
  return expected.every((v, i) => Math.abs(actual[i] - v) <= tol)
}

test('hex/rgb 입력: 배경색은 hex, 테두리색은 rgb 로 지정', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')

  await page.getByPlaceholder('새 유형 이름').fill('hex')
  await page.getByRole('button', { name: '추가' }).click()

  await page.locator('input[type=file]').setInputFiles([
    { name: 'red.png', mimeType: 'image/png', buffer: makeSolidPNG(200, 200, RED) },
  ])
  await expect(page.locator('.tray-list .thumb')).toHaveCount(1)

  const nums = page.getByRole('spinbutton') // [rows, cols, gap, marginX, marginY, border]
  await nums.nth(0).fill('1')
  await nums.nth(1).fill('1')
  await nums.nth(3).fill('30') // 여백↔
  await nums.nth(4).fill('30') // 여백↕
  await page.getByRole('button', { name: '자동 채우기' }).click()
  await expect(page.locator('.grid-cell img')).toHaveCount(1)

  // 배경색: hex 텍스트로 초록
  await page.getByLabel('배경색 hex', { exact: true }).fill('#00ff00')
  // 테두리: 두께 10 + rgb 텍스트로 파랑
  await page.getByLabel('테두리', { exact: true }).fill('10')
  await page.getByLabel('테두리색 hex', { exact: true }).fill('0,0,255')

  // color 선택기와도 동기화됐는지 확인(정규화된 #0000ff)
  await expect(page.getByLabel('테두리 색', { exact: true })).toHaveValue('#0000ff')

  await page.waitForTimeout(500)

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
      border: px(3, 130), // 테두리 밴드(0..10) → 파랑
      bg: px(20, 130), // 여백 밴드(10..30) → 초록 배경
      center: px(130, 130), // 셀(30..230) → 빨강 이미지
    }
  }, `data:image/png;base64,${b64}`)

  expect(result.w).toBe(260) // 200 + 여백 30*2
  expect(near(result.border, [0, 0, 255, 255])).toBeTruthy()
  expect(near(result.bg, [0, 255, 0, 255])).toBeTruthy()
  expect(near(result.center, [255, 0, 0, 255])).toBeTruthy()
})
