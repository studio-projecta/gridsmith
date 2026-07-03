import { test, expect } from '@playwright/test'
import { makeSolidPNG } from './png'

const RED: [number, number, number] = [255, 0, 0]
const GREEN: [number, number, number] = [0, 255, 0]

test('백업 내보내기 → 가져오기(병합) 왕복으로 유형·이미지·배치가 복원된다', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')

  // 유형 + 이미지 2장 + 2x1 자동 채우기
  await page.getByPlaceholder('새 유형 이름').fill('백업원본')
  await page.getByRole('button', { name: '추가' }).click()
  await page.locator('.uploader input[type=file]').setInputFiles([
    { name: 'red.png', mimeType: 'image/png', buffer: makeSolidPNG(120, 120, RED) },
    { name: 'green.png', mimeType: 'image/png', buffer: makeSolidPNG(120, 120, GREEN) },
  ])
  await expect(page.locator('.tray-list .thumb')).toHaveCount(2)
  const nums = page.getByRole('spinbutton') // [rows, cols, gap]
  await nums.nth(0).fill('1')
  await nums.nth(1).fill('2')
  await page.getByRole('button', { name: '자동 채우기' }).click()
  await expect(page.locator('.grid-cell img')).toHaveCount(2)
  await page.waitForTimeout(500) // 레이아웃 저장 디바운스 플러시

  // 백업 다운로드 캡처
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '백업' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^gridsmith-backup-.*\.zip$/)
  const backupPath = await download.path()
  expect(backupPath).toBeTruthy()

  // 가져오기(병합): 임시 file input 은 filechooser 이벤트로 처리
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '가져오기' }).click(),
  ])
  await chooser.setFiles(backupPath!)

  // 병합 → '백업원본' 유형이 2개(원본 + 가져온 사본)
  await expect(page.locator('.type-list li')).toHaveCount(2)

  // 가져온(두번째) 유형 선택 → 이미지 2장 + 배치 2칸 복원 확인
  await page.locator('.type-list li').nth(1).click()
  await expect(page.locator('.tray-list .thumb')).toHaveCount(2)
  await expect(page.locator('.grid-cell img')).toHaveCount(2)
})

test('현재 유형 이미지 ZIP 다운로드', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')

  await page.getByPlaceholder('새 유형 이름').fill('짚유형')
  await page.getByRole('button', { name: '추가' }).click()
  await page.locator('.uploader input[type=file]').setInputFiles([
    { name: 'red.png', mimeType: 'image/png', buffer: makeSolidPNG(120, 120, RED) },
    { name: 'green.png', mimeType: 'image/png', buffer: makeSolidPNG(120, 120, GREEN) },
  ])
  await expect(page.locator('.tray-list .thumb')).toHaveCount(2)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.tray-zip').click(),
  ])
  expect(download.suggestedFilename()).toMatch(/-images\.zip$/)

  // 다운로드한 ZIP 의 EOCD(끝 22바이트, 주석 없음)에서 항목 수 필드로 이미지 2개 확인
  const fs = await import('node:fs')
  const buf = fs.readFileSync((await download.path())!)
  const eocd = buf.length - 22
  expect(buf.readUInt32LE(eocd)).toBe(0x06054b50) // EOCD 시그니처
  expect(buf.readUInt16LE(eocd + 10)).toBe(2) // total entries

})
