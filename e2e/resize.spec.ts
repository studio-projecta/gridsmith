import { test, expect, type Page } from '@playwright/test'
import { makeSolidPNG, makeNoisePNG } from './png'

const BLUE: [number, number, number] = [0, 0, 255]

// STORE(무압축) ZIP 의 로컬 헤더를 순회해 각 항목의 {name, size} 를 읽는다(저장 크기 = 원본 크기).
function zipEntries(buf: Buffer): { name: string; size: number }[] {
  const out: { name: string; size: number }[] = []
  let p = 0
  while (p + 4 <= buf.length && buf.readUInt32LE(p) === 0x04034b50) {
    const size = buf.readUInt32LE(p + 18) // compressed size (STORE 이므로 저장 크기)
    const nameLen = buf.readUInt16LE(p + 26)
    const extraLen = buf.readUInt16LE(p + 28)
    const name = buf.subarray(p + 30, p + 30 + nameLen).toString('utf8')
    out.push({ name, size })
    p += 30 + nameLen + extraLen + size
  }
  return out
}

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

// 라벨로 슬롯을 찾아 파일을 넣는다(빈 슬롯에만 input 이 있다).
async function setSlot(
  page: Page,
  label: '모바일용' | 'PC용',
  file: { name: string; buffer: Buffer },
) {
  const slot = page.locator('.resize-slot').filter({ hasText: label })
  await slot.locator('input[type=file]').setInputFiles({
    name: file.name,
    mimeType: 'image/png',
    buffer: file.buffer,
  })
}

test('모바일·PC 각각 입력 → 모바일명 폴더로 Mobile/PC/원본 3개 ZIP', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '리사이즈' }).click()
  const modal = page.locator('.split-modal')
  await expect(modal).toBeVisible()

  await setSlot(page, '모바일용', { name: 'mob.png', buffer: makeSolidPNG(400, 200, BLUE) })
  await setSlot(page, 'PC용', { name: 'desk.png', buffer: makeSolidPNG(600, 150, BLUE) })
  await expect(modal.locator('.split-notice')).toHaveCount(0)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    modal.getByRole('button', { name: '리사이즈 다운로드' }).click(),
  ])
  // zip 이름은 모바일 이미지 이름 기준.
  expect(download.suggestedFilename()).toBe('mob.zip')

  const fs = await import('node:fs')
  const buf = fs.readFileSync((await download.path())!)
  // Mobile + PC + 원본 = 3개, 모두 모바일명 폴더/stem.
  expect(zipEntryCount(buf)).toBe(3)
  const names = zipEntries(buf).map((e) => e.name)
  expect(names).toEqual(['mob/mob_Mobile.png', 'mob/mob_PC.png', 'mob/mob_Weflab.png'])
  // 첫 항목은 Mobile PNG, 293×248.
  expect(firstEntryName(buf)).toBe('mob/mob_Mobile.png')
  const { width, height } = firstPngSize(buf)
  expect(width).toBe(293)
  expect(height).toBe(248)

  // 단색 이미지는 무손실(oxipng)로 목표 이하 → "무손실 최적화" 라벨.
  await expect(modal.locator('.split-result')).toContainText('무손실 최적화')
})

test('노이즈 모바일 이미지는 손실 폴백으로 _Mobile/_PC 각 50KB 미만', async ({ page }) => {
  test.setTimeout(60_000) // 양자화 폴백은 여러 번 인코딩해 시간이 걸린다.
  await page.goto('/')
  await page.getByRole('button', { name: '리사이즈' }).click()
  const modal = page.locator('.split-modal')

  // 모바일 슬롯에 293×200 고엔트로피 노이즈 → 무손실로는 50KB 를 넘겨 손실 폴백을 강제한다.
  await setSlot(page, '모바일용', { name: 'noise.png', buffer: makeNoisePNG(293, 200) })
  await setSlot(page, 'PC용', { name: 'desk.png', buffer: makeSolidPNG(400, 200, BLUE) })

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    modal.getByRole('button', { name: '리사이즈 다운로드' }).click(),
  ])
  const fs = await import('node:fs')
  const buf = fs.readFileSync((await download.path())!)
  const generated = zipEntries(buf).filter(
    (e) => e.name.endsWith('_Mobile.png') || e.name.endsWith('_PC.png'),
  )
  expect(generated.length).toBe(2)
  for (const e of generated) {
    expect(e.size, `${e.name} 가 50KB 미만이어야 함`).toBeLessThan(50 * 1024)
  }

  // 모바일이 손실 폴백을 거쳤으므로 "손실 최적화" 라벨(무손실 아님).
  const label = modal.locator('.split-result')
  await expect(label).toContainText('손실 최적화')
  await expect(label).not.toContainText('무손실')
})

test('규격을 못 덮는 슬롯이 있으면 그 슬롯에 안내 + 다운로드 비활성', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '리사이즈' }).click()
  const modal = page.locator('.split-modal')

  // 모바일 슬롯에 세로형(400×600) → Mobile 규격 커버 불가.
  await setSlot(page, '모바일용', { name: 'tall.png', buffer: makeSolidPNG(400, 600, BLUE) })
  await setSlot(page, 'PC용', { name: 'desk.png', buffer: makeSolidPNG(400, 200, BLUE) })

  const mobileSlot = modal.locator('.resize-slot').filter({ hasText: '모바일용' })
  await expect(mobileSlot.locator('.split-notice')).toContainText('커버할 수 없어요')
  await expect(modal.getByRole('button', { name: '리사이즈 다운로드' })).toBeDisabled()

  // 모바일 슬롯을 덮을 수 있는 이미지로 교체(제거 후 재선택) → 안내 사라지고 활성화.
  await mobileSlot.getByRole('button', { name: '제거' }).click()
  await setSlot(page, '모바일용', { name: 'mob.png', buffer: makeSolidPNG(400, 200, BLUE) })
  await expect(modal.locator('.split-notice')).toHaveCount(0)
  await expect(modal.getByRole('button', { name: '리사이즈 다운로드' })).toBeEnabled()
})
