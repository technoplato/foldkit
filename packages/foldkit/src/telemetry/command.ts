/// <reference types="node" />
import { Array, Effect, Option, Order, Record, Schema as S, pipe } from 'effect'
import { basename, dirname, join } from 'node:path'

import { everyHost, print } from '../processor/host.js'
import {
  type TelemetryFileError,
  entriesOf,
  generationOf,
  readTelemetryFiles,
  telemetryDirectory,
  telemetryExtension,
} from './fileSink.js'
import {
  type TelemetryWindow,
  defaultSummaryRowLimit,
  formatSummary,
  summarize,
  wholeWindow,
} from './summary.js'
import { TelemetrySurface } from './surface.js'

const durationPattern = /^(\d+(?:\.\d+)?)(s|m|h|d)$/

const millisecondsPerUnit: Readonly<Record<string, number>> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
}

const parseDurationMs = (text: string): Option.Option<number> =>
  pipe(
    Option.fromNullishOr(durationPattern.exec(text)),
    Option.flatMap(match =>
      Option.all([Array.get(match, 1), Array.get(match, 2)]),
    ),
    Option.flatMap(([amount, unit]) =>
      Option.map(
        Record.get(millisecondsPerUnit, unit),
        unitMs => Number(amount) * unitMs,
      ),
    ),
  )

const parseTimeMs = (text: string): Option.Option<number> => {
  const timeMs = Date.parse(text)
  return Number.isFinite(timeMs) ? Option.some(timeMs) : Option.none()
}

/** The files and flags `foldkit telemetry` was asked for. */
export const TelemetryCommandRequest = S.Struct({
  files: S.Array(S.String),
  surface: S.optionalKey(TelemetrySurface),
  since: S.optionalKey(S.String),
  from: S.optionalKey(S.String),
  to: S.optionalKey(S.String),
  limit: S.optionalKey(S.Int),
  isJson: S.Boolean,
  isIncludingRotated: S.Boolean,
})

/** The files and flags `foldkit telemetry` was asked for. */
export type TelemetryCommandRequest = typeof TelemetryCommandRequest.Type

const usage = Array.join(
  [
    'Usage: foldkit telemetry <app, app-surface, or file>... [options]',
    '',
    'Summarizes Foldkit telemetry surface by surface: the top Messages and',
    'Actions, the slowest Commands, Command failures, update and render',
    'durations, transitions per minute, and Subscription restarts.',
    '',
    '  books                 every surface of app books, such as books-web-react,',
    '                        and its files from before surfaces, such as books-react',
    '  books-terminal-tui    the file for app books on surface terminal-tui',
    '  ./trace.ndjson        any telemetry file',
    '  --surface web-react   only one surface',
    '  --since 30m           only the last 30 minutes (s, m, h, or d)',
    '  --from <ISO time>     only events at or after this time',
    '  --to <ISO time>       only events at or before this time',
    '  --rotated             also read the rotated files beside each file',
    '  --limit 10            rows per ranked table',
    '  --json                print the summary as JSON',
    '',
    `Surfaces: ${Array.join(TelemetrySurface.literals, ', ')}`,
  ],
  '\n',
)

const valueFlags: ReadonlyArray<string> = [
  '--surface',
  '--since',
  '--from',
  '--to',
  '--limit',
]

const isTelemetrySurface = S.is(TelemetrySurface)

const isValidWhenPresent = <A>(
  maybeValue: Option.Option<A>,
  isValid: (value: A) => boolean,
): boolean => Option.match(maybeValue, { onNone: () => true, onSome: isValid })

const optionalField = <Key extends string, A>(
  key: Key,
  maybeValue: Option.Option<A>,
): Partial<Record<Key, A>> =>
  Option.match(maybeValue, {
    onNone: () => ({}),
    onSome: value => Record.singleton(key, value),
  })

/**
 * Reads `foldkit telemetry` arguments: files and flags in any order. None
 * when an argument is not understood, such as `--since soon`.
 *
 * @example
 * ```typescript
 * parseTelemetryArguments(['books', '--surface', 'terminal-tui', '--since', '30m'])
 * // Some({ files: ['books'], surface: 'terminal-tui', since: '30m', isJson: false, isIncludingRotated: false })
 * ```
 */
