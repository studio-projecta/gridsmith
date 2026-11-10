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

function firstEntryName(buf: Buffer): string {
  const nameLen = buf.readUInt16LE(26)
  return buf.subarray(30, 30 + nameLen).toString('utf8')
}

function zipEntryCount(buf: Buffer): number {
  return buf.readUInt16LE(buf.length - 22 + 10)
}

// STORE(무압축) ZIP 의 로컬 헤더를 순회해 각 항목의 {name, size} 를 읽는다(저장 크기 = 원본 크기).
function zipEntries(buf: Buffer): { name: string; size: number }[] {
  const out: { name: string; size: number }[] = []
  let p = 0
  while (p + 4 <= buf.length && buf.readUInt32LE(p) === 0x04034b50) {
    const size = buf.readUInt32LE(p + 18)
    const nameLen = buf.readUInt16LE(p + 26)
    const extraLen = buf.readUInt16LE(p + 28)
    const name = buf.subarray(p + 30, p + 30 + nameLen).toString('utf8')
    out.push({ name, size })
    p += 30 + nameLen + extraLen + size
  }
  return out
}

test('이미지 분할 → 1441×452 를 2x3 로 나눠 720×150 6장 ZIP 다운로드', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')

  await page.getByRole('button', { name: '분할' }).click()
  const modal = page.locator('.split-modal')
  await expect(modal).toBeVisible()

  const src = makeSolidPNG(1441, 452, BLUE)
  await modal.locator('input[type=file]').setInputFiles({
    name: 'src.png',
    mimeType: 'image/png',
    buffer: src,
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
  // 조각 6장 + 원본 1장. 원본은 조각 뒤에 원래 이름·바이트 그대로 담긴다.
  expect(entries).toBe(7)
  expect(width).toBe(720)
  expect(height).toBe(150)
  expect(zipEntries(buf).at(-1)).toEqual({ name: 'src.png', size: src.length })
})

test('원본 포함을 끄면 조각만 담긴다', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '분할' }).click()
  const modal = page.locator('.split-modal')

  await modal.locator('input[type=file]').setInputFiles({
    name: 'src.png',
    mimeType: 'image/png',
    buffer: makeSolidPNG(1441, 452, BLUE),
  })
  await modal.getByLabel('원본 포함').uncheck()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    modal.getByRole('button', { name: '분할 다운로드' }).click(),
  ])
  const fs = await import('node:fs')
  const names = zipEntries(fs.readFileSync((await download.path())!)).map((e) => e.name)
  expect(names).toHaveLength(6)
  expect(names).not.toContain('src.png')
})

test('원본 이름이 조각 이름과 같으면 -original 을 붙여 구분한다', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '분할' }).click()
  const modal = page.locator('.split-modal')

  await modal.locator('input[type=file]').setInputFiles({
    name: 'r1c1.png',
    mimeType: 'image/png',
    buffer: makeSolidPNG(1441, 452, BLUE),
  })

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    modal.getByRole('button', { name: '분할 다운로드' }).click(),
  ])
  const fs = await import('node:fs')
  const names = zipEntries(fs.readFileSync((await download.path())!)).map((e) => e.name)
  expect(names).toHaveLength(7)
  expect(names).toContain('r1c1.png')
  expect(names).toContain('r1c1-original.png')
})

test('여러 이미지 일괄 분할 → 파일별 폴더로 묶인 ZIP', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')

  await page.getByRole('button', { name: '분할' }).click()
  const modal = page.locator('.split-modal')

  await modal.locator('input[type=file]').setInputFiles([
    { name: 'first.png', mimeType: 'image/png', buffer: makeSolidPNG(1441, 452, BLUE) },
    { name: 'second.png', mimeType: 'image/png', buffer: makeSolidPNG(601, 302, BLUE) },
  ])

  // 2장 × 2x3 = 총 12장.
  await expect(modal.getByText('총 12장')).toBeVisible()
  await expect(modal.locator('.split-thumb')).toHaveCount(2)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    modal.getByRole('button', { name: '분할 다운로드' }).click(),
  ])
  const fs = await import('node:fs')
  const buf = fs.readFileSync((await download.path())!)
  // 조각 12장 + 원본 2장.
  expect(zipEntryCount(buf)).toBe(14)
  // 여러 장이면 원본 파일명 폴더로 묶인다.
  expect(firstEntryName(buf)).toMatch(/^(first|second)\/r\dc\d\.png$/)
  const names = zipEntries(buf).map((e) => e.name)
  expect(names).toContain('first/first.png')
  expect(names).toContain('second/second.png')
})

test('여러 번 선택하면 누적된다(다른 디렉터리 취합) + 개별 제거', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '분할' }).click()
  const modal = page.locator('.split-modal')
  const input = modal.locator('input[type=file]')

  // 1차 선택 2장
  await input.setInputFiles([
    { name: 'a.png', mimeType: 'image/png', buffer: makeSolidPNG(600, 300, BLUE) },
    { name: 'b.png', mimeType: 'image/png', buffer: makeSolidPNG(600, 300, BLUE) },
  ])
  await expect(modal.getByText('선택 2개')).toBeVisible()

  // 2차 선택 1장 → 덮어쓰지 않고 누적되어 3장
  await input.setInputFiles([
    { name: 'c.png', mimeType: 'image/png', buffer: makeSolidPNG(600, 300, BLUE) },
  ])
  await expect(modal.getByText('선택 3개')).toBeVisible()
  await expect(modal.locator('.split-thumb')).toHaveCount(3)

  // 개별 제거 → 2장
  await modal.locator('.split-thumb-remove').first().click()
  await expect(modal.getByText('선택 2개')).toBeVisible()

  // 전체 지우기 → 선택 없음
  await modal.getByRole('button', { name: '전체 지우기' }).click()
  await expect(modal.locator('.split-thumb')).toHaveCount(0)
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
