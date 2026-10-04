/// <reference types="node" />
import {
  Array,
  Data,
  Effect,
  Layer,
  Match as M,
  Option,
  Order,
  Predicate,
  pipe,
} from 'effect'
import { constants } from 'node:fs'
import {
  type FileHandle,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
} from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { type TelemetryEvent, decodeLine, encodeLine } from './event.js'
import {
  makeRedactionPolicy,
  scrubEvent,
  secretValuePatternOf,
  truncatedMarker,
} from './redact.js'
import {
  type TelemetryBatching,
  TelemetryOrigin,
  TelemetrySink,
  type TelemetrySinkLayer,
  defaultTelemetryBatching,
  makeBufferedSink,
} from './sink.js'

// LIMITS

const bytesPerMegabyte = 1024 * 1024

/** The size at which a telemetry file rotates: 10 MB. */
export const defaultMaximumFileBytes = 10 * bytesPerMegabyte

/** How many rotated files one app and host keeps beside its live file: 3. */
export const defaultMaximumRotatedFiles = 3

/** The most the whole telemetry directory holds across apps: 200 MB. */
export const defaultMaximumDirectoryBytes = 200 * bytesPerMegabyte

/** The longest line a file sink writes before it drops an event's values. */
export const defaultMaximumLineBytes = 256 * 1024

/**
 * How much disk a file sink may use. One app and host holds at most
 * `maximumFileBytes × (1 + maximumRotatedFiles)`, 40 MB by default: the
 * live file and its rotated files, `books-react.ndjson` and
 * `books-react.1.ndjson` through `books-react.3.ndjson`, where `.1` is the
 * newest. The whole directory holds at most `maximumDirectoryBytes`, 200
 * MB by default; before a write would pass it, the sink deletes the oldest
 * telemetry files of any app. A line longer than `maximumLineBytes` loses
 * its payload, args, and Model, and a line still too long is dropped.
 */
export type TelemetryFileLimits = Readonly<{
  maximumFileBytes: number
  maximumRotatedFiles: number
  maximumDirectoryBytes: number
  maximumLineBytes: number
}>

/** The limits a file sink uses unless told otherwise. */
export const defaultTelemetryFileLimits: TelemetryFileLimits = {
  maximumFileBytes: defaultMaximumFileBytes,
  maximumRotatedFiles: defaultMaximumRotatedFiles,
  maximumDirectoryBytes: defaultMaximumDirectoryBytes,
  maximumLineBytes: defaultMaximumLineBytes,
}

const positiveInteger = (name: string, value: number): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer, got ${value}`)
  }
  return value
}

const nonNegativeInteger = (name: string, value: number): number => {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${value}`)
  }
  return value
}

/**
 * Fills in and checks file limits. A line can be no longer than a file,
 * so `maximumLineBytes` is cut to `maximumFileBytes`. Throws a RangeError
 * for a limit that is not a whole number, and when the directory could not
 * hold one full file.
 *
 * @example
 * ```typescript
 * resolveFileLimits({ maximumFileBytes: 1_000_000 })
 * // { maximumFileBytes: 1000000, maximumRotatedFiles: 3, maximumDirectoryBytes: 209715200, maximumLineBytes: 262144 }
 * ```
 */
export const resolveFileLimits = (
  limits: Partial<TelemetryFileLimits> = {},
): TelemetryFileLimits => {
  const resolved = { ...defaultTelemetryFileLimits, ...limits }
  const maximumFileBytes = positiveInteger(
    'maximumFileBytes',
    resolved.maximumFileBytes,
  )
  const maximumDirectoryBytes = positiveInteger(
    'maximumDirectoryBytes',
    resolved.maximumDirectoryBytes,
  )
  if (maximumDirectoryBytes < maximumFileBytes) {
    throw new RangeError(
      `maximumDirectoryBytes (${maximumDirectoryBytes}) must hold at least one file of maximumFileBytes (${maximumFileBytes})`,
    )
  }
  return {
    maximumFileBytes,
    maximumRotatedFiles: nonNegativeInteger(
      'maximumRotatedFiles',
      resolved.maximumRotatedFiles,
    ),
    maximumDirectoryBytes,
    maximumLineBytes: Math.min(
      positiveInteger('maximumLineBytes', resolved.maximumLineBytes),
      maximumFileBytes,
    ),
  }
}

