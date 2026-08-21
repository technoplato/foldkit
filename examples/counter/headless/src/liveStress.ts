#!/usr/bin/env node
import {
  FoldkitCounterV01,
  Increment,
  startLiveCounter,
  waitForSyncedHandle,
} from 'counter-core-example'
import { Array, Effect, Option } from 'effect'
import { Processor } from 'foldkit'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { makeAdminSnapshotLogTransport } from '@foldkit/instant'

import { formatHeadlessHumanClock, parseHeadlessTimeFormat } from './print.js'
import {
  type CrossSurfaceReader,
  type CrossSurfaceResult,
  defaultBurst,
  envInteger,
  readyCountOf,
  startHostReaders,
  waitForCount,
} from './stress.js'

const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)
const liveSettleTimeoutMs = 45_000

/** One painted Host after the live Instant burst. */
export type SurfaceProbe = Readonly<{
  count: number
  elapsedMs: number
  name: string
  status: 'absent' | 'fail' | 'pass'
}>

const adminToken = (): string => {
  const token = process.env['INSTANT_APP_ADMIN_TOKEN']
  if (token === undefined || token === '') {
    throw new Error(
      'counter-headless:live-stress needs INSTANT_APP_ADMIN_TOKEN from the trusted wrapper.',
    )
  }
  return token
}

/** Reads `count N` from an Android uiautomator dump. */
export const countFromAndroidUiDump = (xml: string): Option.Option<number> => {
  if (
    xml.includes('exhaustive') ||
    xml.includes('[runtime not ready]') ||
    xml.includes('Failed to get the SHA-1') ||
    xml.toLowerCase().includes("isn't responding")
  ) {
    throw new Error('Expo Android showed a redbox or ANR.')
  }
  const match = /content-desc="count (-?\d+)"/.exec(xml)
  if (match === null) {
    return Option.none()
  }
  const raw = Array.get(match, 1)
  if (Option.isNone(raw)) {
    return Option.none()
  }
  return Option.some(Number.parseInt(raw.value, 10))
}

/** Reads `count N` from an iOS accessibility dump. */
export const countFromIosDescribe = (dump: string): Option.Option<number> => {
  if (dump.includes('exhaustive') || dump.includes('[runtime not ready]')) {
    throw new Error('Expo iOS showed a redbox.')
  }
  const match = /count (-?\d+)/.exec(dump)
  if (match === null) {
    return Option.none()
  }
  const raw = Array.get(match, 1)
  if (Option.isNone(raw)) {
    return Option.none()
  }
  return Option.some(Number.parseInt(raw.value, 10))
}

const pollUntil = async (
  read: () => Promise<Option.Option<number>>,
  target: number,
  timeoutMs: number,
): Promise<number> => {
  const started = performance.now()
  let last = Option.none<number>()
  while (performance.now() - started < timeoutMs) {
    last = await read()
    if (Option.isSome(last) && last.value >= target) {
      return last.value
    }
    await Effect.runPromise(Effect.sleep('250 millis'))
  }
  const seen = Option.getOrElse(last, () => Number.NaN)
  throw new Error(
    `Surface stayed at ${seen.toString()} waiting for ${target.toString()}.`,
  )
}

