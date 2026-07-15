import { test, expect } from '@playwright/test'
import { makeSolidPNG } from './png'

const BLUE: [number, number, number] = [0, 0, 255]

// STORE(무압축) ZIP 첫 항목의 저장 데이터(=PNG)를 꺼내 IHDR 의 width/height 를 읽는다.
function firstPngSize(buf: Buffer): { width: number; height: number } {
  expect(buf.readUInt32LE(0)).toBe(0x04034b50) // 로컬 파일 헤더 시그니처
  const nameLen = buf.readUInt16LE(26)
  const extraLen = buf.readUInt16LE(28)
  const data = 30 + nameLen + extraLen
  expect(buf.readUInt32BE(data)).toBe(0x89504e47) // ‰PNG
  return { width: buf.readUInt32BE(data + 16), height: buf.readUInt32BE(data + 20) }
}

function firstEntryName(buf: Buffer): string {
  const nameLen = buf.readUInt16LE(26)
  return buf.subarray(30, 30 + nameLen).toString('utf8')
}

function zipEntryCount(buf: Buffer): number {
  return buf.readUInt16LE(buf.length - 22 + 10)
}

test('가로 이미지 리사이즈 → Mobile/PC/원본 3개를 폴더로 묶어 ZIP 다운로드', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')

  await page.getByRole('button', { name: '리사이즈' }).click()
  const modal = page.locator('.split-modal')
  await expect(modal).toBeVisible()

  await modal.locator('input[type=file]').setInputFiles({
    name: 'src.png',
    mimeType: 'image/png',
    buffer: makeSolidPNG(400, 200, BLUE),
  })
  await expect(modal.getByText('선택 1개')).toBeVisible()
  await expect(modal.locator('.split-notice')).toHaveCount(0)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    modal.getByRole('button', { name: '리사이즈 다운로드' }).click(),
  ])
  // 이미지 1장이면 zip 이름은 이미지명(폴더명) 기준.
  expect(download.suggestedFilename()).toBe('src.zip')

  const fs = await import('node:fs')
  const buf = fs.readFileSync((await download.path())!)
  // 이미지 1장 → Mobile + PC + 원본 = 3개.
  expect(zipEntryCount(buf)).toBe(3)
  // 첫 항목은 폴더로 묶인 Mobile PNG, 293×248.
  expect(firstEntryName(buf)).toBe('src/src_Mobile.png')
  const { width, height } = firstPngSize(buf)
  expect(width).toBe(293)
  expect(height).toBe(248)
})

test('여러 가로 이미지 → 파일별 폴더 6개 항목', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '리사이즈' }).click()
  const modal = page.locator('.split-modal')

  await modal.locator('input[type=file]').setInputFiles([
    { name: 'first.png', mimeType: 'image/png', buffer: makeSolidPNG(400, 200, BLUE) },
    { name: 'second.png', mimeType: 'image/png', buffer: makeSolidPNG(600, 150, BLUE) },
  ])
  await expect(modal.locator('.split-thumb')).toHaveCount(2)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    modal.getByRole('button', { name: '리사이즈 다운로드' }).click(),
  ])
  const fs = await import('node:fs')
  const buf = fs.readFileSync((await download.path())!)
  // 2장 × 3(Mobile·PC·원본) = 6.
  expect(zipEntryCount(buf)).toBe(6)
  expect(firstEntryName(buf)).toMatch(/^(first|second)\/(first|second)_Mobile\.png$/)
})

test('세로 이미지는 커버 불가 안내 + 다운로드 비활성', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '리사이즈' }).click()
  const modal = page.locator('.split-modal')

  await modal.locator('input[type=file]').setInputFiles({
    name: 'tall.png',
    mimeType: 'image/png',
    buffer: makeSolidPNG(400, 600, BLUE),
  })

  await expect(modal.locator('.split-notice')).toContainText('커버할 수 없는 이미지')
  await expect(modal.getByRole('button', { name: '리사이즈 다운로드' })).toBeDisabled()

  // 전체 지우면 목록이 비어 안내가 사라진다(단일 이미지는 썸네일 개별 제거 UI 가 없다).
  await modal.getByRole('button', { name: '전체 지우기' }).click()
  await expect(modal.locator('.split-notice')).toHaveCount(0)
})
