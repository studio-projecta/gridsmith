import { test, expect } from '@playwright/test'
import { makeSolidPNG } from './png'

const RED: [number, number, number] = [255, 0, 0]
const GREEN: [number, number, number] = [0, 255, 0]

test('재배치: 셀 이미지를 다른 셀로 드래그하면 스왑된다', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')

  await page.getByPlaceholder('새 유형 이름').fill('스왑')
  await page.getByRole('button', { name: '추가' }).click()
  await page.locator('input[type=file]').setInputFiles([
    { name: 'red.png', mimeType: 'image/png', buffer: makeSolidPNG(200, 200, RED) },
    { name: 'green.png', mimeType: 'image/png', buffer: makeSolidPNG(200, 200, GREEN) },
  ])
  await expect(page.locator('.tray-list .thumb')).toHaveCount(2)

  await page.getByRole('checkbox', { name: /자동 맞춤/ }).uncheck()
  const nums = page.getByRole('spinbutton')
  await nums.nth(0).fill('1')
  await nums.nth(1).fill('2')
  await nums.nth(2).fill('0')
  await nums.nth(3).fill('400')
  await nums.nth(4).fill('200')

  await page.getByRole('button', { name: '자동 채우기' }).click()
  await expect(page.locator('.grid-cell img')).toHaveCount(2)
  await page.waitForTimeout(300)

  // 셀0(왼쪽) 이미지를 셀1(오른쪽)로 드래그
  const cell0 = page.locator('.grid-cell').nth(0)
  const cell1 = page.locator('.grid-cell').nth(1)
  const b0 = await cell0.boundingBox()
  const b1 = await cell1.boundingBox()
  if (!b0 || !b1) throw new Error('no bbox')

  await page.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2)
  await page.mouse.down()
  // dnd-kit 활성화(거리 5) 후 타겟까지 여러 스텝 이동
  await page.mouse.move(b0.x + b0.width / 2 + 10, b0.y + b0.height / 2, { steps: 3 })
  await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(300)

  // 스왑 결과 확인: 내보내기로 픽셀 검사
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /내보내기/ }).click(),
  ])
  const fs = await import('node:fs')
  const b64 = fs.readFileSync((await dl.path())!).toString('base64')
  const res = await page.evaluate(async (dataUrl) => {
    const img = new Image()
    await new Promise((r, j) => {
      img.onload = r
      img.onerror = j
      img.src = dataUrl
    })
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const px = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data)
    return { left: px(100, 100), right: px(300, 100) }
  }, `data:image/png;base64,${b64}`)

  // 스왑됐다면 왼쪽=green, 오른쪽=red
  expect(res.left[1]).toBeGreaterThan(200) // green channel high on left
  expect(res.right[0]).toBeGreaterThan(200) // red channel high on right
})