export const parseTelemetryArguments = (
  argv: ReadonlyArray<string>,
): Option.Option<TelemetryCommandRequest> => {
  const files: Array<string> = []
  const values: Record<string, string> = {}
  let isJson = false
  let isIncludingRotated = false
  let index = 0
  while (index < argv.length) {
    const argument = Option.getOrElse(Array.get(argv, index), () => '')
    if (argument === '--json') {
      isJson = true
    } else if (argument === '--rotated') {
      isIncludingRotated = true
    } else if (Array.contains(valueFlags, argument)) {
      const maybeValue = Array.get(argv, index + 1)
      if (Option.isNone(maybeValue)) {
        return Option.none()
      }
      values[argument] = maybeValue.value
      index += 1
    } else if (argument.startsWith('--')) {
      return Option.none()
    } else {
      files.push(argument)
    }
    index += 1
  }
  const maybeSurfaceText = Record.get(values, '--surface')
  const maybeSurface = Option.filter(maybeSurfaceText, isTelemetrySurface)
  const maybeSince = Record.get(values, '--since')
  const maybeFrom = Record.get(values, '--from')
  const maybeTo = Record.get(values, '--to')
  const maybeLimit = Option.map(Record.get(values, '--limit'), Number)
  const isValid =
    Option.isSome(maybeSurfaceText) === Option.isSome(maybeSurface) &&
    isValidWhenPresent(maybeSince, since =>
      Option.isSome(parseDurationMs(since)),
    ) &&
    isValidWhenPresent(maybeFrom, from => Option.isSome(parseTimeMs(from))) &&
    isValidWhenPresent(maybeTo, to => Option.isSome(parseTimeMs(to))) &&
    isValidWhenPresent(
      maybeLimit,
      limit => Number.isInteger(limit) && limit > 0,
    )
  if (!isValid) {
    return Option.none()
  }
  return Option.some({
    files,
    ...optionalField('surface', maybeSurface),
    ...optionalField('since', maybeSince),
    ...optionalField('from', maybeFrom),
    ...optionalField('to', maybeTo),
    ...optionalField('limit', maybeLimit),
    isJson,
    isIncludingRotated,
  })
}

const windowOf = (
  request: TelemetryCommandRequest,
  nowMs: number,
): TelemetryWindow => {
  const maybeSinceFromMs = Option.map(
    Option.flatMap(Option.fromNullishOr(request.since), parseDurationMs),
    sinceMs => nowMs - sinceMs,
  )
  const maybeFromMs = Option.orElse(
    Option.flatMap(Option.fromNullishOr(request.from), parseTimeMs),
    () => maybeSinceFromMs,
  )
  const maybeToMs = Option.flatMap(
    Option.fromNullishOr(request.to),
    parseTimeMs,
  )
  if (Option.isNone(maybeFromMs) && Option.isNone(maybeToMs)) {
    return wholeWindow
  } else {
    return { maybeFromMs, maybeToMs }
  }
}

const stemOfName = (name: string): string =>
  name.endsWith(telemetryExtension)
    ? name.slice(0, name.length - telemetryExtension.length)
    : name

/**
 * The files one argument names. A path with a slash is that file. A name
 * of a file in the directory, such as `books-terminal-tui` or
 * `books-terminal-tui.ndjson`, is that file. Any other name is an app,
 * and names every file of that app's surfaces, `books` naming
 * `books-terminal-tui.ndjson` and `books-web-react.ndjson`, in the order
 * TelemetrySurface lists them, then its files from before surfaces, named
 * for a Host, such as `books-react.ndjson`. A file name found nowhere
 * names a file in the current directory when it ends in `.ndjson`, and
 * otherwise its file in the telemetry directory, which reads as empty.
 */
const filesNamedBy = (
  name: string,
  directory: string,
  directoryNames: ReadonlySet<string>,
): ReadonlyArray<string> => {
  if (name.includes('/')) {
    return [name]
  }
  const stem = stemOfName(name)
  const fileName = `${stem}${telemetryExtension}`
  if (directoryNames.has(fileName)) {
    return [join(directory, fileName)]
  }
  const appFileNames = Array.filter(
    Array.dedupe([
      ...Array.map(
        TelemetrySurface.literals,
        surface => `${stem}-${surface}${telemetryExtension}`,
      ),
      ...Array.map(
        everyHost,
        host => `${stem}-${print(host)}${telemetryExtension}`,
      ),
    ]),
    appFileName => directoryNames.has(appFileName),
  )
  return Array.match(appFileNames, {
    onNonEmpty: names => Array.map(names, found => join(directory, found)),
    onEmpty: () =>
      name.endsWith(telemetryExtension) ? [name] : [join(directory, fileName)],
  })
}

type RotatedFile = Readonly<{ path: string; generation: number }>

