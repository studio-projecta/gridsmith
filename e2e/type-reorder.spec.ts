import { test, expect } from '@playwright/test'

/** 사이드바 유형 이름을 위→아래 순서대로 읽는다. */
async function typeOrder(page: import('@playwright/test').Page) {
  return page.locator('.type-list .type-name').allTextContents()
}

test('그룹 순서 바꾸기: ▲▼ 로 재정렬 + 새로고침 후 영속', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')

  for (const name of ['A', 'B', 'C']) {
    await page.getByPlaceholder('새 유형 이름').fill(name)
    await page.getByRole('button', { name: '추가' }).click()
    await expect(page.locator('.type-list .type-name', { hasText: name })).toBeVisible()
  }
  expect(await typeOrder(page)).toEqual(['A', 'B', 'C'])

  // C 를 위로 한 번 → A, C, B
  const rowC = page.locator('.type-list li', { hasText: 'C' })
  await rowC.getByLabel('위로').click()
  await expect.poll(() => typeOrder(page)).toEqual(['A', 'C', 'B'])

  // A 를 아래로 한 번 → C, A, B
  const rowA = page.locator('.type-list li', { hasText: 'A' })
  await rowA.getByLabel('아래로').click()
  await expect.poll(() => typeOrder(page)).toEqual(['C', 'A', 'B'])

  // 맨 위 항목의 '위로', 맨 아래 항목의 '아래로' 는 비활성
  await expect(page.locator('.type-list li').first().getByLabel('위로')).toBeDisabled()
  await expect(page.locator('.type-list li').last().getByLabel('아래로')).toBeDisabled()

  // 새로고침 후에도 순서 유지
  await page.reload()
  await expect.poll(() => typeOrder(page)).toEqual(['C', 'A', 'B'])
})
