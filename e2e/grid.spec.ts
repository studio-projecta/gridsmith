import { test, expect } from '@playwright/test'
import { makeSolidPNG } from './png'

const RED: [number, number, number] = [255, 0, 0]
const GREEN: [number, number, number] = [0, 255, 0]
const BLUE: [number, number, number] = [0, 0, 255]
const YELLOW: [number, number, number] = [255, 255, 0]

function near(actual: number[], expected: number[], tol = 12) {
  return expected.every((v, i) => Math.abs(actual[i] - v) <= tol)
}

test('end-to-end: 유형 생성 → 업로드 → 배치 → 내보내기 → 영속성', async ({ page }) => {
  page.on('dialog', (d) => d.accept())

  await page.goto('/')

  // 1) 유형 생성
  await page.getByPlaceholder('새 유형 이름').fill('샘플A')
  await page.getByRole('button', { name: '추가' }).click()
  await expect(page.getByText('샘플A')).toBeVisible()

  // 2) 이미지 4장 업로드 (순서: red, green, blue, yellow)
  await page.locator('input[type=file]').setInputFiles([
    { name: 'red.png', mimeType: 'image/png', buffer: makeSolidPNG(200, 200, RED) },
    { name: 'green.png', mimeType: 'image/png', buffer: makeSolidPNG(200, 200, GREEN) },
    { name: 'blue.png', mimeType: 'image/png', buffer: makeSolidPNG(200, 200, BLUE) },
    { name: 'yellow.png', mimeType: 'image/png', buffer: makeSolidPNG(200, 200, YELLOW) },
  ])
  await expect(page.locator('.tray-list .thumb')).toHaveCount(4)

  // 3) 그리드/출력/배경 설정: 2x2, gap 20, 400x400, 배경 magenta
  // 출력 크기를 직접 지정하려면 자동 맞춤을 먼저 끈다.
  await page.getByRole('checkbox', { name: /자동 맞춤/ }).uncheck()
  const nums = page.getByRole('spinbutton') // [rows, cols, gap, outW, outH]
  await nums.nth(0).fill('2')
  await nums.nth(1).fill('2')
  await nums.nth(2).fill('20')
  await nums.nth(3).fill('400')
  await nums.nth(4).fill('400')
  await page.locator('input[type=color]').evaluate((el: HTMLInputElement) => {
    // React 는 native value 트래커로 변경을 감지하므로 prototype setter 를 사용.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(el, '#ff00ff')
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })

  // 4) 자동 채우기
  await page.getByRole('button', { name: '자동 채우기' }).click()
  await expect(page.locator('.grid-cell img')).toHaveCount(4)

  // 저장 디바운스(300ms) 플러시 대기
  await page.waitForTimeout(500)

  // 5) 내보내기 → 다운로드 캡처
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /내보내기/ }).click(),
  ])
  const filePath = await download.path()
  expect(filePath).toBeTruthy()

  // 6) 내보낸 PNG 를 페이지에서 디코드해 픽셀 검증
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
      bg: px(5, 5), // 바깥 여백 → 배경색
      cell0: px(105, 105), // 셀0(top-left) 중앙 → 첫 이미지(red)
      cell1: px(295, 105), // 셀1(top-right) 중앙 → 두번째(green)
    }
  }, `data:image/png;base64,${b64}`)

  // 출력 크기 == 설정값
  expect(result.w).toBe(400)
  expect(result.h).toBe(400)
  // 배경색 magenta
  expect(near(result.bg, [255, 0, 255, 255])).toBeTruthy()
  // 배치/순서: 셀0=red, 셀1=green
  expect(near(result.cell0, [255, 0, 0, 255])).toBeTruthy()
  expect(near(result.cell1, [0, 255, 0, 255])).toBeTruthy()

  // 7) 새로고침 후 영속성
  await page.reload()
  await expect(page.getByText('샘플A')).toBeVisible()
  await expect(page.locator('.grid-cell img')).toHaveCount(4)
})
