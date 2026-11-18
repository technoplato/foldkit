import { expect, test } from '@playwright/test'

import * as Page from '../page'

// The Counter's Foldkit page, with its tape kept in memory (see
// `playwright.config.ts`), so a run starts at 0 and writes nowhere shared.
test.describe('counter example', () => {
  test('loads cleanly', async ({ page }) => {
    await Page.assertLoadedCleanly(page)
  })

  test('increments when + is clicked', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('0', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '+', exact: true }).click()
    await expect(page.getByText('1', { exact: true })).toBeVisible()
  })
})
