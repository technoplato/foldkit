// Screenshots every Reminders screen and sheet from the visual fixture, at
// desktop and phone widths, and checks the interactions a person relies on.
// Run `pnpm fixture` first; then `node scripts/screenshots.mjs <out-dir>`.
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'

const base = process.env.REMINDERS_FIXTURE_URL ?? 'http://localhost:5224'
const outDir = process.argv[2] ?? '/tmp/reminders-v3-screens'

const groceries = '00000000-0000-4000-8002-000000000001'
const reading = '00000000-0000-4000-8002-000000000004'
const oatMilk = '00000000-0000-4000-8003-000000000001'
const reminderAt = `/reminders/lists/${groceries}/reminder/${oatMilk}`

const pages = [
  ['01-home', '/reminders'],
  ['02-today', '/reminders/today'],
  ['03-scheduled', '/reminders/scheduled'],
  ['04-list', `/reminders/lists/${groceries}`],
  ['05-reminder', reminderAt],
  ['13-search', '/reminders/search?search.query=milk'],
  ['14-tag', '/reminders/tags/chores'],
  ['15-profile', '/reminders/profile'],
  ['16-view-only-list', `/reminders/lists/${reading}`],
  ['17-flagged', '/reminders/flagged'],
]

const sheets = [
  ['06-due-sheet', `${reminderAt}/due`],
  ['07-priority-sheet', `${reminderAt}/priority`],
  ['08-move-sheet', `${reminderAt}/move`],
  ['09-list-details-sheet', `/reminders/lists/${groceries}/details`],
  ['10-sharing-sheet', `/reminders/lists/${groceries}/sharing`],
  ['11-sort-sheet', `/reminders/lists/${groceries}/sort`],
  [
    '12-delete-list-question',
    `/reminders/lists/${groceries}/delete/${groceries}`,
  ],
]

const viewports = [
  ['desktop', { width: 1280, height: 900 }, 1],
  ['phone', { width: 390, height: 844 }, 2],
]

const settle = page => page.waitForTimeout(350)

const escaped = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const row = (page, title) =>
  page.locator('.fk-item-press').filter({
    has: page.locator('.fk-item-title', {
      hasText: new RegExp(`^${escaped(title)}$`),
    }),
  })

const open = async (page, uri) => {
  await page.goto(`${base}/fixture/?at=${encodeURIComponent(uri)}`)
  await page.waitForSelector('.fk-frame')
  await settle(page)
}

const isOverflowing = page =>
  page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  )

const checks = []

const check = (name, isTrue, detail = '') => {
  checks.push({ name, ok: isTrue, detail })
}

const browser = await chromium.launch({ channel: 'chrome' })
await mkdir(outDir, { recursive: true })

