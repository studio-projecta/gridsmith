import { test, expect, type Page, type Download } from '@playwright/test'
import { makeSolidPNG } from './png'

const RED: [number, number, number] = [255, 0, 0]

async function samplePng(page: Page, download: Download, points: [number, number][]) {
  const fs = await import('node:fs')
  const path = await download.path()
  const b64 = fs.readFileSync(path!).toString('base64')
  return page.evaluate(
    async ({ dataUrl, pts }) => {
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
      return pts.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data))
    },
    { dataUrl: `data:image/png;base64,${b64}`, pts: points },
  )
}

test('투명 배경: PNG 내보내기 시 배경 영역의 알파가 0', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')

  await page.getByPlaceholder('새 유형 이름').fill('투명')
  await page.getByRole('button', { name: '추가' }).click()
  await page
    .locator('input[type=file]')
    .setInputFiles([{ name: 'r.png', mimeType: 'image/png', buffer: makeSolidPNG(200, 200, RED) }])
  await expect(page.locator('.tray-list .thumb')).toHaveCount(1)

  // 2x2, gap 40. 출력은 자동 맞춤(첫 이미지 200x200 × 2x2 + gap 40*3 = 520x520).
  const nums = page.getByRole('spinbutton')
  await nums.nth(0).fill('2')
  await nums.nth(1).fill('2')
  await nums.nth(2).fill('40')

  // 투명 배경 켜기 → 색상 입력 비활성
  await page.getByRole('checkbox', { name: '투명 배경' }).check()
  await expect(page.locator('input[type=color]')).toBeDisabled()

  // 한 셀만 채움(셀0)
  await page.getByRole('button', { name: '자동 채우기' }).click()
  await page.waitForTimeout(400)

  await page.locator('.export-group').getByRole('button').click()
  const modal = page.locator('.export-modal')
  await expect(modal).toBeVisible()
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    modal.getByRole('button', { name: /내보내기/ }).click(),
  ])
  const [bg, cell0] = await samplePng(page, dl, [
    [5, 5], // 바깥 여백(gap 40) → 투명(alpha 0)
    [140, 140], // 셀0 중앙 → red(불투명)
  ])

  expect(bg[3]).toBe(0) // 배경 알파 0
  expect(cell0[3]).toBe(255) // 이미지 불투명
  expect(Math.abs(cell0[0] - 255) <= 12).toBeTruthy() // red
})
