import {
  Array,
  Context,
  Effect,
  Layer,
  Option,
  Predicate,
  type Scope,
  Semaphore,
} from 'effect'

import type { TelemetryEvent, TelemetryName } from './event.js'

/**
 * The app and host a sink writes for, such as `books` on `react`. A file
 * sink names its file from them, `books-react.ndjson`, and a browser sink
 * sends them with every batch. Telemetry provides it to the sink Layer it
 * builds, from its own options.
 */
export class TelemetryOrigin extends Context.Service<
  TelemetryOrigin,
  Readonly<{ app: TelemetryName; host: TelemetryName }>
>()('@foldkit/TelemetryOrigin') {}

/**
 * Where telemetry events go. `offer` takes one event without blocking
 * and never fails, so recording costs a dispatch almost nothing; the sink
 * writes what it holds later, in order. `flush` completes once everything
 * offered before it has been written.
 *
 * A sink is a scoped Layer: building it acquires what it writes with, such
 * as a file handle, and closing its Scope writes what is left and releases
 * it. Telemetry builds the sink in the Scope of the Program it observes,
 * so stopping the Program flushes the sink.
 *
 * @example
 * ```typescript
 * const printSink = Layer.succeed(TelemetrySink, {
 *   offer: event => console.log(encodeLine(event)),
 *   flush: Effect.void,
 * })
 * ```
 */
export class TelemetrySink extends Context.Service<
  TelemetrySink,
  Readonly<{
    offer: (event: TelemetryEvent) => void
    flush: Effect.Effect<void>
  }>
>()('@foldkit/TelemetrySink') {}

/** A Layer that builds one {@link TelemetrySink} for one {@link TelemetryOrigin}. */
export type TelemetrySinkLayer = Layer.Layer<
  TelemetrySink,
  never,
  TelemetryOrigin
>

/**
 * When a buffered sink writes: `flushIntervalMs` after an event starts
 * waiting, on the next task once `maximumBatchEvents` are waiting, and
 * never holding more than `maximumBufferedEvents`, past which it drops new
 * events.
 */
export type TelemetryBatching = Readonly<{
  flushIntervalMs: number
  maximumBatchEvents: number
  maximumBufferedEvents: number
}>

/** How long a buffered sink waits after an event before it writes, in ms. */
export const defaultFlushIntervalMs = 500

/** How many waiting events make a buffered sink write at once. */
export const defaultMaximumBatchEvents = 500

/** How many events a buffered sink holds before it drops new ones. */
export const defaultMaximumBufferedEvents = 10_000

/** The batching every built-in sink uses unless told otherwise. */
export const defaultTelemetryBatching: TelemetryBatching = {
  flushIntervalMs: defaultFlushIntervalMs,
  maximumBatchEvents: defaultMaximumBatchEvents,
  maximumBufferedEvents: defaultMaximumBufferedEvents,
}

const unrefTimer = (timer: unknown): void => {
  if (
    Predicate.hasProperty(timer, 'unref') &&
    Predicate.isFunction(timer.unref)
  ) {
    timer.unref()
  }
}

/**
 * A {@link TelemetrySink} that holds events before it writes them.
 * `takeWaiting` removes and returns every event not yet passed to its
 * writer, synchronously, for a last chance such as a page being hidden.
 */
export type BufferedSink = typeof TelemetrySink.Service &
  Readonly<{ takeWaiting: () => ReadonlyArray<TelemetryEvent> }>

/**
 * Makes a sink that holds offered events in memory and passes them to
 * `write` in order, one batch at a time, as {@link TelemetryBatching}
 * says, and once more when its Scope closes. Writes never overlap, so a
 * batch never reaches `write` before the batch offered ahead of it.
 * `offer` never writes itself: even a full batch is written on a later
 * task, so encoding never runs inside a dispatch. On Node its timer never
 * keeps a process alive on its own.
 *
 * @example
 * ```typescript
 * const sink = yield* makeBufferedSink(events =>
 *   Effect.sync(() => console.log(events.length)),
 * )
 * sink.offer(event)
 * yield* sink.flush
 * ```
 */
export const makeBufferedSink = (
  write: (events: ReadonlyArray<TelemetryEvent>) => Effect.Effect<void>,
  batching: TelemetryBatching = defaultTelemetryBatching,
): Effect.Effect<BufferedSink, never, Scope.Scope> =>
  Effect.gen(function* () {
    const runFork = Effect.runForkWith(yield* Effect.context<never>())
    const writing = yield* Semaphore.make(1)
    let buffer: Array<TelemetryEvent> = []
    let maybeTimer = Option.none<ReturnType<typeof setTimeout>>()
    let isClosed = false
    let isDropping = false

    const flush: Effect.Effect<void> = writing.withPermit(
      Effect.suspend(() => {
        if (Array.isArrayEmpty(buffer)) {
          return Effect.void
        }
        const events = buffer
        buffer = []
        return write(events)
      }),
    )

    const cancelTimer = (): void => {
      if (Option.isSome(maybeTimer)) {
        clearTimeout(maybeTimer.value)
        maybeTimer = Option.none()
      }
    }

    const scheduleFlush = (delayMs: number): void => {
      if (Option.isSome(maybeTimer)) {
        return
      }
      const timer = setTimeout(() => {
        maybeTimer = Option.none()
        runFork(flush)
      }, delayMs)
      unrefTimer(timer)
      maybeTimer = Option.some(timer)
    }

    const offer = (event: TelemetryEvent): void => {
      if (isClosed) {
        return
      }
      if (buffer.length >= batching.maximumBufferedEvents) {
        if (!isDropping) {
          isDropping = true
          console.warn(
            `[foldkit] Telemetry is dropping events: ${batching.maximumBufferedEvents} are waiting to be written.`,
          )
        }
        return
      }
      isDropping = false
      buffer.push(event)
      if (buffer.length === batching.maximumBatchEvents) {
        cancelTimer()
        scheduleFlush(0)
      } else {
        scheduleFlush(batching.flushIntervalMs)
      }
    }

    const takeWaiting = (): ReadonlyArray<TelemetryEvent> => {
      cancelTimer()
      const events = buffer
      buffer = []
      return events
    }

    yield* Effect.addFinalizer(() =>
      Effect.suspend(() => {
        isClosed = true
        cancelTimer()
        return flush
      }),
    )

    return { offer, flush, takeWaiting }
  })

/**
 * A sink that keeps every event in memory, for tests and for reading
 * telemetry in-process. `events` returns what it has recorded so far.
 *
 * @example
 * ```typescript
 * const memory = makeMemorySink()
 * Telemetry.attach(handle, { app: 'books', sink: memory.layer })
 * memory.events().map(event => event._tag) // ['SessionStarted', 'Transition', …]
 * ```
 */
export const makeMemorySink = (): Readonly<{
  layer: Layer.Layer<TelemetrySink>
  events: () => ReadonlyArray<TelemetryEvent>
}> => {
  const recorded: Array<TelemetryEvent> = []
  return {
    layer: Layer.succeed(TelemetrySink, {
      offer: event => {
        recorded.push(event)
      },
      flush: Effect.void,
    }),
    events: () => Array.copy(recorded),
  }
}
