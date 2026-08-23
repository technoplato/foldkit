import { Option } from 'effect'
import { type Page } from 'playwright'

import { BenchError } from './error.js'

const countLocator = '.counter-screen .fk-text'
const screenLocator = '.counter-screen'
const plusName = '+'
const minusName = '-'

const fail = (detail: string): never => {
  throw new BenchError({ detail })
}

/** True when the painted Counter screen is in the tree. */
export const hasCounterScreen = async (page: Page): Promise<boolean> => {
  const count = await page.locator(screenLocator).count()
  return count !== 0
}

/** Visible count from `.fk-text`. */
export const readCount = async (page: Page): Promise<number> => {
  const handle = page.locator(countLocator).first()
  const text = await handle.textContent()
  const maybeText = Option.fromNullishOr(text)
  if (Option.isNone(maybeText)) {
    return fail('count .fk-text is missing')
  }
  const trimmed = maybeText.value.trim()
  const count = Number.parseInt(trimmed, 10)
  if (Number.isNaN(count)) {
    return fail(`count text is not a number: ${trimmed}`)
  }
  return count
}

/** Waits until `.fk-text` equals `expected`. */
export const waitForCount = async (
  page: Page,
  expected: number,
  timeoutMs: number,
): Promise<void> => {
  await page.waitForFunction(
    ({ selector, value }) => {
      const node = document.querySelector(selector)
      if (node === null || node.textContent === null) {
        return false
      }
      return node.textContent.trim() === String(value)
    },
    { selector: countLocator, value: expected },
    { timeout: timeoutMs },
  )
}

/** Taps the plus button. */
export const tapPlus = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: plusName, exact: true }).click()
}

/** Taps the minus button. */
export const tapMinus = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: minusName, exact: true }).click()
}

/** Product tree: count text plus plus/minus. Mobile may omit .counter-screen. */
export const hasProductScreen = async (page: Page): Promise<boolean> => {
  const text = await page.locator('.fk-text').count()
  const buttons = await hasPlusAndMinus(page)
  return text !== 0 && buttons
}

/** True when plus and minus are enabled. */
export const hasPlusAndMinus = async (page: Page): Promise<boolean> => {
  const plus = await page
    .getByRole('button', { name: plusName, exact: true })
    .count()
  const minus = await page
    .getByRole('button', { name: minusName, exact: true })
    .count()
  return plus !== 0 && minus !== 0
}

/** Body text for Access / Starting Instant checks. */
export const bodyText = async (page: Page): Promise<string> =>
  page.locator('body').innerText()

/** True when the Action menu overlay is painted. */
export const hasActionMenu = async (page: Page): Promise<boolean> => {
  const actions = await page.getByText('Actions', { exact: true }).count()
  const close = await page
    .getByRole('button', { name: 'Close', exact: true })
    .count()
  return actions !== 0 || close !== 0
}

/** Opens the Action menu via cmd-K then ?. */
export const openActionMenu = async (page: Page): Promise<void> => {
  await page.keyboard.press('Meta+k')
  if (await hasActionMenu(page)) {
    return
  }
  await page.keyboard.press('Shift+/')
}

const instantHostMarker = 'instantdb'

const isInstantUrl = (url: string): boolean => url.includes(instantHostMarker)

/** Watches Instant HTTP and websocket snapshot traffic. */
export const watchInstant = (
  page: Page,
): Readonly<{
  receivedSnapshot: () => boolean
  sources: () => ReadonlyArray<string>
}> => {
  const sources: Array<string> = []
  let received = false
  const mark = (source: string): void => {
    received = true
    sources.push(source)
  }
  page.on('websocket', ws => {
    if (!isInstantUrl(ws.url())) {
      return
    }
    ws.on('framereceived', frame => {
      if (String(frame.payload).length === 0) {
        return
      }
      mark(`websocket:${ws.url()}`)
    })
  })
  page.on('response', response => {
    if (!isInstantUrl(response.url())) {
      return
    }
    if (response.status() < 200 || response.status() >= 300) {
      return
    }
    mark(`http:${response.url()}`)
  })
  return {
    receivedSnapshot: () => received,
    sources: () => sources,
  }
}

export type InstantWatch = ReturnType<typeof watchInstant>
