import { test, expect } from '@playwright/test'
import { makeSolidPNG } from './png'

const BLUE: [number, number, number] = [0, 0, 255]

// STORE(무압축) ZIP 첫 항목의 저장 데이터(=PNG)를 꺼내 IHDR 의 width/height 를 읽는다.
function firstPngSize(buf: Buffer): { width: number; height: number; entries: number } {
  expect(buf.readUInt32LE(0)).toBe(0x04034b50) // 로컬 파일 헤더 시그니처
  const nameLen = buf.readUInt16LE(26)
  const extraLen = buf.readUInt16LE(28)
  const data = 30 + nameLen + extraLen
  // PNG: 8B 시그니처 + 4B 청크길이 + 'IHDR' → width@+16, height@+20.
  expect(buf.readUInt32BE(data)).toBe(0x89504e47) // ‰PNG
  const width = buf.readUInt32BE(data + 16)
  const height = buf.readUInt32BE(data + 20)
  const eocd = buf.length - 22
  const entries = buf.readUInt16LE(eocd + 10)
  return { width, height, entries }
}

test('이미지 분할 → 1441×452 를 2x3 로 나눠 720×150 6장 ZIP 다운로드', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')

  await page.getByRole('button', { name: '분할' }).click()
  const modal = page.locator('.split-modal')
  await expect(modal).toBeVisible()

  await modal.locator('input[type=file]').setInputFiles({
    name: 'src.png',
    mimeType: 'image/png',
    buffer: makeSolidPNG(1441, 452, BLUE),
  })

  // 비율 기본값 2x3. 결과 텍스트가 720×150 6개로 계산되고 버림 안내가 없다.
  await expect(modal.getByText('6개')).toBeVisible()
  await expect(modal.getByText('720×150')).toBeVisible()
  await expect(modal.locator('.split-notice')).toHaveCount(0)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    modal.getByRole('button', { name: '분할 다운로드' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('split-2x3.zip')

  const fs = await import('node:fs')
  const buf = fs.readFileSync((await download.path())!)
  const { width, height, entries } = firstPngSize(buf)
  expect(entries).toBe(6)
  expect(width).toBe(720)
  expect(height).toBe(150)
})

test('나눠떨어지지 않으면 버림 안내가 뜬다', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '분할' }).click()
  const modal = page.locator('.split-modal')

  await modal.locator('input[type=file]').setInputFiles({
    name: 'src.png',
    mimeType: 'image/png',
    buffer: makeSolidPNG(1000, 452, BLUE),
  })
  // 1000×452, 2x3, sep1: 오른쪽 1px 버림.
  await expect(modal.locator('.split-notice')).toContainText('오른쪽 1px')
})
