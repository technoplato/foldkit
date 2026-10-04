import {
  Duration,
  Effect,
  Layer,
  Option,
  Predicate,
  Queue,
  Schema as S,
  Stream,
} from 'effect'
import { watch } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { Readings } from './model.js'
import { ReadingSource, ReadingSourceError, ReadingsJson } from './reading.js'
import {
  readingsOfRows,
  recognitionRowsOf,
  rowsOfLines,
  thingRowsOf,
} from './scribe.js'

// LOCAL

/** Scribe's log of things, such as books, in its folder. */
export const thingsFileName = 'things.jsonl'

/** Scribe's log of recognitions, such as a book being read, in its folder. */
export const recognitionsFileName = 'recognitions.jsonl'

/** Where Scribe keeps its logs on this laptop: `~/Scribe/things`. */
export const defaultThingsDirectory = (): string =>
  join(homedir(), 'Scribe', 'things')

const isMissingFile = (error: unknown): boolean =>
  Predicate.hasProperty(error, 'code') && error.code === 'ENOENT'

const textOf = (path: string): Effect.Effect<string, ReadingSourceError> =>
  Effect.tryPromise({
    try: () =>
      readFile(path, 'utf8').catch((error: unknown) =>
        isMissingFile(error) ? '' : Promise.reject(error),
      ),
    catch: () =>
      new ReadingSourceError({
        reason: `Scribe's log ${path} could not be read`,
      }),
  })

/**
 * The readings in Scribe's logs in `directory` right now. A log that does
 * not exist yet reads as empty.
 *
 * @example
 * ```typescript
 * await Effect.runPromise(readingsOfDirectory('/Users/me/Scribe/things'))
 * // { books: [Little Blue Truck Feeling Happy], turns: [page 4, page 3, ...] }
 * ```
 */
export const readingsOfDirectory = (
  directory: string,
): Effect.Effect<Readings, ReadingSourceError> =>
  Effect.map(
    Effect.all([
      textOf(join(directory, thingsFileName)),
      textOf(join(directory, recognitionsFileName)),
    ]),
    ([things, recognitions]) =>
      readingsOfRows(
        thingRowsOf(rowsOfLines(things)),
        recognitionRowsOf(rowsOfLines(recognitions)),
      ),
  )

const settleMs = 40

const rewatchMs = 1_000

const rereadMs = 2_000

/**
 * One watch of one log: a signal now, and one per write, until the file is
 * replaced or removed. It ends at once when the file is not there yet.
 */
const watchedOnce = (path: string): Stream.Stream<void> =>
  Stream.callback<void>(queue =>
    Effect.acquireRelease(
      Effect.option(
        Effect.try({
          try: () => {
            const watcher = watch(path, event => {
              Queue.offerUnsafe(queue, undefined)
              if (event === 'rename') {
                Queue.endUnsafe(queue)
              }
            })
            watcher.on('error', () => {
              Queue.endUnsafe(queue)
            })
            return watcher
          },
          catch: () => new ReadingSourceError({ reason: `${path} is missing` }),
        }),
      ),
      maybeWatcher =>
        Effect.sync(() => {
          if (Option.isSome(maybeWatcher)) {
            maybeWatcher.value.close()
          }
        }),
    ).pipe(
      Effect.tap(maybeWatcher =>
        Effect.sync(() => {
          if (Option.isSome(maybeWatcher)) {
            Queue.offerUnsafe(queue, undefined)
          } else {
            Queue.endUnsafe(queue)
          }
        }),
      ),
    ),
  )

/**
 * Every write to one log, watched again a second after the file is
 * replaced, removed, or not there yet.
 */
const writesTo = (path: string): Stream.Stream<void> =>
  Stream.forever(
    Stream.concat(
      watchedOnce(path),
      Stream.fromEffectDrain(Effect.sleep(Duration.millis(rewatchMs))),
    ),
  )

/**
 * A signal for each write to either log, watching each file, since a
 * folder watch on macOS misses writes and lags by up to a second and a
 * half, and every two seconds besides, so a write no watch saw still
 * arrives.
 */
const changesIn = (directory: string): Stream.Stream<void> =>
  Stream.mergeAll(
    [
      writesTo(join(directory, thingsFileName)),
      writesTo(join(directory, recognitionsFileName)),
      Stream.tick(Duration.millis(rereadMs)),
    ],
    { concurrency: 'unbounded' },
  ).pipe(Stream.debounce(Duration.millis(settleMs)))

const encodeReadings = S.encodeSync(ReadingsJson)

/**
 * The readings in Scribe's logs in `directory`, now and again each time
 * Scribe writes either log, a few milliseconds after the write settles,
 * or at most two seconds later when no watch saw it. Rereads that change
 * nothing send nothing.
 */
export const watchedReadings = (
  directory: string,
): Stream.Stream<Readings, ReadingSourceError> =>
  Stream.concat(Stream.make(undefined), changesIn(directory)).pipe(
    Stream.mapEffect(() => readingsOfDirectory(directory)),
    Stream.map(readings => ({ readings, text: encodeReadings(readings) })),
    Stream.changesWith((self, that) => self.text === that.text),
    Stream.map(({ readings }) => readings),
  )

/**
 * A reading source over Scribe's logs on this machine: what a terminal and
 * the dev endpoint read. It never writes them.
 *
 * @example
 * ```typescript
 * Layer.mergeAll(localReadingSource(), fetchPreviewSource)
 * ```
 */
export const localReadingSource = (
  directory: string = defaultThingsDirectory(),
): Layer.Layer<ReadingSource> =>
  Layer.succeed(ReadingSource, { readings: watchedReadings(directory) })
