import { test, expect } from '@playwright/test'
import { makeSolidPNG } from './png'

const RED: [number, number, number] = [255, 0, 0]

function near(actual: number[], expected: number[], tol = 12) {
  return expected.every((v, i) => Math.abs(actual[i] - v) <= tol)
}

test('셀 배경색: 셀 영역만 채워지고 그리드 여백엔 배경색이 남는다', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')

  await page.getByPlaceholder('새 유형 이름').fill('셀 배경')
  await page.getByRole('button', { name: '추가' }).click()

  // 200x200 이미지 1장, 1x1 그리드. 바깥 여백 30 → 출력 260x260, 셀은 30..230.
  await page.locator('input[type=file]').setInputFiles([
    { name: 'red.png', mimeType: 'image/png', buffer: makeSolidPNG(200, 200, RED) },
  ])
  await expect(page.locator('.tray-list .thumb')).toHaveCount(1)

  const nums = page.getByRole('spinbutton')
  await nums.nth(0).fill('1')
  await nums.nth(1).fill('1')
  await page.getByRole('button', { name: '자동 채우기' }).click()
  await expect(page.locator('.grid-cell img')).toHaveCount(1)

  await page.getByLabel('그리드 여백 가로', { exact: true }).fill('30')
  await page.getByLabel('그리드 여백 세로', { exact: true }).fill('30')
  // 셀 내부 여백 40 → 콘텐츠 30+40..230-40 = 70..190. 여백 밴드는 셀 배경색이 보인다.
  await page.getByLabel('셀 내부 여백 가로', { exact: true }).fill('40')
  await page.getByLabel('셀 내부 여백 세로', { exact: true }).fill('40')

  // 셀 배경 켜고 파랑으로.
  await page.getByRole('checkbox', { name: '사용' }).check()
  await page.getByLabel('셀 배경색 hex', { exact: true }).fill('#0000ff')
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
      margin: px(10, 130), // 바깥 여백(0..30) → 배경 흰색
      cellPad: px(50, 130), // 셀 안(30..230)의 내부 여백 밴드(30..70) → 셀 배경 파랑
      content: px(130, 130), // 콘텐츠 → 이미지 red
    }
  }, `data:image/png;base64,${b64}`)

  expect(result.w).toBe(260)
  expect(result.h).toBe(260)
  expect(near(result.margin, [255, 255, 255, 255])).toBeTruthy()
  expect(near(result.cellPad, [0, 0, 255, 255])).toBeTruthy()
  expect(near(result.content, [255, 0, 0, 255])).toBeTruthy()
})
