import { test, expect } from '@playwright/test'
import { makeSolidPNG } from './png'

const RED: [number, number, number] = [255, 0, 0]

function near(actual: number[], expected: number[], tol = 12) {
  return expected.every((v, i) => Math.abs(actual[i] - v) <= tol)
}

test('배경 테두리: 가장자리에 그려지고 셀 배치는 밀리지 않음', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')

  await page.getByPlaceholder('새 유형 이름').fill('테두리')
  await page.getByRole('button', { name: '추가' }).click()

  // 200x200 이미지 1장, 1x1 그리드 → 자동 크기 200x200, 셀이 출력 전체를 채움.
  await page.locator('input[type=file]').setInputFiles([
    { name: 'red.png', mimeType: 'image/png', buffer: makeSolidPNG(200, 200, RED) },
  ])
  await expect(page.locator('.tray-list .thumb')).toHaveCount(1)

  const nums = page.getByRole('spinbutton') // [rows, cols, gap, marginX, marginY, border]
  await nums.nth(0).fill('1')
  await nums.nth(1).fill('1')
  await page.getByRole('button', { name: '자동 채우기' }).click()
  await expect(page.locator('.grid-cell img')).toHaveCount(1)

  // 테두리 두께 20px 설정 → 미리보기에 오버레이 SVG 가 나타난다.
  await page.getByLabel('테두리').fill('20')
  await expect(page.locator('.border-overlay')).toBeVisible()

  await page.waitForTimeout(500) // 저장 디바운스

  // 내보내기(PNG)
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
      corner: px(3, 3), // 테두리(두께 20) 안 → 검정
      edge: px(10, 100), // 좌측 테두리 밴드(0..20) → 검정
      inside: px(30, 100), // 테두리 밖 → 이미지(red), 즉 콘텐츠가 안쪽으로 밀리지 않음
      center: px(100, 100), // 중앙 → 이미지(red)
    }
  }, `data:image/png;base64,${b64}`)

  // 테두리는 출력 크기를 바꾸지 않는다(들여쓰기 영향 X).
  expect(result.w).toBe(200)
  expect(result.h).toBe(200)
  expect(near(result.corner, [0, 0, 0, 255])).toBeTruthy()
  expect(near(result.edge, [0, 0, 0, 255])).toBeTruthy()
  expect(near(result.inside, [255, 0, 0, 255])).toBeTruthy()
  expect(near(result.center, [255, 0, 0, 255])).toBeTruthy()
})
