import { test, expect } from '@playwright/test'
import { makeSolidPNG } from './png'

const RED: [number, number, number] = [255, 0, 0]

function near(actual: number[], expected: number[], tol = 12) {
  return expected.every((v, i) => Math.abs(actual[i] - v) <= tol)
}

/** React 의 native value 트래커를 우회해 color input 값을 설정. */
async function setColor(input: import('@playwright/test').Locator, hex: string) {
  await input.evaluate((el: HTMLInputElement, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, hex)
}

test('테두리 색: 지정한 색으로 가장자리에 그려짐', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')

  await page.getByPlaceholder('새 유형 이름').fill('색테두리')
  await page.getByRole('button', { name: '추가' }).click()

  await page.locator('input[type=file]').setInputFiles([
    { name: 'red.png', mimeType: 'image/png', buffer: makeSolidPNG(200, 200, RED) },
  ])
  await expect(page.locator('.tray-list .thumb')).toHaveCount(1)

  const nums = page.getByRole('spinbutton')
  await nums.nth(0).fill('1')
  await nums.nth(1).fill('1')
  await page.getByRole('button', { name: '자동 채우기' }).click()
  await expect(page.locator('.grid-cell img')).toHaveCount(1)

  // 테두리 두께 20 + 색 파랑
  await page.getByLabel('테두리', { exact: true }).fill('20')
  await setColor(page.getByLabel('테두리 색', { exact: true }), '#0000ff')
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
    return { corner: px(3, 3), center: px(100, 100) }
  }, `data:image/png;base64,${b64}`)

  expect(near(result.corner, [0, 0, 255, 255])).toBeTruthy() // 테두리 = 파랑
  expect(near(result.center, [255, 0, 0, 255])).toBeTruthy() // 내용 = 빨강
})
