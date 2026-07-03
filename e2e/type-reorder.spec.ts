import { test, expect, type Page } from '@playwright/test'

/** 사이드바 유형 이름을 위→아래 순서대로 읽는다. */
async function typeOrder(page: Page) {
  return page.locator('.type-list .type-name').allTextContents()
}

/** fromName 행의 그립을 잡아 toName 행 중앙(bias 만큼 위/아래)으로 드래그한다(dnd-kit). */
async function dragRow(page: Page, fromName: string, toName: string, bias = 0) {
  const grip = page.locator('.type-list li', { hasText: fromName }).locator('.type-grip')
  const target = page.locator('.type-list li', { hasText: toName })
  const g = await grip.boundingBox()
  const t = await target.boundingBox()
  if (!g || !t) throw new Error('no bbox')
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
  await page.mouse.down()
  // 활성화 임계(5px) 넘기고, 목표 행으로 여러 스텝 이동 후 위치 확정.
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2 - 8, { steps: 3 })
  const ty = t.y + t.height / 2 + bias
  await page.mouse.move(t.x + t.width / 2, ty, { steps: 14 })
  await page.mouse.move(t.x + t.width / 2, ty, { steps: 2 })
  await page.mouse.up()
  await page.waitForTimeout(250)
}

test('그룹 순서 바꾸기: 드래그앤드롭 재정렬 + 새로고침 후 영속', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')

  for (const name of ['A', 'B', 'C']) {
    await page.getByPlaceholder('새 유형 이름').fill(name)
    await page.getByRole('button', { name: '추가' }).click()
    await expect(page.locator('.type-list .type-name', { hasText: name })).toBeVisible()
  }
  expect(await typeOrder(page)).toEqual(['A', 'B', 'C'])

  // C 를 맨 위(A 자리)로 드래그 → C, A, B
  await dragRow(page, 'C', 'A', -6)
  await expect.poll(() => typeOrder(page)).toEqual(['C', 'A', 'B'])

  // A 를 맨 아래(B 자리)로 드래그 → C, B, A
  await dragRow(page, 'A', 'B', 6)
  await expect.poll(() => typeOrder(page)).toEqual(['C', 'B', 'A'])

  // 새로고침 후에도 순서 유지
  await page.reload()
  await expect.poll(() => typeOrder(page)).toEqual(['C', 'B', 'A'])
})
