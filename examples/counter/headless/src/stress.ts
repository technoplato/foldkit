#!/usr/bin/env node
import {
  type CounterHandle,
  Increment,
  type SyncedCounterModel,
  startCounterOn,
} from 'counter-core-example'
import { Array, Effect, Exit, Option, Scope } from 'effect'
import { Processor } from 'foldkit'

import {
  FoldkitCounterV01,
  Instant,
  type SnapshotLogTransport,
  fromTransport,
  makeMemorySnapshotLogTransport,
} from '@foldkit/instant'

import { formatHeadlessHumanClock, parseHeadlessTimeFormat } from './print.js'

export const defaultBurst = 200
export const settleTimeoutMs = 15_000

/** One Memory Instant burst measurement. */
export type StressResult = Readonly<{
  elapsedMs: number
  messageEvents: number
  n: number
  readerCount: number
  writerCount: number
}>

export const envInteger = (key: string, fallback: number): number => {
  const raw = process.env[key]
  if (raw === undefined || raw === '') {
    return fallback
  }
  const parsed = Number.parseInt(raw, 10)
  if (Number.isNaN(parsed) || parsed < 1) {
    return fallback
  }
  return parsed
}

/**
 * Starts one Counter Processor on a snapshot-log transport. Every Processor
 * started on the same transport shares one tape.
 *
 * @example
 * ```typescript
 * startCounterOnTransport(transport, Processor.Host.Cli(), 'writer')
 * ```
 */
export const startCounterOnTransport = (
  transport: SnapshotLogTransport,
  host: Processor.Host.Host,
  instance: string,
): CounterHandle =>
  startCounterOn(
    Instant({ app: FoldkitCounterV01, processor: host, instance, transport }),
  )

/** The Ready count, or None while the Counter is Starting or Failed. */
export const readyCountOf = (
  model: SyncedCounterModel,
): Option.Option<number> =>
  model._tag === 'Ready' ? Option.some(model.count) : Option.none()

const countOrMissing = (handle: CounterHandle): number =>
  Option.getOrElse(readyCountOf(handle.readModel()), () => -1)

const waitFor = (
  handle: CounterHandle,
  isDone: (model: SyncedCounterModel) => boolean,
  what: string,
  timeoutMs: number,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const check = (): void => {
      if (isDone(handle.readModel())) {
        clearTimeout(timeout)
        stop()
        resolve()
      }
    }
    const timeout = setTimeout(() => {
      stop()
      reject(new Error(`Timed out waiting for ${what}.`))
    }, timeoutMs)
    const stop = handle.subscribe(check)
    check()
  })

/** Resolves once the Counter leaves Starting for Ready. */
export const waitForReady = (
  handle: CounterHandle,
  timeoutMs: number = settleTimeoutMs,
): Promise<void> =>
  waitFor(handle, model => model._tag === 'Ready', 'Ready', timeoutMs)

export type WaitForCountMode = 'exact' | 'atLeast'

/** Resolves once the Ready count reaches `count`. */
export const waitForCount = (
  handle: CounterHandle,
  count: number,
  options?: Readonly<{ mode?: WaitForCountMode; timeoutMs?: number }>,
): Promise<void> => {
  const isAtLeast = options?.mode === 'atLeast'
  return waitFor(
    handle,
    model =>
      Option.exists(readyCountOf(model), value =>
        isAtLeast ? value >= count : value === count,
      ),
    `count ${count.toString()}`,
    options?.timeoutMs ?? settleTimeoutMs,
  )
}

/** One Host reader after a shared-tape burst. */
export type CrossSurfaceReader = Readonly<{
  count: number
  elapsedMs: number
  host: string
}>

/** Every Processor Host on one Memory tape after N Increments. */
export type CrossSurfaceResult = Readonly<{
  elapsedMs: number
  n: number
  readers: ReadonlyArray<CrossSurfaceReader>
  writerCount: number
}>

/** One reader Processor per Host, all on one transport. */
export const startHostReaders = (
  transport: SnapshotLogTransport,
  instance: string,
): ReadonlyArray<Readonly<{ handle: CounterHandle; host: string }>> =>
  Array.map(Processor.Host.Host.members, member => {
    const host = member.make({})
    return {
      handle: startCounterOnTransport(transport, host, instance),
      host: Processor.Host.print(host),
    }
  })

const burst = (writer: CounterHandle, n: number): void => {
  Array.forEach(Array.range(1, n), () => {
    writer.send(Increment())
  })
}

