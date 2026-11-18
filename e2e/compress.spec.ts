import fs from 'node:fs'
import { test, expect, type Locator, type Page } from '@playwright/test'
import { makeSolidPNG, makeNoisePNG } from './png'

const BLUE: [number, number, number] = [0, 0, 255]

interface PngFile {
  name: string
  buffer: Buffer
  mimeType?: string
}

// STORE(무압축) ZIP 의 로컬 헤더를 순회해 각 항목의 {name, data} 를 읽는다.
function zipEntries(buf: Buffer): { name: string; data: Buffer }[] {
  const out: { name: string; data: Buffer }[] = []
  let p = 0
  while (p + 4 <= buf.length && buf.readUInt32LE(p) === 0x04034b50) {
    const size = buf.readUInt32LE(p + 18)
    const nameLen = buf.readUInt16LE(p + 26)
    const extraLen = buf.readUInt16LE(p + 28)
    const start = p + 30 + nameLen + extraLen
    out.push({
      name: buf.subarray(p + 30, p + 30 + nameLen).toString('utf8'),
      data: buf.subarray(start, start + size),
    })
    p = start + size
  }
  return out
}

// PNG IHDR 의 width/height/color type 을 읽는다.
function pngHeader(buf: Buffer): { width: number; height: number; colorType: number } {
  expect(buf.readUInt32BE(0)).toBe(0x89504e47) // ‰PNG
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25] }
}

async function openCompress(page: Page): Promise<Locator> {
  await page.goto('/')
  await page.getByRole('button', { name: '리사이즈' }).click()
  const modal = page.locator('.split-modal')
  await modal.getByRole('button', { name: '용량 줄이기' }).click()
  return modal
}

async function addFiles(modal: Locator, files: PngFile[]) {
  await modal
    .locator('input[type=file]')
    .setInputFiles(files.map((f) => ({ mimeType: 'image/png', ...f })))
}

async function download(page: Page, modal: Locator): Promise<{ name: string; buf: Buffer }> {
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    modal.getByRole('button', { name: '압축 다운로드' }).click(),
  ])
  return { name: dl.suggestedFilename(), buf: fs.readFileSync((await dl.path())!) }
}

test('품질 유지: 1장은 같은 이름·같은 크기의 PNG 로, 무손실로 줄어든다', async ({ page }) => {
  const modal = await openCompress(page)
  // 단색을 필터 없이 deflate 한 PNG 라 무손실 재압축만으로도 줄어든다.
  const src = makeSolidPNG(640, 360, BLUE)
  await addFiles(modal, [{ name: 'photo.png', buffer: src }])
  await expect(modal.locator('.compress-row')).toContainText('640×360')

  const { name, buf } = await download(page, modal)
  expect(name).toBe('photo.png')
  expect(pngHeader(buf)).toMatchObject({ width: 640, height: 360 })
  expect(buf.length).toBeLessThan(src.length)

  const label = modal.locator('.split-result')
  await expect(label).toContainText('무손실 최적화')
  await expect(modal.locator('.compress-row')).toContainText('감소')
})

test('용량 우선: 노이즈 이미지는 크기 그대로 팔레트 PNG 가 되고 품질 유지보다 작다', async ({ page }) => {
  test.setTimeout(60_000)
  const modal = await openCompress(page)
  const src = makeNoisePNG(300, 200)
  await addFiles(modal, [{ name: 'noise.png', buffer: src }])

  const lossless = await download(page, modal)
  expect(pngHeader(lossless.buf).colorType).toBe(2) // truecolor 유지

  await modal.getByRole('button', { name: '용량 우선' }).click()
  // 방식을 바꾸면 이전 결과 표시는 사라진다.
  await expect(modal.locator('.split-result')).toHaveCount(0)

  const lossy = await download(page, modal)
  expect(lossy.name).toBe('noise.png')
  expect(pngHeader(lossy.buf)).toEqual({ width: 300, height: 200, colorType: 3 })
  expect(lossy.buf.length).toBeLessThan(lossless.buf.length)
  expect(lossy.buf.length).toBeLessThan(src.length)

  const label = modal.locator('.split-result')
  await expect(label).toContainText('손실 최적화')
  await expect(label).not.toContainText('무손실')
})

