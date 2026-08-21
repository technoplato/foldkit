/**
 * Sync-by-default demo.
 *
 * Proves every Counter Client boots on the SAME shared live
 * Instant tape with no env vars or flags:
 *
 * 1. Bespoke React window clicks + twice.
 * 2. Screen-tree React window shows the same count.
 * 3. CLI one-shot (no env) reads the same count, taps
 *    increment, and both browser windows follow.
 * 4. TUI screen mode (no env) boots showing the same count.
 *
 * Evidence (screenshots plus transcript) lands in EVIDENCE_DIR.
 */
import { execFile, spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { chromium } from 'playwright'

const exec = promisify(execFile)

const APP_URL = process.env.APP_URL ?? 'http://localhost:5216/'
const CLI_CWD = new URL('../../examples/counter/cli/', import.meta.url).pathname
const TUI_CWD = new URL('../../examples/counter/tui/', import.meta.url).pathname
const EVIDENCE_DIR =
  process.env.EVIDENCE_DIR ??
  '/Users/laptop/Sync/skills/dir/census/terminal-screen-demos'

const transcript = []
const log = line => {
  transcript.push(line)
  console.log(`[sync-demo] ${line}`)
}

const cliScreen = async (...tokens) => {
  const { stdout } = await exec('node', ['dist/screenEntry.js', ...tokens], {
    cwd: CLI_CWD,
    timeout: 60_000,
  })
  return stdout
}

const cliCount = stdout => {
  const match = stdout.match(/^(-?\d+)$/m)
  if (match === null) {
    throw new Error(`No count in CLI output:\n${stdout}`)
  }
  return Number(match[1])
}

const tuiScreenBoot = () =>
  new Promise((resolve, reject) => {
    const child = spawn('node', ['dist/entry.js', '--window=screen'], {
      cwd: TUI_CWD,
      timeout: 30_000,
    })
    let output = ''
    child.stdout.on('data', chunk => {
      output += String(chunk)
    })
    child.on('error', reject)
    child.on('close', () => resolve(output))
    setTimeout(() => {
      child.stdin.write('q')
    }, 8_000)
  })

const readBespokeCount = async page => {
  const text = await page.locator('.text-7xl').innerText()
  return Number(text.trim())
}

const readScreenCount = async page => {
  const text = await page.locator('.fk-text').first().innerText()
  return Number(text.trim())
}

const waitFor = async (read, expected, label) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const value = await read()
    if (value === expected) {
      return value
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`${label} never reached ${expected}`)
}

await mkdir(EVIDENCE_DIR, { recursive: true })

const browser = await chromium.launch()
const bespoke = await browser.newPage({ viewport: { width: 900, height: 600 } })
const screen = await browser.newPage({ viewport: { width: 900, height: 600 } })

await bespoke.goto(APP_URL)
await screen.goto(`${APP_URL}?window=screen`)
await bespoke.locator('.text-7xl').waitFor({ timeout: 30_000 })
await screen.locator('.fk-text').first().waitFor({ timeout: 30_000 })

const startCount = await readBespokeCount(bespoke)
log(`bespoke window boots at ${startCount}`)
await waitFor(() => readScreenCount(screen), startCount, 'screen window boot')
log(`screen window boots at ${startCount} (same shared tape)`)

await bespoke.getByRole('button', { name: '+' }).click()
await bespoke.getByRole('button', { name: '+' }).click()
const afterTaps = await waitFor(
  () => readBespokeCount(bespoke),
  startCount + 2,
  'bespoke count after two + taps',
)
log(`bespoke window taps + twice, shows ${afterTaps}`)
await waitFor(() => readScreenCount(screen), afterTaps, 'screen window sync')
log(`screen window follows to ${afterTaps} without a tap`)

await bespoke.screenshot({ path: join(EVIDENCE_DIR, 'react-bespoke.png') })
await screen.screenshot({ path: join(EVIDENCE_DIR, 'react-screen.png') })
log('screenshots saved: react-bespoke.png react-screen.png')

const shown = await cliScreen()
log(`$ counter-screen        (no env vars)`)
log(shown.trimEnd())
const cliShownCount = cliCount(shown)
if (cliShownCount !== afterTaps) {
  throw new Error(`CLI read ${cliShownCount}, browser shows ${afterTaps}`)
}
log(`CLI reads the same count ${cliShownCount} with zero configuration`)

const incremented = await cliScreen('increment')
log(`$ counter-screen increment`)
log(incremented.trimEnd())
const cliNext = cliCount(incremented)
await waitFor(() => readBespokeCount(bespoke), cliNext, 'bespoke after CLI tap')
await waitFor(() => readScreenCount(screen), cliNext, 'screen after CLI tap')
log(`both React windows follow the CLI tap to ${cliNext}`)

await bespoke.screenshot({
  path: join(EVIDENCE_DIR, 'react-bespoke-after-cli.png'),
})
log('screenshot saved: react-bespoke-after-cli.png')

const tuiOutput = await tuiScreenBoot()
const tuiHasCount = tuiOutput.includes(`${cliNext}`)
log(
  `TUI --window=screen boots (no env vars), frame contains ${cliNext}: ${tuiHasCount}`,
)

await browser.close()

await writeFile(
  join(EVIDENCE_DIR, 'sync-by-default.txt'),
  `${transcript.join('\n')}\n`,
)
log('transcript saved: sync-by-default.txt')