const probeAndroid = async (target: number): Promise<SurfaceProbe> => {
  const name = 'expo-android'
  const started = performance.now()
  try {
    await execFileAsync('adb', ['get-state'], { timeout: 3_000 })
  } catch {
    return { count: -1, elapsedMs: 0, name, status: 'absent' }
  }
  const dumpAndroidUi = async (): Promise<string> => {
    let lastError: unknown
    for (const _ of Array.range(1, 3)) {
      try {
        await execFileAsync(
          'adb',
          ['shell', 'uiautomator', 'dump', '/sdcard/uidump.xml'],
          { timeout: 8_000 },
        )
        const dumped = await execFileAsync(
          'adb',
          ['exec-out', 'cat', '/sdcard/uidump.xml'],
          { timeout: 8_000 },
        )
        return dumped.stdout
      } catch (error) {
        lastError = error
        await Effect.runPromise(Effect.sleep('400 millis'))
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('adb uiautomator dump failed.')
  }
  try {
    const first = await dumpAndroidUi()
    if (Option.isNone(countFromAndroidUiDump(first))) {
      return { count: -1, elapsedMs: 0, name, status: 'absent' }
    }
    const count = await pollUntil(
      async () => {
        return countFromAndroidUiDump(await dumpAndroidUi())
      },
      target,
      liveSettleTimeoutMs,
    )
    return {
      count,
      elapsedMs: performance.now() - started,
      name,
      status: 'pass',
    }
  } catch (error) {
    console.error(`live-stress  ${name}  ${String(error)}`)
    return {
      count: -1,
      elapsedMs: performance.now() - started,
      name,
      status: 'fail',
    }
  }
}

const readIosDump = async (): Promise<string> => {
  try {
    const { stdout } = await execFileAsync('idb', ['ui', 'describe-all'], {
      timeout: 8_000,
    })
    if (stdout.trim() !== '') {
      return stdout
    }
  } catch {}
  const script = `
tell application "System Events"
  if not (exists process "Simulator") then
    return ""
  end if
  tell process "Simulator"
    try
      return (entire contents) as string
    on error
      return name of every UI element of window 1 as string
    end try
  end tell
end tell
`
  try {
    const { stdout } = await execFileAsync('osascript', ['-e', script], {
      timeout: 8_000,
    })
    return stdout
  } catch {
    return ''
  }
}

const probeIos = async (target: number): Promise<SurfaceProbe> => {
  const name = 'expo-ios'
  const started = performance.now()
  try {
    await execFileAsync('xcrun', ['simctl', 'list', 'devices', 'booted'], {
      timeout: 3_000,
    })
  } catch {
    return { count: -1, elapsedMs: 0, name, status: 'absent' }
  }
  try {
    const firstDump = await readIosDump()
    if (firstDump.trim() === '') {
      return { count: -1, elapsedMs: 0, name, status: 'absent' }
    }
    if (Option.isNone(countFromIosDescribe(firstDump))) {
      return { count: -1, elapsedMs: 0, name, status: 'absent' }
    }
    const count = await pollUntil(
      async () => {
        const dump = await readIosDump()
        if (dump.trim() === '') {
          return Option.none()
        }
        return countFromIosDescribe(dump)
      },
      target,
      liveSettleTimeoutMs,
    )
    return {
      count,
      elapsedMs: performance.now() - started,
      name,
      status: 'pass',
    }
  } catch (error) {
    console.error(`live-stress  ${name}  ${String(error)}`)
    return {
      count: -1,
      elapsedMs: performance.now() - started,
      name,
      status: 'fail',
    }
  }
}

type PlaywrightPage = {
  close: () => Promise<void>
  goto: (
    url: string,
    options: Readonly<{ waitUntil: 'domcontentloaded' }>,
  ) => Promise<unknown>
  locator: (selector: string) => {
    innerText: () => Promise<string>
  }
  title: () => Promise<string>
}

const playwrightModulePath = (): string | undefined => {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (const _ of Array.range(1, 8)) {
    const candidate = join(dir, 'packages/examples-e2e/node_modules/playwright')
    if (existsSync(candidate)) {
      return candidate
    }
    dir = dirname(dir)
  }
  return undefined
}

const loadPlaywright = ():
  | Readonly<{
      chromium: {
        launch: () => Promise<{
          close: () => Promise<void>
          newPage: () => Promise<PlaywrightPage>
        }>
      }
    }>
  | undefined => {
  const modulePath = playwrightModulePath()
  if (modulePath !== undefined) {
    try {
      return require(modulePath)
    } catch {
      return undefined
    }
  }
  try {
    return require('playwright')
  } catch {
    return undefined
  }
}

const probeBrowser = async (
  name: string,
  url: string,
  readCount: (page: PlaywrightPage) => Promise<Option.Option<number>>,
  target: number,
): Promise<SurfaceProbe> => {
  const playwright = loadPlaywright()
  if (playwright === undefined) {
    return { count: -1, elapsedMs: 0, name, status: 'absent' }
  }
  const started = performance.now()
  try {
    const response = await fetch(url, { method: 'HEAD' })
    if (!response.ok && response.status !== 405) {
      return { count: -1, elapsedMs: 0, name, status: 'absent' }
    }
  } catch {
    return { count: -1, elapsedMs: 0, name, status: 'absent' }
  }
  const browser = await playwright.chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    const count = await pollUntil(
      () => readCount(page),
      target,
      liveSettleTimeoutMs,
    )
    await page.close()
    return {
      count,
      elapsedMs: performance.now() - started,
      name,
      status: 'pass',
    }
  } catch (error) {
    console.error(`live-stress  ${name}  ${String(error)}`)
    return {
      count: -1,
      elapsedMs: performance.now() - started,
      name,
      status: 'fail',
    }
  } finally {
    await browser.close()
  }
}

const countFromCss = async (
  page: PlaywrightPage,
  selector: string,
): Promise<Option.Option<number>> => {
  try {
    const text = (await page.locator(selector).innerText()).trim()
    const parsed = Number.parseInt(text, 10)
    if (Number.isNaN(parsed)) {
      return Option.none()
    }
    return Option.some(parsed)
  } catch {
    return Option.none()
  }
}

const countFromTitle = async (
  page: PlaywrightPage,
): Promise<Option.Option<number>> => {
  const title = await page.title()
  const match = /: (-?\d+)$/.exec(title)
  if (match === null) {
    return Option.none()
  }
  const raw = Array.get(match, 1)
  if (Option.isNone(raw)) {
    return Option.none()
  }
  return Option.some(Number.parseInt(raw.value, 10))
}

/**
 * Bursts N Increments on the live Instant tape. Every Host tag must
 * catch the same Ready count. Phone and browser paints are probed
 * when those surfaces are already up.
 */
export const runLiveCrossSurfaceBurst = async (
  n: number,
): Promise<
  Readonly<{
    processors: CrossSurfaceResult
    surfaces: ReadonlyArray<SurfaceProbe>
    target: number
  }>
> => {
  const transport = makeAdminSnapshotLogTransport(
    FoldkitCounterV01.id,
    adminToken(),
  )
  const writer = startLiveCounter(Processor.Host.Cli(), {
    instance: 'live-stress-writer',
    transport,
  })
  const readers = startHostReaders(transport, 'live-stress-reader')
  await waitForSyncedHandle(writer)
  await Promise.all(
    Array.map(readers, reader => waitForSyncedHandle(reader.handle)),
  )

  const baseline = Option.getOrElse(readyCountOf(writer.readModel()), () => {
    throw new Error('Live Instant writer stayed off Ready.')
  })
  const target = baseline + n
  const started = performance.now()
  Array.forEach(Array.range(1, n), () => {
    writer.send(Increment())
  })

  const settled: ReadonlyArray<CrossSurfaceReader> = await Promise.all(
    Array.map(readers, async reader => {
      const readerStarted = performance.now()
      await waitForCount(
        reader.handle.readModel,
        reader.handle.subscribe,
        target,
        { mode: 'atLeast', timeoutMs: liveSettleTimeoutMs },
      )
      return {
        count: Option.getOrElse(
          readyCountOf(reader.handle.readModel()),
          () => -1,
        ),
        elapsedMs: performance.now() - readerStarted,
        host: reader.host,
      }
    }),
  )
  const writerCount = Option.getOrElse(
    readyCountOf(writer.readModel()),
    () => -1,
  )
  const elapsedMs = performance.now() - started
  writer.stop()
  await Promise.all(Array.map(readers, reader => reader.handle.stop()))

  const surfaces = await Promise.all([
    probeBrowser(
      'react',
      'http://localhost:5216/',
      page => countFromCss(page, 'div.text-7xl'),
      target,
    ),
    probeBrowser(
      'svelte',
      'http://localhost:5218/',
      page => countFromCss(page, 'div.count'),
      target,
    ),
    probeBrowser('foldkit', 'http://localhost:5215/', countFromTitle, target),
    probeAndroid(target),
    probeIos(target),
  ])

  return {
    processors: {
      elapsedMs,
      n,
      readers: settled,
      writerCount,
    },
    surfaces,
    target,
  }
}

const printLiveResult = (
  result: Awaited<ReturnType<typeof runLiveCrossSurfaceBurst>>,
): void => {
  const format = parseHeadlessTimeFormat(process.env['COUNTER_HEADLESS_TIME'])
  const now = Date.now()
  const clock =
    format === 'ms'
      ? now.toString()
      : formatHeadlessHumanClock(now, process.env['COUNTER_HEADLESS_TZ'])
  console.log(`live-stress  tape  instant`)
  console.log(`live-stress  n  ${result.processors.n.toString()}`)
  console.log(`live-stress  target  ${result.target.toString()}`)
  console.log(`live-stress  clock  ${clock}`)
  console.log(
    `live-stress  writer  ${result.processors.writerCount.toString()}`,
  )
  console.log(
    `live-stress  processor-ms  ${result.processors.elapsedMs.toFixed(1)}`,
  )
  for (const reader of result.processors.readers) {
    const ok = reader.count >= result.target ? 'pass' : 'fail'
    console.log(
      `live-stress  processor  ${reader.host}  ${reader.count.toString()}  ${reader.elapsedMs.toFixed(1)}  ${ok}`,
    )
  }
  for (const surface of result.surfaces) {
    console.log(
      `live-stress  surface  ${surface.name}  ${surface.count.toString()}  ${surface.elapsedMs.toFixed(1)}  ${surface.status}`,
    )
  }
  const failedProcessors = Array.filter(
    result.processors.readers,
    reader => reader.count < result.target,
  )
  const failedSurfaces = Array.filter(
    result.surfaces,
    surface => surface.status === 'fail',
  )
  const processorsPass =
    result.processors.writerCount >= result.target &&
    Array.isArrayEmpty(failedProcessors)
  const surfacesPass = Array.isArrayEmpty(failedSurfaces)
  if (processorsPass && surfacesPass) {
    console.log('live-stress  pass')
    return
  }
  console.log('live-stress  fail')
  process.exitCode = 1
}

export const runLiveStressCli = async (): Promise<void> => {
  if (process.env['COUNTER_LIVE_STRESS'] !== '1') {
    console.error(
      'counter-headless:live-stress writes the shared Instant tape. Set COUNTER_LIVE_STRESS=1.',
    )
    process.exit(1)
  }
  if (process.env['COUNTER_TAPE'] === 'memory') {
    console.error(
      'counter-headless:live-stress uses Instant. Do not set COUNTER_TAPE=memory.',
    )
    process.exit(1)
  }
  const n = envInteger('COUNTER_HEADLESS_STRESS_N', defaultBurst)
  const result = await runLiveCrossSurfaceBurst(n)
  printLiveResult(result)
}

const isMain = (): boolean => {
  const maybeEntry = Array.get(process.argv, 1)
  if (Option.isNone(maybeEntry)) {
    return false
  }
  return (
    maybeEntry.value.endsWith('liveStress.ts') ||
    maybeEntry.value.endsWith('liveStress.js')
  )
}

if (isMain()) {
  await runLiveStressCli()
}