test('여러 장은 compressed.zip 으로 묶고, 같은 이름은 -1 로 구분한다', async ({ page }) => {
  const modal = await openCompress(page)
  await addFiles(modal, [
    { name: 'a.png', buffer: makeSolidPNG(200, 100, BLUE) },
    { name: 'a.png', buffer: makeSolidPNG(120, 300, BLUE) },
    { name: 'b.png', buffer: makeSolidPNG(50, 50, BLUE) },
  ])
  await expect(modal.locator('.compress-row')).toHaveCount(3)

  const { name, buf } = await download(page, modal)
  expect(name).toBe('compressed.zip')
  const entries = zipEntries(buf)
  expect(entries.map((e) => e.name)).toEqual(['a.png', 'a-1.png', 'b.png'])
  // 각 항목은 원본 픽셀 크기를 유지한다.
  expect(entries.map((e) => pngHeader(e.data)).map((h) => [h.width, h.height])).toEqual([
    [200, 100],
    [120, 300],
    [50, 50],
  ])
})

test('PNG 가 아닌 파일은 제외하고 안내하며, 목록이 비면 다운로드가 비활성이다', async ({ page }) => {
  const modal = await openCompress(page)
  const button = modal.getByRole('button', { name: '압축 다운로드' })
  await expect(button).toBeDisabled()

  await addFiles(modal, [
    { name: 'note.jpg', buffer: Buffer.from('not an image'), mimeType: 'image/jpeg' },
    { name: 'broken.png', buffer: Buffer.from('not a png') },
  ])
  await expect(modal.locator('.split-notice')).toContainText('2개는 제외')
  await expect(modal.locator('.compress-row')).toHaveCount(0)
  await expect(button).toBeDisabled()

  await addFiles(modal, [{ name: 'ok.png', buffer: makeSolidPNG(10, 10, BLUE) }])
  await expect(modal.locator('.split-notice')).toHaveCount(0)
  await expect(button).toBeEnabled()

  await modal.locator('.compress-row').getByRole('button', { name: '제거' }).click()
  await expect(button).toBeDisabled()
})

test('더 줄일 수 없는 PNG 는 원본 바이트 그대로 내려준다', async ({ page }) => {
  const modal = await openCompress(page)
  // 먼저 한 번 압축한 결과를 다시 넣으면 더 줄어들 여지가 없다.
  await addFiles(modal, [{ name: 'first.png', buffer: makeSolidPNG(64, 64, BLUE) }])
  const first = await download(page, modal)

  await modal.locator('.compress-row').getByRole('button', { name: '제거' }).click()
  await addFiles(modal, [{ name: 'again.png', buffer: first.buf }])
  const second = await download(page, modal)

  expect(second.buf.equals(first.buf)).toBe(true)
  await expect(modal.locator('.split-result')).toContainText('원본 그대로')
})

test('탭을 오가도 규격 맞춤 입력은 유지된다', async ({ page }) => {
  const modal = await openCompress(page)
  await modal.getByRole('button', { name: '규격 맞춤' }).click()
  await expect(modal.locator('.resize-slot')).toHaveCount(2)
  await modal
    .locator('.resize-slot')
    .filter({ hasText: '모바일용' })
    .locator('input[type=file]')
    .setInputFiles({ name: 'mob.png', mimeType: 'image/png', buffer: makeSolidPNG(400, 200, BLUE) })

  await modal.getByRole('button', { name: '용량 줄이기' }).click()
  await modal.getByRole('button', { name: '규격 맞춤' }).click()
  await expect(modal.locator('.resize-slot').filter({ hasText: '모바일용' })).toContainText('mob.png')
})
