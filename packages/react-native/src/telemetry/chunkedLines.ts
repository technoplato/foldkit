// CHUNKED LINES

const defaultEveryMs = 2_000

const twoDigits = (value: number): string => value.toString().padStart(2, '0')

/**
 * The name of one trace file: when it was written, to the second in UTC,
 * and its place in line, so files sort in the order they were written.
 *
 * @example
 * ```typescript
 * chunkNameOf(new Date('2026-11-19T14:27:12Z'), 7) // '20261119T142712Z-000007.ndjson'
 * ```
 */
export const chunkNameOf = (at: Date, place: number): string =>
  `${at.getUTCFullYear().toString()}${twoDigits(at.getUTCMonth() + 1)}${twoDigits(
    at.getUTCDate(),
  )}T${twoDigits(at.getUTCHours())}${twoDigits(at.getUTCMinutes())}${twoDigits(
    at.getUTCSeconds(),
  )}Z-${place.toString().padStart(6, '0')}.ndjson`

/** A writer of trace lines that keeps them as small files. */
export type ChunkedLines = Readonly<{
  /** Takes one line; it is written with the others of its moment. */
  write: (line: string) => void
  /** Takes one line and writes everything held at once. */
  writeNow: (line: string) => void
}>

/**
 * Keeps trace lines as small files, for a build that carries its own code
 * and has no dev server reading its console: lines are held for `everyMs`
 * and written together as one file, named by `chunkNameOf`, through
 * `writeChunk`, which the app gives, such as a file in its own container.
 * A line that cannot wait, such as a failure that may end the app, is
 * written at once with what is held. A file that cannot be written is
 * dropped: keeping a trace never stops the app.
 *
 * @example
 * ```typescript
 * const lines = chunkedLines({ writeChunk: (name, text) => new File(folder, name).write(text) })
 * attachDevelopmentTelemetry(handle, { app: 'books', isDevelopment: true, write: lines.write })
 * ```
 */
export const chunkedLines = (
  options: Readonly<{
    writeChunk: (name: string, text: string) => void
    everyMs?: number
    now?: () => Date
    setTimer?: (run: () => void, afterMs: number) => void
  }>,
): ChunkedLines => {
  const everyMs = options.everyMs ?? defaultEveryMs
  const now = options.now ?? (() => new Date())
  const setTimer =
    options.setTimer ??
    ((run: () => void, afterMs: number): void => {
      setTimeout(run, afterMs)
    })
  const state = { held: new Array<string>(), written: 0, isTimerSet: false }

  const flush = (): void => {
    state.isTimerSet = false
    if (state.held.length === 0) {
      return
    }
    const text = `${state.held.join('\n')}\n`
    state.held = []
    state.written += 1
    try {
      options.writeChunk(chunkNameOf(now(), state.written), text)
    } catch {
      // NOTE: keeping a trace never stops the app.
    }
  }

  return {
    write: line => {
      state.held.push(line)
      if (!state.isTimerSet) {
        state.isTimerSet = true
        setTimer(flush, everyMs)
      }
    },
    writeNow: line => {
      state.held.push(line)
      flush()
    },
  }
}