const oldestGenerationFirst = Order.flip(
  Order.mapInput(Order.Number, (file: RotatedFile) => file.generation),
)

const pathsToRead = (
  file: string,
  isIncludingRotated: boolean,
): Effect.Effect<ReadonlyArray<string>, TelemetryFileError> => {
  if (!isIncludingRotated) {
    return Effect.succeed([file])
  }
  return Effect.map(entriesOf(dirname(file)), entries =>
    pipe(
      entries,
      Array.flatMap(entry =>
        Option.match(generationOf(file, entry.path), {
          onNone: () => [],
          onSome: generation => [{ path: entry.path, generation }],
        }),
      ),
      Array.sort(oldestGenerationFirst),
      Array.map(rotatedFile => rotatedFile.path),
      Array.append(file),
    ),
  )
}

/** What `foldkit telemetry` printed, and the exit code it ends with. */
export type TelemetryCommandResult = Readonly<{
  stdout: string
  exitCode: number
}>

const listingOf = (
  directory: string,
): Effect.Effect<ReadonlyArray<string>, TelemetryFileError> =>
  Effect.map(entriesOf(directory), entries =>
    Array.match(entries, {
      onEmpty: () => [`No telemetry files in ${directory}`],
      onNonEmpty: nonEmptyEntries => [
        `Telemetry files in ${directory}:`,
        ...Array.map(
          nonEmptyEntries,
          entry =>
            `  ${basename(entry.path)}  ${(entry.size / 1024).toFixed(1)} KB`,
        ),
      ],
    }),
  )

/**
 * Runs `foldkit telemetry`: reads the files named, summarizes the window
 * asked for surface by surface, and returns what to print. An app name
 * such as `books` reads every surface's file of that app in `directory`,
 * and an app-surface name such as `books-terminal-tui` reads that one
 * file. `--surface` keeps only one surface's events. With no file, it
 * prints usage and lists the telemetry files in `directory`. Exit code 2
 * means the arguments were not understood, such as a surface that is not
 * one of TelemetrySurface, and 1 that a file could not be read.
 *
 * @example
 * ```typescript
 * yield* runTelemetryCommand(['books', '--since', '1h'])
 * // { stdout: 'Telemetry for books-terminal-tui.ndjson, books-web-react.ndjson\nFrom 2026-10-04T19:40:11.002Z …', exitCode: 0 }
 * ```
 */
export const runTelemetryCommand = (
  argv: ReadonlyArray<string>,
  directory: string = telemetryDirectory(),
  nowMs: number = Date.now(),
): Effect.Effect<TelemetryCommandResult> =>
  Effect.gen(function* () {
    const maybeRequest = parseTelemetryArguments(argv)
    if (Option.isNone(maybeRequest)) {
      return { stdout: usage, exitCode: 2 }
    }
    const request = maybeRequest.value
    if (Array.isReadonlyArrayEmpty(request.files)) {
      const listing = yield* listingOf(directory)
      return { stdout: Array.join([usage, '', ...listing], '\n'), exitCode: 0 }
    }
    const directoryNames = new Set(
      Array.map(yield* entriesOf(directory), entry => basename(entry.path)),
    )
    const files = Array.dedupe(
      Array.flatMap(request.files, name =>
        filesNamedBy(name, directory, directoryNames),
      ),
    )
    const paths = yield* Effect.forEach(files, file =>
      pathsToRead(file, request.isIncludingRotated),
    )
    const { events, unreadableLineCount } = yield* readTelemetryFiles(
      Array.flatten(paths),
    )
    const summary = summarize(
      Option.match(Option.fromNullishOr(request.surface), {
        onNone: () => events,
        onSome: surface =>
          Array.filter(events, event => event.surface === surface),
      }),
      windowOf(request, nowMs),
      request.limit ?? defaultSummaryRowLimit,
    )
    if (request.isJson) {
      return {
        stdout: JSON.stringify({ ...summary, unreadableLineCount }, null, 2),
        exitCode: 0,
      }
    }
    const unreadableLines =
      unreadableLineCount === 0
        ? []
        : [`${unreadableLineCount} lines could not be read and were skipped.`]
    return {
      stdout: Array.join(
        [
          formatSummary(
            summary,
            Array.join(
              Array.map(files, file => basename(file)),
              ', ',
            ),
          ),
          ...unreadableLines,
        ],
        '\n\n',
      ),
      exitCode: 0,
    }
  }).pipe(
    Effect.catch(error =>
      Effect.succeed({
        stdout: `Could not read ${error.path}: ${String(error.cause)}`,
        exitCode: 1,
      }),
    ),
  )
