import { test, expect, type Page } from '@playwright/test'
import { makeSolidPNG } from './png'

const RED: [number, number, number] = [255, 0, 0]
const BLUE: [number, number, number] = [0, 0, 255]

// IndexedDB object store 의 레코드 수를 페이지 컨텍스트에서 직접 조회.
function countStore(page: Page, store: 'images' | 'layouts' | 'types') {
  return page.evaluate(
    (name) =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open('gridsmith')
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction(name, 'readonly')
          const c = tx.objectStore(name).count()
          c.onsuccess = () => {
            resolve(c.result)
            db.close()
          }
          c.onerror = () => reject(c.error)
        }
      }),
    store,
  )
}

test('유형 삭제 시 이미지·레이아웃이 cascade 로 함께 제거된다', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')

  // 유형A + 이미지 2장
  await page.getByPlaceholder('새 유형 이름').fill('유형A')
  await page.getByRole('button', { name: '추가' }).click()
  await page.locator('input[type=file]').setInputFiles([
    { name: 'a1.png', mimeType: 'image/png', buffer: makeSolidPNG(120, 120, RED) },
    { name: 'a2.png', mimeType: 'image/png', buffer: makeSolidPNG(120, 120, BLUE) },
  ])
  await expect(page.locator('.tray-list .thumb')).toHaveCount(2)

  // 유형B (다른 유형이 남아있어야 삭제 후 전환 확인 가능)
  await page.getByPlaceholder('새 유형 이름').fill('유형B')
  await page.getByRole('button', { name: '추가' }).click()

  await page.waitForTimeout(400) // 저장 디바운스 플러시
  expect(await countStore(page, 'images')).toBe(2)
  expect(await countStore(page, 'types')).toBe(2)

  // 유형A 삭제 (해당 li 의 ✕ 버튼)
  await page
    .locator('.type-list li', { hasText: '유형A' })
    .getByRole('button', { name: '삭제' })
    .click()

  // UI: 유형A 사라지고 유형B 남음
  await expect(page.locator('.type-list li', { hasText: '유형A' })).toHaveCount(0)
  await expect(page.locator('.type-list li', { hasText: '유형B' })).toHaveCount(1)

  // DB: 유형A 의 이미지 2장이 cascade 로 제거되어 0
  await page.waitForTimeout(200)
  expect(await countStore(page, 'images')).toBe(0)
  expect(await countStore(page, 'types')).toBe(1)
})
