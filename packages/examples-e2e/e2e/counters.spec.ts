import { expect, test } from '@playwright/test'

import * as Page from '../page'

// Multiple Counters with no app to sync with (see `playwright.config.ts`),
// so a run starts with its own two rows and writes nowhere shared.
test.describe('counters example', () => {
  test('loads cleanly', async ({ page }) => {
    await Page.assertLoadedCleanly(page)
  })

  test('starts with two rows', async ({ page }) => {
    await page.goto('/')
    await expect(
      page.getByRole('button', { name: 'Open counter-1' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Open counter-2' }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Increment' })).toHaveCount(2)
  })

  test('Add counter creates a new row', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Add counter' }).click()
    await expect(page.getByRole('button', { name: 'Increment' })).toHaveCount(3)
  })

  test('Delete asks first, then drops that row', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Delete counter-1' }).click()
    await expect(page.getByText('Delete counter-1?')).toBeVisible()
    await page.getByRole('button', { name: 'Delete counter' }).click()
    await expect(page.getByRole('button', { name: 'Increment' })).toHaveCount(1)
    await expect(
      page.getByRole('button', { name: 'Open counter-1' }),
    ).toHaveCount(0)
  })

  test('each row counts on its own', async ({ page }) => {
    await page.goto('/')
    const increments = page.getByRole('button', { name: 'Increment' })
    await increments.first().click()
    await increments.first().click()
    await increments.nth(1).click()
    await expect(page.getByText('2', { exact: true })).toBeVisible()
    await expect(page.getByText('1', { exact: true })).toBeVisible()
  })
})