// PATHS

/** The extension every telemetry file ends with. */
export const telemetryExtension = '.ndjson'

/**
 * The directory telemetry files live in by default:
 * `~/Library/Logs/foldkit/telemetry` on macOS, and
 * `$XDG_STATE_HOME/foldkit/telemetry`, else
 * `~/.local/state/foldkit/telemetry`, elsewhere.
 *
 * @example
 * ```typescript
 * telemetryDirectory() // '/Users/ada/Library/Logs/foldkit/telemetry'
 * ```
 */
export const telemetryDirectory = (): string =>
  process.platform === 'darwin'
    ? join(homedir(), 'Library', 'Logs', 'foldkit', 'telemetry')
    : join(
        process.env['XDG_STATE_HOME'] ?? join(homedir(), '.local', 'state'),
        'foldkit',
        'telemetry',
      )

/**
 * The live file for one app and host in a directory.
 *
 * @example
 * ```typescript
 * telemetryFilePath({ app: 'books', host: 'react' })
 * // '/Users/ada/Library/Logs/foldkit/telemetry/books-react.ndjson'
 * ```
 */
export const telemetryFilePath = (
  origin: Readonly<{ app: string; host: string }>,
  directory: string = telemetryDirectory(),
): string =>
  join(directory, `${origin.app}-${origin.host}${telemetryExtension}`)

const stemOf = (path: string): string =>
  path.slice(0, path.length - telemetryExtension.length)

const rotatedPathOf = (path: string, generation: number): string =>
  `${stemOf(path)}.${generation}${telemetryExtension}`

/**
 * Which rotation a file is of a live file, such as 2 for
 * `books-react.2.ndjson` beside `books-react.ndjson`, or None for any
 * other file.
 */
export const generationOf = (
  livePath: string,
  candidatePath: string,
): Option.Option<number> => {
  const prefix = `${stemOf(livePath)}.`
  if (
    !candidatePath.startsWith(prefix) ||
    !candidatePath.endsWith(telemetryExtension)
  ) {
    return Option.none()
  }
  const generation = Number(
    candidatePath.slice(
      prefix.length,
      candidatePath.length - telemetryExtension.length,
    ),
  )
  return Number.isInteger(generation) && generation > 0
    ? Option.some(generation)
    : Option.none()
}

// FILE

/** A telemetry file could not be read, written, rotated, or pruned. */
export class TelemetryFileError extends Data.TaggedError('TelemetryFileError')<{
  readonly path: string
  readonly cause: unknown
}> {}

const isMissing = (error: unknown): boolean =>
  Predicate.hasProperty(error, 'code') && error.code === 'ENOENT'

const attempt = <A>(
  path: string,
  run: () => Promise<A>,
): Effect.Effect<A, TelemetryFileError> =>
  Effect.tryPromise({
    try: run,
    catch: cause => new TelemetryFileError({ path, cause }),
  })

const attemptUnlessMissing = <A>(
  path: string,
  run: () => Promise<A>,
): Effect.Effect<Option.Option<A>, TelemetryFileError> =>
  Effect.tryPromise({
    try: () =>
      run().then(
        value => Option.some(value),
        (error: unknown) =>
          isMissing(error) ? Option.none<A>() : Promise.reject(error),
      ),
    catch: cause => new TelemetryFileError({ path, cause }),
  })

type DirectoryEntry = Readonly<{
  path: string
  size: number
  modifiedMs: number
}>

const oldestFirst = Order.mapInput(
  Order.Number,
  (entry: DirectoryEntry) => entry.modifiedMs,
)

/**
 * Every telemetry file in a directory, with its size and when it last
 * changed. A directory that does not exist has none.
 */