for (const [deviceName, viewport, deviceScaleFactor] of viewports) {
  const context = await browser.newContext({ viewport, deviceScaleFactor })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  const overflowing = []
  for (const [name, uri] of pages) {
    await open(page, uri)
    if (await isOverflowing(page)) {
      overflowing.push(name)
    }
    await page.screenshot({
      path: join(outDir, `${deviceName}-${name}.png`),
      fullPage: true,
    })
    await page.screenshot({
      path: join(outDir, `${deviceName}-${name}-window.png`),
    })
  }
  for (const [name, uri] of sheets) {
    await open(page, uri)
    await page.screenshot({ path: join(outDir, `${deviceName}-${name}.png`) })
  }
  check(
    `${deviceName}: no page is wider than the window`,
    overflowing.length === 0,
    overflowing.join(', '),
  )

  await open(page, `/reminders/lists/${groceries}`)
  await page
    .getByRole('button', { name: 'Show 1 completed', exact: true })
    .click()
  await settle(page)
  await page.screenshot({
    path: join(outDir, `${deviceName}-18-list-completed-shown.png`),
    fullPage: true,
  })

  await open(page, '/reminders')
  await page.keyboard.press('?')
  await settle(page)
  await page.screenshot({
    path: join(outDir, `${deviceName}-19-action-menu.png`),
  })

  await open(page, `/reminders/lists/${groceries}`)
  const field = page.getByRole('textbox', { name: 'New reminder in Groceries' })
  await field.fill('Basil')
  await field.press('Enter')
  await settle(page)
  check(
    `${deviceName}: typing a reminder and pressing Enter adds it and empties the field`,
    (await row(page, 'Basil').count()) === 1 &&
      (await field.inputValue()) === '',
  )
  await page.getByRole('checkbox', { name: 'Mark Basil done' }).click()
  await settle(page)
  check(
    `${deviceName}: ticking a reminder takes it out of the open list`,
    (await row(page, 'Basil').count()) === 0,
  )

  await open(page, '/reminders')
  check(
    `${deviceName}: a list's row is a link to its page`,
    (await row(page, 'Groceries').getAttribute('href')) ===
      `/reminders/lists/${groceries}`,
  )
  await row(page, 'Groceries').click()
  await settle(page)
  check(
    `${deviceName}: following a list's link opens it in the app`,
    page.url().endsWith(`/reminders/lists/${groceries}`) &&
      (await row(page, 'Oat milk').count()) === 1,
    page.url(),
  )

  await open(page, reminderAt)
  check(
    `${deviceName}: the Due row is a link to the due dates`,
    (await row(page, 'Due').getAttribute('href')) === `${reminderAt}/due`,
  )
  await row(page, 'Due').click()
  await settle(page)
  check(
    `${deviceName}: the Due row opens the due dates at …/due`,
    page.url().endsWith(`${reminderAt}/due`),
    page.url(),
  )
  await row(page, 'Tomorrow').click()
  await settle(page)
  check(
    `${deviceName}: choosing a due date closes the sheet`,
    page.url().endsWith(reminderAt) &&
      (await page.locator('.fk-overlay').count()) === 0,
    page.url(),
  )
  await page.screenshot({
    path: join(outDir, `${deviceName}-20-reminder-after-due.png`),
    fullPage: true,
  })

  await row(page, 'Priority').click()
  await settle(page)
  await page.keyboard.press('Escape')
  await settle(page)
  check(
    `${deviceName}: Escape dismisses a sheet`,
    (await page.locator('.fk-overlay').count()) === 0 &&
      page.url().endsWith(reminderAt),
    page.url(),
  )
  await row(page, 'List').click()
  await settle(page)
  await page.mouse.click(8, 8)
  await settle(page)
  check(
    `${deviceName}: a click outside dismisses a sheet`,
    (await page.locator('.fk-overlay').count()) === 0 &&
      page.url().endsWith(reminderAt),
    page.url(),
  )

  await page.getByRole('button', { name: 'Share', exact: true }).click()
  await settle(page)
  check(
    `${deviceName}: Share says the link was copied`,
    (await page.getByText('Link copied', { exact: true }).count()) === 1,
  )
  await page.screenshot({
    path: join(outDir, `${deviceName}-21-reminder-shared.png`),
    fullPage: true,
  })

  await open(page, '/reminders')
  await page.getByRole('button', { name: 'Profile', exact: true }).click()
  await settle(page)
  check(
    `${deviceName}: the Profile tab opens the profile, with no Back`,
    page.url().endsWith('/reminders/profile') &&
      (await page.locator('[data-action="GoBack"]').count()) === 0,
    page.url(),
  )

  await open(page, '/reminders')
  const search = page.getByRole('textbox', { name: 'Search reminders' })
  await search.fill('#chores')
  await search.press('Enter')
  await settle(page)
  check(
    `${deviceName}: searching goes to an address that names the search`,
    page.url().includes('/reminders/search?search.query=%23chores'),
    page.url(),
  )

  check(`${deviceName}: no page errors`, errors.length === 0, errors.join('; '))
  await context.close()
}

await browser.close()

for (const { name, ok, detail } of checks) {
  process.stdout.write(
    `${ok ? 'PASS' : 'FAIL'} ${name}${detail === '' ? '' : ` (${detail})`}\n`,
  )
}
process.stdout.write(`screens in ${outDir}\n`)
process.exit(checks.every(({ ok }) => ok) ? 0 : 1)
