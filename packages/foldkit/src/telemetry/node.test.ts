/// <reference types="node" />
import { Array, Context, Effect, Layer, Option } from 'effect'
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  unlink,
  utimes,
  writeFile,
} from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  type TelemetryEvent,
  Transition,
  decodeLine,
  encodeLine,
} from './event.js'
import {
  defaultMaximumDirectoryBytes,
  defaultMaximumFileBytes,
  defaultMaximumRotatedFiles,
  fileSink,
  readTelemetryFiles,
  resolveFileLimits,
  runTelemetryCommand,
  telemetryDirectory,
  telemetryFilePath,
} from './node.js'
import { TelemetryOrigin, TelemetrySink } from './sink.js'

const transitionAt = (
  sequence: number,
  message: string,
  payload: Readonly<Record<string, string>> = { padding: 'x'.repeat(80) },
): TelemetryEvent =>
  Transition.make({
    at: new Date(
      Date.UTC(2026, 9, 4, 20, 0, 0) + sequence * 1_000,
    ).toISOString(),
    sequence,
    session: 'cafe0001',
    transition: sequence,
    message,
    payload,
    source: { _tag: 'Host' },
    commands: [],
    isModelChanged: true,
    changedPathCount: 1,
    updateDurationMs: 0.02,
  })

type FileSinkService = Context.Service.Shape<typeof TelemetrySink>

const withFileSink = <A>(
  layer: ReturnType<typeof fileSink>,
  use: (sink: FileSinkService) => Effect.Effect<A>,
): Promise<A> =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const context = yield* Layer.build(
          Layer.provide(
            layer,
            Layer.succeed(TelemetryOrigin, { app: 'books', host: 'cli' }),
          ),
        )
        return yield* use(Context.get(context, TelemetrySink))
      }),
    ),
  )

const sizesIn = async (
  directory: string,
): Promise<ReadonlyArray<Readonly<{ name: string; size: number }>>> => {
  const names = await readdir(directory)
  return Promise.all(
    Array.map(names, async name => ({
      name,
      size: (await stat(join(directory, name))).size,
    })),
  )
}

const totalBytes = (sizes: ReadonlyArray<Readonly<{ size: number }>>): number =>
  Array.reduce(sizes, 0, (total, entry) => total + entry.size)