export const entriesOf = (
  directory: string,
): Effect.Effect<ReadonlyArray<DirectoryEntry>, TelemetryFileError> =>
  Effect.gen(function* () {
    const maybeNames = yield* attemptUnlessMissing(directory, () =>
      readdir(directory),
    )
    const telemetryNames = Array.filter(
      Option.getOrElse(maybeNames, () => []),
      name => name.endsWith(telemetryExtension),
    )
    const maybeEntries = yield* Effect.forEach(telemetryNames, name => {
      const path = join(directory, name)
      return Effect.map(
        attemptUnlessMissing(path, () => stat(path)),
        Option.map(stats => ({
          path,
          size: stats.size,
          modifiedMs: stats.mtimeMs,
        })),
      )
    })
    return Array.getSomes(maybeEntries)
  })

const totalSizeOf = (entries: ReadonlyArray<DirectoryEntry>): number =>
  Array.reduce(entries, 0, (total, entry) => total + entry.size)

const lineBytesOf = (line: string): number => Buffer.byteLength(line) + 1

const removeFile = (path: string): Effect.Effect<void, TelemetryFileError> =>
  Effect.asVoid(attemptUnlessMissing(path, () => unlink(path)))

/**
 * One app and host's telemetry file. It appends lines, rotates the file
 * before a write would pass `maximumFileBytes`, keeps
 * `maximumRotatedFiles` rotated files, and deletes the oldest telemetry
 * files in the directory before a write would pass
 * `maximumDirectoryBytes`. It opens its file handle on the first write,
 * and opens a new one when the file was deleted or replaced meanwhile.
 */
type RotatingLog = Readonly<{
  append: (
    lines: ReadonlyArray<string>,
  ) => Effect.Effect<void, TelemetryFileError>
  close: Effect.Effect<void>
}>

