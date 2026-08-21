/**
 * Offline stress harness for the Counter Instant tape (Q34).
 *
 * Window A and Window B are two Chrome contexts on the React
 * Counter at http://localhost:5216/. The CLI is a third
 * Processor on the same Instant app.
 *
 * Case 1 (Q34 exact): A climbs to 10, A goes offline, B gets
 * throttled bandwidth, CLI reset then increment, A returns.
 * Locked answer: both show 1.
 *
 * Case 2 (offline taps): A goes offline and taps + twice while
 * CLI resets and increments, then A returns. Records what each
 * screen shows; convergence order is createdAtMs then id.
 *
 * Evidence (screenshots, CLI transcripts, summary.json) lands
 * in EVIDENCE_DIR.
 */
import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { chromium } from 'playwright'

const exec = promisify(execFile)

const APP_URL = process.env.APP_URL ?? 'http://localhost:5216/'
const CLI_CWD = new URL('../../examples/counter/cli/', import.meta.url).pathname
const EVIDENCE_DIR =
  process.env.EVIDENCE_DIR ??
  '/Users/laptop/Sync/skills/dir/census/offline-stress-evidence'

const HEADED = process.env.HEADED !== '0'

const log = line => {
  console.log(`[stress] ${line}`)
}

const events = []
const record = (stage, detail) => {
  const at = new Date().toISOString()
  events.push({ at, stage, detail })
  log(`${stage}: ${JSON.stringify(detail)}`)
}

const cli = async (...tokens) => {
  // Concurrent agent builds briefly wipe workspace dist folders.
  // Retry while a dependency dist is mid-rebuild.
  for (let attempt = 0; ; attempt += 1) {
    try {
      const { stdout } = await exec(
        '../scripts/with-counter-v01-env',
        ['env', 'COUNTER_TAPE=instant', './scripts/run.sh', ...tokens],
        { cwd: CLI_CWD, timeout: 60_000 },
      )
      return stdout
    } catch (error) {
      const stderr = String(error.stderr ?? '')
      const isMidRebuild = stderr.includes('ERR_MODULE_NOT_FOUND')
      if (!isMidRebuild || attempt >= 5) {
        throw error
      }
      log(`cli retry ${attempt + 1}: dependency dist mid-rebuild`)
      await new Promise(resolve => setTimeout(resolve, 15_000))
    }
  }
}

const cliCount = stdout => {
  const match = stdout.match(/^\s*count\s+(-?\d+)/m)
  if (match === null) {
    throw new Error(`No count in CLI output:\n${stdout}`)
  }
  return Number(match[1])
}

const readCount = async page => {
  const text = await page.locator('.text-7xl').textContent({ timeout: 15_000 })
  return Number(text.trim())
}

const waitForCount = async (page, expected, timeoutMs) => {
  const deadline = Date.now() + timeoutMs
  let last = NaN
  while (Date.now() < deadline) {
    last = await readCount(page)
    if (last === expected) {
      return { reached: true, value: last }
    }
    await page.waitForTimeout(250)
  }
  return { reached: false, value: last }
}

const clickPlus = page =>
  page.getByRole('button', { name: '+', exact: true }).click()

const shoot = async (page, name) => {
  await page.screenshot({ path: join(EVIDENCE_DIR, name) })
}

const saveText = (name, text) => writeFile(join(EVIDENCE_DIR, name), text)

await mkdir(EVIDENCE_DIR, { recursive: true })

const browser = await chromium.launch({ headless: !HEADED })

const contextA = await browser.newContext({
  viewport: { width: 560, height: 640 },
})
const contextB = await browser.newContext({
  viewport: { width: 560, height: 640 },
})
const pageA = await contextA.newPage()
const pageB = await contextB.newPage()

await pageA.goto(APP_URL)
await pageB.goto(APP_URL)

const baselineA = await readCount(pageA)
const baselineB = await readCount(pageB)
record('baseline', { windowA: baselineA, windowB: baselineB })

// CASE 1 — Q34 exact: A at 10, offline; CLI reset then plus.

log('case 1: climbing Window A to 10 by clicking +')
for (let tap = baselineA; tap < 10; tap += 1) {
  await clickPlus(pageA)
  await pageA.waitForTimeout(120)
}
const climbA = await waitForCount(pageA, 10, 15_000)
const climbB = await waitForCount(pageB, 10, 20_000)
record('case1.climbed', { windowA: climbA, windowB: climbB })
await shoot(pageA, 'case1-01-A-at-10.png')
await shoot(pageB, 'case1-02-B-at-10.png')

