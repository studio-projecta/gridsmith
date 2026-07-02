import { test, expect } from '@playwright/test'

test('미리보기 줌: 버튼으로 확대/축소·맞춤이 동작한다', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder('새 유형 이름').fill('줌')
  await page.getByRole('button', { name: '추가' }).click()

  const value = page.locator('.zoom-value')
  const container = page.locator('.grid-container')
  await expect(value).toHaveText('100%')

  const w0 = (await container.boundingBox())!.width

  // 확대 2회 → 150%, 컨테이너 폭 증가
  await page.getByRole('button', { name: '확대' }).click()
  await page.getByRole('button', { name: '확대' }).click()
  await expect(value).toHaveText('150%')
  const w1 = (await container.boundingBox())!.width
  expect(w1).toBeGreaterThan(w0 + 10)

  // 맞춤 → 100% 복귀, 폭 원복
  await page.getByRole('button', { name: '맞춤' }).click()
  await expect(value).toHaveText('100%')
  const w2 = (await container.boundingBox())!.width
  expect(Math.abs(w2 - w0)).toBeLessThan(2)

  // 최소(25%)에서 축소 버튼 비활성
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '축소' }).click()
  await expect(value).toHaveText('25%')
  await expect(page.getByRole('button', { name: '축소' })).toBeDisabled()
})