const makeRotatingLog = (
  path: string,
  limits: TelemetryFileLimits,
): RotatingLog => {
  const directory = dirname(path)
  let maybeHandle = Option.none<FileHandle>()
  let size = 0

  const closeHandle: Effect.Effect<void, TelemetryFileError> = Effect.suspend(
    () => {
      if (Option.isNone(maybeHandle)) {
        return Effect.void
      }
      const handle = maybeHandle.value
      maybeHandle = Option.none()
      return attempt(path, () => handle.close())
    },
  )

  const openHandle = Effect.gen(function* () {
    yield* attempt(directory, () => mkdir(directory, { recursive: true }))
    const handle = yield* attempt(path, () =>
      open(
        path,
        constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT,
        0o600,
      ),
    )
    const stats = yield* attempt(path, () => handle.stat())
    size = stats.size
    maybeHandle = Option.some(handle)
    return handle
  })

  const currentHandle: Effect.Effect<FileHandle, TelemetryFileError> =
    Effect.gen(function* () {
      if (Option.isNone(maybeHandle)) {
        return yield* openHandle
      }
      const handle = maybeHandle.value
      const maybePathStats = yield* attemptUnlessMissing(path, () => stat(path))
      const handleStats = yield* attempt(path, () => handle.stat())
      const isSameFile = Option.exists(
        maybePathStats,
        pathStats => pathStats.ino === handleStats.ino,
      )
      if (isSameFile) {
        return handle
      }
      yield* closeHandle
      return yield* openHandle
    })

  const removeExtraRotatedFiles = Effect.gen(function* () {
    const entries = yield* entriesOf(directory)
    yield* Effect.forEach(
      Array.filter(entries, entry =>
        Option.exists(
          generationOf(path, entry.path),
          generation => generation > limits.maximumRotatedFiles,
        ),
      ),
      entry => removeFile(entry.path),
      { discard: true },
    )
  })

  const rotate = Effect.gen(function* () {
    yield* closeHandle
    if (limits.maximumRotatedFiles === 0) {
      yield* removeFile(path)
    } else {
      const shiftedGenerations =
        limits.maximumRotatedFiles > 1
          ? Array.reverse(Array.range(1, limits.maximumRotatedFiles - 1))
          : []
      yield* Effect.forEach(
        shiftedGenerations,
        generation =>
          attemptUnlessMissing(path, () =>
            rename(
              rotatedPathOf(path, generation),
              rotatedPathOf(path, generation + 1),
            ),
          ),
        { discard: true },
      )
      yield* attemptUnlessMissing(path, () =>
        rename(path, rotatedPathOf(path, 1)),
      )
    }
    yield* removeExtraRotatedFiles
    size = 0
  })

  const makeRoomInDirectory = (
    incomingBytes: number,
  ): Effect.Effect<void, TelemetryFileError> =>
    Effect.gen(function* () {
      const entries = yield* entriesOf(directory)
      const othersOldestFirst = pipe(
        entries,
        Array.filter(entry => entry.path !== path),
        Array.sort(oldestFirst),
      )
      let total = totalSizeOf(entries)
      for (const entry of othersOldestFirst) {
        if (total + incomingBytes <= limits.maximumDirectoryBytes) {
          return
        }
        yield* removeFile(entry.path)
        total -= entry.size
      }
    })

  const writeChunk = (
    lines: ReadonlyArray<string>,
  ): Effect.Effect<void, TelemetryFileError> =>
    Effect.gen(function* () {
      if (Array.isReadonlyArrayEmpty(lines)) {
        return
      }
      const text = `${Array.join(lines, '\n')}\n`
      const textBytes = Buffer.byteLength(text)
      const handle = yield* currentHandle
      yield* makeRoomInDirectory(textBytes)
      yield* attempt(path, () => handle.appendFile(text, 'utf8'))
      size += textBytes
    })

  const append = (
    lines: ReadonlyArray<string>,
  ): Effect.Effect<void, TelemetryFileError> =>
    Effect.gen(function* () {
      yield* currentHandle
      let chunk: Array<string> = []
      let chunkBytes = 0
      for (const line of lines) {
        const bytes = lineBytesOf(line)
        if (size + chunkBytes + bytes > limits.maximumFileBytes) {
          yield* writeChunk(chunk)
          chunk = []
          chunkBytes = 0
          if (size > 0) {
            yield* rotate
            yield* currentHandle
          }
        }
        chunk.push(line)
        chunkBytes += bytes
      }
      yield* writeChunk(chunk)
    })

  return { append, close: Effect.ignore(closeHandle) }
}

const withoutValues = (event: TelemetryEvent): TelemetryEvent =>
  M.value(event).pipe(
    M.withReturnType<TelemetryEvent>(),
    M.tagsExhaustive({
      SessionStarted: started => started,
      SessionStopped: stopped => stopped,
      Rendered: rendered => rendered,
      Diagnostic: diagnostic => diagnostic,
      Crashed: crashed => crashed,
      Transition: ({ payload: _payload, model: _model, ...transition }) => ({
        ...transition,
        payload: truncatedMarker,
        commands: Array.map(transition.commands, command => ({
          name: command.name,
        })),
      }),
      CommandStarted: ({ args: _args, ...started }) => started,
      CommandFinished: ({ args: _args, ...finished }) => finished,
    }),
  )

const boundedLineOf = (
  event: TelemetryEvent,
  limits: TelemetryFileLimits,
): Option.Option<string> => {
  const line = encodeLine(event)
  if (lineBytesOf(line) <= limits.maximumLineBytes) {
    return Option.some(line)
  }
  const reducedLine = encodeLine(withoutValues(event))
  return lineBytesOf(reducedLine) <= limits.maximumLineBytes
    ? Option.some(reducedLine)
    : Option.none()
}

const environmentValues = (): ReadonlyArray<string> =>
  Array.filter(Object.values(process.env), Predicate.isString)

/**
 * Where a file sink writes. `path` names the file outright; otherwise the
 * sink writes `<app>-<host>.ndjson` in `directory`, which defaults to
 * {@link telemetryDirectory}. `limits` overrides any of
 * {@link defaultTelemetryFileLimits}.
 */