/**
 * Bursts N Increments through one Memory tape. Every Host tag must reach
 * N. This is the cross-surface Processor proof, including Expo iOS and Expo
 * Android.
 */
export const runMemoryCrossSurfaceBurst = async (
  n: number,
): Promise<CrossSurfaceResult> => {
  const transport = await Effect.runPromise(makeMemorySnapshotLogTransport())
  const writer = startCounterOnTransport(
    transport,
    Processor.Host.Cli(),
    'cross-writer',
  )
  const readers = startHostReaders(transport, 'cross-reader')
  await waitForReady(writer)
  await Promise.all(Array.map(readers, reader => waitForReady(reader.handle)))

  const started = performance.now()
  burst(writer, n)
  const settled = await Promise.all(
    Array.map(readers, async reader => {
      const readerStarted = performance.now()
      await waitForCount(reader.handle, n)
      return {
        count: countOrMissing(reader.handle),
        elapsedMs: performance.now() - readerStarted,
        host: reader.host,
      }
    }),
  )
  const elapsedMs = performance.now() - started
  const writerCount = countOrMissing(writer)
  await writer.stop()
  await Promise.all(Array.map(readers, reader => reader.handle.stop()))

  return { elapsedMs, n, readers: settled, writerCount }
}

/**
 * Bursts N Increments through one Memory snapshot-log tape. A second
 * Processor must reach N, and the tape must carry exactly one Message event
 * per Increment.
 */
export const runMemoryBurst = async (n: number): Promise<StressResult> => {
  const transport = await Effect.runPromise(makeMemorySnapshotLogTransport())
  const messageEvents: Array<string> = []
  const writer = startCounterOnTransport(
    transport,
    Processor.Host.Cli(),
    'writer',
  )
  const reader = startCounterOnTransport(
    transport,
    Processor.Host.Headless(),
    'stress',
  )
  const probe = fromTransport(transport, 'probe')
  const probeScope = Effect.runSync(Scope.make())
  await Effect.runPromise(
    probe
      .subscribe(event => {
        if (event._tag === 'Message') {
          messageEvents.push('m')
        }
      })
      .pipe(Effect.provideService(Scope.Scope, probeScope)),
  )

  await waitForReady(writer)
  await waitForReady(reader)

  const started = performance.now()
  burst(writer, n)
  await waitForCount(reader, n)
  const elapsedMs = performance.now() - started

  const writerCount = countOrMissing(writer)
  const readerCount = countOrMissing(reader)
  await writer.stop()
  await reader.stop()
  await Effect.runPromise(Scope.close(probeScope, Exit.void))

  return {
    elapsedMs,
    messageEvents: messageEvents.length,
    n,
    readerCount,
    writerCount,
  }
}

const printResult = (result: StressResult, timeZone?: string): void => {
  const format = parseHeadlessTimeFormat(process.env['COUNTER_HEADLESS_TIME'])
  const now = Date.now()
  const clock =
    format === 'ms' ? now.toString() : formatHeadlessHumanClock(now, timeZone)
  console.log(`stress  tape  memory`)
  console.log(`stress  n  ${result.n.toString()}`)
  console.log(`stress  clock  ${clock}`)
  console.log(`stress  writer  ${result.writerCount.toString()}`)
  console.log(`stress  reader  ${result.readerCount.toString()}`)
  console.log(`stress  message-events  ${result.messageEvents.toString()}`)
  console.log(`stress  elapsed-ms  ${result.elapsedMs.toFixed(1)}`)
  if (
    result.writerCount === result.n &&
    result.readerCount === result.n &&
    result.messageEvents === result.n
  ) {
    console.log('stress  pass')
    return
  }
  console.log('stress  fail')
  process.exitCode = 1
}

export const runStressCli = async (): Promise<void> => {
  if (process.env['COUNTER_TAPE'] === 'instant') {
    console.error(
      'counter-headless:stress uses Memory. Do not set COUNTER_TAPE=instant.',
    )
    process.exit(1)
  }
  const n = envInteger('COUNTER_HEADLESS_STRESS_N', defaultBurst)
  const result = await runMemoryBurst(n)
  printResult(result, process.env['COUNTER_HEADLESS_TZ'])
}

const isMain = (): boolean => {
  const maybeEntry = Array.get(process.argv, 1)
  if (Option.isNone(maybeEntry)) {
    return false
  }
  return (
    maybeEntry.value.endsWith('stress.ts') ||
    maybeEntry.value.endsWith('stress.js')
  )
}

if (isMain()) {
  await runStressCli()
}