const inTemporaryDirectory =
  (test: (directory: string) => Promise<void>) => async (): Promise<void> => {
    const directory = await mkdtemp(join(tmpdir(), 'foldkit-telemetry-'))
    try {
      await test(directory)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }

describe('fileSink', () => {
  it(
    'appends one line per event and writes what is waiting when its Scope closes',
    inTemporaryDirectory(async directory => {
      const events = Array.map(Array.range(1, 5), sequence =>
        transitionAt(sequence, 'PressedPlay'),
      )
      await withFileSink(fileSink({ directory }), sink =>
        Effect.sync(() => {
          Array.forEach(events, sink.offer)
        }),
      )
      const text = await readFile(join(directory, 'books-cli.ndjson'), 'utf8')
      const lines = Array.filter(text.split('\n'), line => line !== '')
      expect(lines).toStrictEqual(Array.map(events, encodeLine))
      expect(Array.map(lines, decodeLine)).toStrictEqual(
        Array.map(events, Option.some),
      )
    }),
  )

  it(
    'rotates at the file limit and keeps at most the rotated files it is allowed',
    inTemporaryDirectory(async directory => {
      const limits = {
        maximumFileBytes: 2_000,
        maximumRotatedFiles: 3,
        maximumDirectoryBytes: 1_000_000,
      }
      const perAppLimit =
        limits.maximumFileBytes * (1 + limits.maximumRotatedFiles)
      const observedTotals: Array<number> = []
      await withFileSink(fileSink({ directory, limits }), sink =>
        Effect.gen(function* () {
          for (const batch of Array.chunksOf(Array.range(1, 400), 13)) {
            Array.forEach(batch, sequence => {
              sink.offer(transitionAt(sequence, 'UpdatedTime'))
            })
            yield* sink.flush
            const sizes = yield* Effect.promise(() => sizesIn(directory))
            observedTotals.push(totalBytes(sizes))
            expect(sizes.length).toBeLessThanOrEqual(
              1 + limits.maximumRotatedFiles,
            )
            Array.forEach(sizes, entry => {
              expect(entry.size).toBeLessThanOrEqual(limits.maximumFileBytes)
            })
          }
        }),
      )
      expect(Math.max(...observedTotals)).toBeLessThanOrEqual(perAppLimit)
      expect((await readdir(directory)).sort()).toStrictEqual([
        'books-cli.1.ndjson',
        'books-cli.2.ndjson',
        'books-cli.3.ndjson',
        'books-cli.ndjson',
      ])
      const { events } = await Effect.runPromise(
        readTelemetryFiles([
          join(directory, 'books-cli.3.ndjson'),
          join(directory, 'books-cli.2.ndjson'),
          join(directory, 'books-cli.1.ndjson'),
          join(directory, 'books-cli.ndjson'),
        ]),
      )
      const sequences = Array.map(events, event => event.sequence)
      expect(sequences).toStrictEqual(
        Array.range(
          Option.getOrElse(Array.head(sequences), () => 0),
          400,
        ),
      )
    }),
  )

  it(
    'never lets the directory pass its limit, deleting the oldest files of any app first',
    inTemporaryDirectory(async directory => {
      const limits = {
        maximumFileBytes: 2_000,
        maximumRotatedFiles: 3,
        maximumDirectoryBytes: 9_000,
      }
      const filler = 'y'.repeat(2_999)
      const older = [
        { name: 'reminders-react.1.ndjson', ageSeconds: 3_000 },
        { name: 'reminders-react.ndjson', ageSeconds: 2_000 },
        { name: 'counter-tui.ndjson', ageSeconds: 1_000 },
      ]
      for (const { name, ageSeconds } of older) {
        const path = join(directory, name)
        await writeFile(path, `${filler}\n`)
        const at = new Date(Date.now() - ageSeconds * 1_000)
        await utimes(path, at, at)
      }
      await writeFile(join(directory, 'notes.txt'), 'not telemetry')
      const deletionOrder: Array<string> = []
      await withFileSink(fileSink({ directory, limits }), sink =>
        Effect.gen(function* () {
          for (const batch of Array.chunksOf(Array.range(1, 300), 11)) {
            Array.forEach(batch, sequence => {
              sink.offer(transitionAt(sequence, 'UpdatedTime'))
            })
            yield* sink.flush
            const sizes = yield* Effect.promise(() => sizesIn(directory))
            const telemetrySizes = Array.filter(sizes, entry =>
              entry.name.endsWith('.ndjson'),
            )
            expect(totalBytes(telemetrySizes)).toBeLessThanOrEqual(
              limits.maximumDirectoryBytes,
            )
            Array.forEach(older, ({ name }) => {
              if (
                !Array.some(sizes, entry => entry.name === name) &&
                !Array.contains(deletionOrder, name)
              ) {
                deletionOrder.push(name)
              }
            })
          }
        }),
      )
      expect(deletionOrder).toStrictEqual([
        'reminders-react.1.ndjson',
        'reminders-react.ndjson',
        'counter-tui.ndjson',
      ])
      expect(await readdir(directory)).toContain('notes.txt')
    }),
  )

  it(
    'scrubs this process’s environment values out of every line',
    inTemporaryDirectory(async directory => {
      const secret = 'tok-0123456789abcdef-live'
      process.env['FOLDKIT_TELEMETRY_TEST_TOKEN'] = secret
      try {
        await withFileSink(fileSink({ directory }), sink =>
          Effect.sync(() => {
            sink.offer(
              transitionAt(1, 'SignedIn', {
                greeting: `signed in with ${secret}`,
              }),
            )
          }),
        )
      } finally {
        delete process.env['FOLDKIT_TELEMETRY_TEST_TOKEN']
      }
      const text = await readFile(join(directory, 'books-cli.ndjson'), 'utf8')
      expect(text).not.toContain(secret)
      expect(text).toContain('signed in with [REDACTED]')
    }),
  )

  it(
    'drops the values of a line too long, then the line itself',
    inTemporaryDirectory(async directory => {
      const limits = {
        maximumFileBytes: 2_000,
        maximumLineBytes: 400,
      }
      await withFileSink(fileSink({ directory, limits }), sink =>
        Effect.sync(() => {
          sink.offer(transitionAt(1, 'PastedText', { text: 'z'.repeat(1_000) }))
          sink.offer(transitionAt(2, 'x'.repeat(1_000)))
          sink.offer(transitionAt(3, 'Typed'))
        }),
      )
      const { events } = await Effect.runPromise(
        readTelemetryFiles([join(directory, 'books-cli.ndjson')]),
      )
      expect(Array.map(events, event => event.sequence)).toStrictEqual([1, 3])
      expect(Array.head(events)).toStrictEqual(
        Option.some(
          expect.objectContaining({
            message: 'PastedText',
            payload: '[TRUNCATED]',
          }),
        ),
      )
    }),
  )

  it(
    'opens a new file when its file was deleted meanwhile',
    inTemporaryDirectory(async directory => {
      const path = join(directory, 'books-cli.ndjson')
      await withFileSink(fileSink({ directory }), sink =>
        Effect.gen(function* () {
          sink.offer(transitionAt(1, 'First'))
          yield* sink.flush
          yield* Effect.promise(() => unlink(path))
          sink.offer(transitionAt(2, 'Second'))
        }),
      )
      const { events } = await Effect.runPromise(readTelemetryFiles([path]))
      expect(Array.map(events, event => event.sequence)).toStrictEqual([2])
    }),
  )

  it('caps one app and host at 40 MB and the directory at 200 MB by default', () => {
    expect(defaultMaximumFileBytes).toBe(10 * 1024 * 1024)
    expect(defaultMaximumRotatedFiles).toBe(3)
    expect(defaultMaximumDirectoryBytes).toBe(200 * 1024 * 1024)
    expect(resolveFileLimits()).toMatchObject({
      maximumFileBytes: defaultMaximumFileBytes,
      maximumRotatedFiles: defaultMaximumRotatedFiles,
      maximumDirectoryBytes: defaultMaximumDirectoryBytes,
    })
    expect(() =>
      resolveFileLimits({ maximumFileBytes: 10, maximumDirectoryBytes: 5 }),
    ).toThrow(RangeError)
    expect(() => resolveFileLimits({ maximumRotatedFiles: -1 })).toThrow(
      RangeError,
    )
  })

  it('writes to ~/Library/Logs/foldkit/telemetry on macOS by default', () => {
    if (process.platform === 'darwin') {
      expect(telemetryDirectory()).toBe(
        join(homedir(), 'Library', 'Logs', 'foldkit', 'telemetry'),
      )
    }
    expect(telemetryFilePath({ app: 'books', host: 'react' }, '/logs')).toBe(
      '/logs/books-react.ndjson',
    )
  })
})

describe('runTelemetryCommand', () => {
  it(
    'prints a summary of one file for a window',
    inTemporaryDirectory(async directory => {
      await writeFile(
        join(directory, 'books-react.ndjson'),
        `${Array.join(
          Array.map(Array.range(1, 4), sequence =>
            encodeLine(
              transitionAt(sequence, sequence > 2 ? 'Paused' : 'Played'),
            ),
          ),
          '\n',
        )}\nnot a line\n`,
      )
      const result = await Effect.runPromise(
        runTelemetryCommand(
          ['books-react', '--from', '2026-10-04T20:00:02.000Z'],
          directory,
        ),
      )
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Telemetry for books-react.ndjson')
      expect(result.stdout).toContain(
        'From 2026-10-04T20:00:02.000Z to 2026-10-04T20:00:04.000Z, 3 events',
      )
      expect(result.stdout).toContain('2      Paused')
      expect(result.stdout).toContain(
        '1 lines could not be read and were skipped.',
      )

      const json = await Effect.runPromise(
        runTelemetryCommand(['books-react', '--json'], directory),
      )
      expect(JSON.parse(json.stdout)).toMatchObject({
        eventCount: 4,
        transitionCount: 4,
        unreadableLineCount: 1,
        topMessages: [
          { name: 'Played', count: 2 },
          { name: 'Paused', count: 2 },
        ],
      })
    }),
  )

  it(
    'lists the files it could read, and refuses arguments it does not know',
    inTemporaryDirectory(async directory => {
      await writeFile(join(directory, 'books-cli.ndjson'), '')
      const listing = await Effect.runPromise(
        runTelemetryCommand([], directory),
      )
      expect(listing.stdout).toContain('books-cli.ndjson')
      const refused = await Effect.runPromise(
        runTelemetryCommand(['books-cli', '--since', 'soon'], directory),
      )
      expect(refused.exitCode).toBe(2)
    }),
  )
})
