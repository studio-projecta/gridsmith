import { test, expect, type Page, type Download } from '@playwright/test'
import { makeSolidPNG } from './png'

const RED: [number, number, number] = [255, 0, 0]

function near(actual: number[], expected: number[], tol = 12) {
  return expected.every((v, i) => Math.abs(actual[i] - v) <= tol)
}

// React 가 인식하도록 native setter 로 input value 설정 후 input 이벤트 발생.
async function setNativeValue(page: Page, selector: string, value: string, nth = 0) {
  await page.locator(selector).nth(nth).evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}

// 내보낸 PNG 를 페이지에서 디코드해 지정 좌표 픽셀을 샘플링.
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

test('미세조정: 배율·오프셋이 내보내기 결과에 반영', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')

  // 유형 + 이미지 1장(red 200x200)
  await page.getByPlaceholder('새 유형 이름').fill('조정')
  await page.getByRole('button', { name: '추가' }).click()
  await page
    .locator('input[type=file]')
    .setInputFiles([{ name: 'red.png', mimeType: 'image/png', buffer: makeSolidPNG(200, 200, RED) }])
  await expect(page.locator('.tray-list .thumb')).toHaveCount(1)

  // 1x1, 400x400, gap0, contain, 배경 magenta
  const nums = page.getByRole('spinbutton') // [rows, cols, gap, outW, outH]
  await nums.nth(0).fill('1')
  await nums.nth(1).fill('1')
  await nums.nth(2).fill('0')
  await nums.nth(3).fill('400')
  await nums.nth(4).fill('400')
  await page.locator('select:has(option[value="contain"])').selectOption('contain')
  await setNativeValue(page, 'input[type=color]', '#ff00ff')

  await page.getByRole('button', { name: '자동 채우기' }).click()
  await expect(page.locator('.grid-cell img')).toHaveCount(1)

  // 미세조정 모드로 전환 후 셀 선택
  await page.getByRole('button', { name: /미세조정/ }).click()
  await page.locator('.grid-cell').first().click()

  // 배율 슬라이더(=첫 slider)를 0.5 로 → contain 이미지가 200x200 로 중앙에 축소
  await setNativeValue(page, 'input[type=range]', '0.5', 0)
  await page.waitForTimeout(400)

  const [dl1] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /내보내기/ }).click(),
  ])
  const s1 = await samplePng(page, dl1, [
    [200, 200], // 중앙 → red
    [50, 50], // 모서리 → 배경 magenta
  ])
  expect(near(s1[0], [255, 0, 0, 255])).toBeTruthy() // 중앙 red
  expect(near(s1[1], [255, 0, 255, 255])).toBeTruthy() // 모서리 magenta

  // 오프셋(가로위치=두번째 slider)을 1 로 → 이미지가 우측으로 밀려 중앙이 배경이 됨
  await setNativeValue(page, 'input[type=range]', '1', 1)
  await page.waitForTimeout(400)

  const [dl2] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /내보내기/ }).click(),
  ])
  const s2 = await samplePng(page, dl2, [
    [200, 200], // 중앙 → 이제 배경 magenta (이미지가 우측으로 이동)
    [350, 200], // 우측·세로중앙 → 이동한 red (가로만 이동하므로 y=200 유지)
  ])
  expect(near(s2[0], [255, 0, 255, 255])).toBeTruthy() // 중앙 magenta
  expect(near(s2[1], [255, 0, 0, 255])).toBeTruthy() // 우측 red
})