log('case 1: Window A offline, Window B throttled to slow 3G')
await contextA.setOffline(true)
const cdpB = await contextB.newCDPSession(pageB)
await cdpB.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 1_500,
  downloadThroughput: (50 * 1024) / 8,
  uploadThroughput: (20 * 1024) / 8,
})
record('case1.network', { windowA: 'offline', windowB: 'slow-3g' })

const resetOut = await cli('do', 'reset')
await saveText('case1-03-cli-do-reset.txt', resetOut)
const plusOut = await cli('do', 'increment')
await saveText('case1-04-cli-do-increment.txt', plusOut)
record('case1.cli', {
  afterReset: cliCount(resetOut),
  afterPlus: cliCount(plusOut),
})

const throttledB = await waitForCount(pageB, 1, 30_000)
const offlineA = await readCount(pageA)
record('case1.split', {
  windowB: throttledB,
  windowAOffline: offlineA,
})
await shoot(pageA, 'case1-05-A-offline.png')
await shoot(pageB, 'case1-06-B-throttled.png')

log('case 1: Window A back online')
await contextA.setOffline(false)
const reconnectChecks = []
for (const waitMs of [2_000, 5_000, 15_000]) {
  await pageA.waitForTimeout(waitMs)
  reconnectChecks.push({
    afterMs: waitMs,
    windowA: await readCount(pageA),
    windowB: await readCount(pageB),
  })
}
record('case1.reconnect', reconnectChecks)
await shoot(pageA, 'case1-07-A-reconnected.png')
await shoot(pageB, 'case1-08-B-final.png')
const showAfterCase1 = await cli('show')
await saveText('case1-09-cli-show-final.txt', showAfterCase1)
record('case1.final', {
  windowA: await readCount(pageA),
  windowB: await readCount(pageB),
  cli: cliCount(showAfterCase1),
  locked: 'Q34 says both show 1',
})

// CASE 2 — offline taps on A while CLI resets and increments.

log('case 2: re-baselining to 5 via CLI')
const case2ResetOut = await cli('do', 'reset').catch(() => null)
if (case2ResetOut !== null) {
  await saveText('case2-01-cli-do-reset.txt', case2ResetOut)
}
for (let tap = 0; tap < 5; tap += 1) {
  await cli('do', 'increment')
}
const case2BaseA = await waitForCount(pageA, 5, 20_000)
const case2BaseB = await waitForCount(pageB, 5, 20_000)
record('case2.baseline', { windowA: case2BaseA, windowB: case2BaseB })

log('case 2: Window A offline, taps + twice while CLI resets')
await contextA.setOffline(true)
await clickPlus(pageA)
await pageA.waitForTimeout(300)
await clickPlus(pageA)
const offlineTapsA = await readCount(pageA)
const case2CliReset = await cli('do', 'reset')
await saveText('case2-02-cli-do-reset.txt', case2CliReset)
const case2CliPlus = await cli('do', 'increment')
await saveText('case2-03-cli-do-increment.txt', case2CliPlus)
record('case2.concurrent', {
  windowAOfflineAfterTwoTaps: offlineTapsA,
  cliAfterReset: cliCount(case2CliReset),
  cliAfterPlus: cliCount(case2CliPlus),
})
await shoot(pageA, 'case2-04-A-offline-taps.png')
await shoot(pageB, 'case2-05-B-after-cli.png')

log('case 2: Window A back online')
await contextA.setOffline(false)
await pageA.waitForTimeout(15_000)
const case2FinalA = await readCount(pageA)
const case2FinalB = await readCount(pageB)
const case2Show = await cli('show')
await saveText('case2-06-cli-show-final.txt', case2Show)
record('case2.final', {
  windowA: case2FinalA,
  windowB: case2FinalB,
  cli: cliCount(case2Show),
})
await shoot(pageA, 'case2-07-A-final.png')
await shoot(pageB, 'case2-08-B-final.png')

// CASE 3 — lift Window B's throttle and wait for convergence.

log('case 3: removing Window B throttle')
await cdpB.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 0,
  downloadThroughput: -1,
  uploadThroughput: -1,
})
const convergedB = await waitForCount(pageB, case2FinalA, 60_000)
record('case3.converged', {
  windowA: await readCount(pageA),
  windowB: convergedB,
  cli: cliCount(await cli('show')),
})
await shoot(pageB, 'case3-01-B-converged.png')

await saveText(
  'summary.json',
  JSON.stringify({ appUrl: APP_URL, events }, null, 2),
)

await browser.close()
log(`done. evidence in ${EVIDENCE_DIR}`)
