import { test, expect } from '@playwright/test'

test('헤더 타이틀과 하단 버전이 표시된다', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.app-header h1')).toHaveText('Gridsmith')
  await expect(page.locator('.app-footer')).toContainText(/Gridsmith v\d+\.\d+\.\d+/)
})
