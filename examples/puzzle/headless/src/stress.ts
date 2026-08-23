#!/usr/bin/env node
import { Array, Effect, Exit, Option, Scope } from 'effect'
import { Processor } from 'foldkit'
import {
  GuessedYes,
  ResetTape,
  type SnapshotLogTransport,
  type SyncedPuzzleHandle,
  fromPuzzleTransport,
  makeMemorySnapshotLogTransport,
  startLivePuzzle,
  tapeLengthOfReady,
  waitForSyncedHandle,
} from 'puzzle-core-example'

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

export type WaitForCountMode = 'exact' | 'atLeast'

export const waitForCount = (
  read: () => unknown,
  subscribe: (listener: () => void) => () => void,
  count: number,
  options?: Readonly<{ mode?: WaitForCountMode; timeoutMs?: number }>,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const mode = options?.mode ?? 'exact'
    const timeoutMs = options?.timeoutMs ?? settleTimeoutMs
    const matches = (value: number): boolean =>
      mode === 'atLeast' ? value >= count : value === count
    const finish = (): void => {
      const value = tapeLengthOfReady(read())
      if (value !== undefined && matches(value)) {
        clearTimeout(timeout)
        stop()
        resolve()
      }
    }
    const timeout = setTimeout(() => {
      stop()
      reject(new Error(`Timed out waiting for count ${count.toString()}.`))
    }, timeoutMs)
    const stop = subscribe(finish)
    finish()
  })

/** Ready tape length, or none when Instant is still Starting or Failed. */
export const readyCountOf = (model: unknown): Option.Option<number> =>
  Option.fromNullishOr(tapeLengthOfReady(model))

/** One Host reader after a shared-tape burst. */
export type CrossSurfaceReader = Readonly<{
  count: number
  elapsedMs: number
  host: string
}>

/** Every Processor Host on one Memory tape after N GuessedYess. */
export type CrossSurfaceResult = Readonly<{
  elapsedMs: number
  n: number
  readers: ReadonlyArray<CrossSurfaceReader>
  writerCount: number
}>

export const startHostReaders = (
  transport: SnapshotLogTransport,
  instance: string,
): ReadonlyArray<
  Readonly<{
    handle: SyncedPuzzleHandle
    host: string
  }>
> =>
  Array.map(Processor.Host.Host.members, member => {
    const host = member.make({})
    return {
      handle: startLivePuzzle(host, { instance, transport }),
      host: Processor.Host.print(host),
    }
  })

/**
 * Bursts N GuessedYess through one Memory tape. Every Host tag must
 * reach N. This is the cross-surface Processor proof, including
 * Expo iOS and Expo Android.
 */
export const runMemoryCrossSurfaceBurst = async (
  n: number,
): Promise<CrossSurfaceResult> => {
  const transport = await Effect.runPromise(makeMemorySnapshotLogTransport())
  const writer = startLivePuzzle(Processor.Host.Cli(), {
    instance: 'cross-writer',
    transport,
  })
  const readers = startHostReaders(transport, 'cross-reader')
  await waitForSyncedHandle(writer)
  await Promise.all(
    Array.map(readers, reader => waitForSyncedHandle(reader.handle)),
  )
  writer.send(ResetTape())
  await waitForCount(writer.readModel, writer.subscribe, 0)

  const started = performance.now()
  Array.forEach(Array.range(1, n), () => {
    writer.send(GuessedYes())
  })
  await waitForCount(writer.readModel, writer.subscribe, n)
  const settled = await Promise.all(
    Array.map(readers, async reader => {
      const readerStarted = performance.now()
      await waitForCount(reader.handle.readModel, reader.handle.subscribe, n)
      const model = reader.handle.readModel()
      return {
        count: Option.getOrElse(readyCountOf(model), () => -1),
        elapsedMs: performance.now() - readerStarted,
        host: reader.host,
      }
    }),
  )
  const elapsedMs = performance.now() - started
  const writerModel = writer.readModel()
  writer.stop()
  await Promise.all(Array.map(readers, reader => reader.handle.stop()))

  return {
    elapsedMs,
    n,
    readers: settled,
    writerCount: Option.getOrElse(readyCountOf(writerModel), () => -1),
  }
}

/**
 * Bursts N GuessedYess through one Memory snapshot-log tape.
 * A second Processor must reach N. Message events must stay linear.
 */
export const runMemoryBurst = async (n: number): Promise<StressResult> => {
  const transport = await Effect.runPromise(makeMemorySnapshotLogTransport())
  const messageEvents: Array<string> = []
  const writer = startLivePuzzle(Processor.Host.Cli(), { transport })
  const reader = startLivePuzzle(Processor.Host.Headless(), {
    instance: 'stress',
    transport,
  })
  const probe = fromPuzzleTransport(transport, 'probe')
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

  await waitForSyncedHandle(writer)
  await waitForSyncedHandle(reader)
  writer.send(ResetTape())
  await waitForCount(writer.readModel, writer.subscribe, 0)
  messageEvents.splice(0)

  const started = performance.now()
  Array.forEach(Array.range(1, n), () => {
    writer.send(GuessedYes())
  })
  await waitForCount(writer.readModel, writer.subscribe, n)
  await waitForCount(reader.readModel, reader.subscribe, n)
  const elapsedMs = performance.now() - started

  const writerModel = writer.readModel()
  const readerModel = reader.readModel()
  writer.stop()
  reader.stop()
  await Effect.runPromise(Scope.close(probeScope, Exit.void))

  return {
    elapsedMs,
    messageEvents: messageEvents.length,
    n,
    readerCount: tapeLengthOfReady(readerModel) ?? -1,
    writerCount: tapeLengthOfReady(writerModel) ?? -1,
  }
}

const printResult = (result: StressResult, timeZone?: string): void => {
  const format = parseHeadlessTimeFormat(process.env['PUZZLE_HEADLESS_TIME'])
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
  if (process.env['PUZZLE_TAPE'] === 'instant') {
    console.error(
      'puzzle-headless:stress uses Memory. Do not set PUZZLE_TAPE=instant.',
    )
    process.exit(1)
  }
  const n = envInteger('PUZZLE_HEADLESS_STRESS_N', defaultBurst)
  const result = await runMemoryBurst(n)
  printResult(result, process.env['PUZZLE_HEADLESS_TZ'])
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