export type FileSinkOptions = Readonly<{
  directory?: string
  path?: string
  limits?: Partial<TelemetryFileLimits>
  batching?: Partial<TelemetryBatching>
}>

/**
 * A sink that appends events to a local file, one NDJSON line each, for
 * the CLI, TUI, OpenTUI, a CLI daemon, or a development server: by default
 * `~/Library/Logs/foldkit/telemetry/<app>-<host>.ndjson`, such as
 * `books-cli.ndjson`. It is a scoped Layer that owns its file handle:
 * closing its Scope writes every waiting event and closes the handle.
 *
 * Disk use is capped by {@link TelemetryFileLimits}: the file rotates at
 * 10 MB, three rotated files are kept, and the whole directory never
 * passes 200 MB. Before writing, the sink scrubs every value of this
 * process's environment out of each event, so a token in the environment
 * never reaches the file even when a Program put it in a Message. A write
 * that fails is reported once on stderr and dropped; telemetry never stops
 * the Program.
 *
 * Throws a RangeError when a limit is invalid.
 *
 * @example
 * ```typescript
 * Telemetry.attach(handle, { app: 'books', sink: fileSink() })
 * Telemetry.attach(handle, { app: 'books', sink: fileSink({ limits: { maximumFileBytes: 2 * 1024 * 1024 } }) })
 * ```
 */
export const fileSink = (options: FileSinkOptions = {}): TelemetrySinkLayer => {
  const limits = resolveFileLimits(options.limits)
  return Layer.effect(
    TelemetrySink,
    Effect.gen(function* () {
      const origin = yield* TelemetryOrigin
      const path =
        options.path ??
        telemetryFilePath(origin, options.directory ?? telemetryDirectory())
      const policy = makeRedactionPolicy(
        [],
        secretValuePatternOf(environmentValues()),
      )
      const log = yield* Effect.acquireRelease(
        Effect.sync(() => makeRotatingLog(path, limits)),
        rotatingLog => rotatingLog.close,
      )
      let isReportingFailure = true
      const write = (
        events: ReadonlyArray<TelemetryEvent>,
      ): Effect.Effect<void> =>
        log
          .append(
            Array.getSomes(
              Array.map(events, event =>
                boundedLineOf(scrubEvent(event, policy), limits),
              ),
            ),
          )
          .pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                isReportingFailure = true
              }),
            ),
            Effect.catch(error =>
              Effect.sync(() => {
                if (isReportingFailure) {
                  isReportingFailure = false
                  console.error(
                    `[foldkit] Telemetry could not write ${error.path}:`,
                    error.cause,
                  )
                }
              }),
            ),
          )
      const sink = yield* makeBufferedSink(write, {
        ...defaultTelemetryBatching,
        ...options.batching,
      })
      return { offer: sink.offer, flush: sink.flush }
    }),
  )
}

// READ

/** What reading telemetry files found: the events, and lines it could not read. */
export type ReadTelemetry = Readonly<{
  events: ReadonlyArray<TelemetryEvent>
  unreadableLineCount: number
}>

/**
 * Reads every event in telemetry files, in the order given. A line that is
 * not an event, such as one cut short when a process stopped mid-write, is
 * counted and skipped. A file that does not exist reads as empty.
 *
 * @example
 * ```typescript
 * const { events, unreadableLineCount } = yield* readTelemetryFiles([telemetryFilePath({ app: 'books', host: 'react' })])
 * ```
 */
export const readTelemetryFiles = (
  paths: ReadonlyArray<string>,
): Effect.Effect<ReadTelemetry, TelemetryFileError> =>
  Effect.gen(function* () {
    const texts = yield* Effect.forEach(paths, path =>
      attemptUnlessMissing(path, () => readFile(path, 'utf8')),
    )
    const lines = Array.filter(
      Array.flatMap(Array.getSomes(texts), text => text.split('\n')),
      line => line.trim() !== '',
    )
    const decoded = Array.map(lines, decodeLine)
    return {
      events: Array.getSomes(decoded),
      unreadableLineCount: Array.filter(decoded, Option.isNone).length,
    }
  })
