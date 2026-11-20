import { Array, Match as M, Option, Schema as S, String } from 'effect'

import { ts } from '../schema/index.js'

// NOTE: this is the one place that decides how fast input reaches the log.
// A Message says, once, how it syncs; this device's Model always takes it
// at once. The waits here are pure: whoever writes the log supplies the
// clock and asks `due`, so no painter and no widget holds a timer.

// SYNC

/** An ordinary Message: written to the log as it happens. The default. */
export const Synced = ts('Synced')

/**
 * A Message of input that comes in bursts, such as a keystroke: the log
 * gets the newest one `afterMs` after the last, `Settled({ afterMs: 200 })`
 * for typing. It never waits for the field to be left.
 */
export const Settled = ts('Settled', { afterMs: S.Number })

/**
 * A Message of input with no steps to it, such as a free drag: the log
 * gets the first at once and then the newest at most once every `everyMs`,
 * `Sampled({ everyMs: 50 })` for twenty a second.
 */
export const Sampled = ts('Sampled', { everyMs: S.Number })

/**
 * Why a Message stays on the device that sent it. This is the whole
 * list; anything else syncs.
 *
 * - `Secret`: it holds a secret or a sign-in address.
 * - `AboutThisDevice`: a fact about this device, such as the update it
 *   runs, whether the system is light or dark, its size, or whether its
 *   keyboard is up.
 * - `OwnChoice`: a choice made for this device, such as its appearance.
 * - `OwnView`: what one person is looking at here, such as a search of
 *   the page, or reading away from the voice.
 * - `DeviceEffect`: something done to this device alone, such as a copy
 *   to its clipboard.
 * - `InputInProgress`: a touch, a hover or a keystroke that has not
 *   become anything yet.
 */
export const DeviceReason = S.Literals([
  'Secret',
  'AboutThisDevice',
  'OwnChoice',
  'OwnView',
  'DeviceEffect',
  'InputInProgress',
])
/** Why a Message stays on the device that sent it. */
export type DeviceReason = typeof DeviceReason.Type

/**
 * A Message that is never written to the log, with the reason:
 * `Device({ because: 'InputInProgress' })` for a finger going down.
 */
export const Device = ts('Device', { because: DeviceReason })

/**
 * How one Message syncs, declared once beside the Message. Everything
 * syncs unless it says `Device`.
 *
 * @example
 * ```typescript
 * const typed: Sync = Settled({ afterMs: 200 })
 * const pressedDown: Sync = Device({ because: 'InputInProgress' })
 * ```
 */
export const Sync = S.Union([Synced, Settled, Sampled, Device])
/** How one Message syncs. */
export type Sync = typeof Sync.Type

/**
 * Whether a Message reaches the log at all, at once or after a wait.
 *
 * @example
 * ```typescript
 * isSynced(Settled({ afterMs: 200 })) // true
 * isSynced(Device({ because: 'Secret' })) // false
 * ```
 */
export const isSynced = (sync: Sync): boolean => sync._tag !== 'Device'

// GRAIN

/**
 * A drag that moves in steps of `size` counted from `origin`: a slider
 * from 3 in fives is `Step({ size: 5, origin: 3 })`, a seek bar's whole
 * second `Step({ size: 1000, origin: 0 })`.
 */
export const Step = ts('Step', { size: S.Number, origin: S.Number })

/** A drag with no steps to it, such as a shape moved across a canvas. */
export const Free = ts('Free')

/**
 * The grain a drag syncs at: the steps the screen shows, or none.
 *
 * @example
 * ```typescript
 * const seek: Grain = Step({ size: 1000, origin: 0 })
 * ```
 */
export const Grain = S.Union([Step, Free])
/** The grain a drag syncs at. */
export type Grain = typeof Grain.Type

/**
 * How quickly a part's input syncs, set in the part's configuration:
 * how long typing rests before it is written, the grain of a drag, and
 * how often a free drag is written.
 *
 * @example
 * ```typescript
 * const coarse: Pace = { ...defaultPace, dragGrain: Step({ size: 10, origin: 0 }) }
 * ```
 */
export const Pace = S.Struct({
  typingSettleMs: S.Number,
  dragGrain: Grain,
  dragSampleMs: S.Number,
})
/** How quickly a part's input syncs. */
export type Pace = typeof Pace.Type

/**
 * The pace of a part that sets none, the quick end: typing is written 200
 * ms after the last keystroke, and a drag is told at every step of 1 and
 * written twenty times a second at most.
 */
export const defaultPace: Pace = {
  typingSettleMs: 200,
  dragGrain: Step({ size: 1, origin: 0 }),
  dragSampleMs: 50,
}

// NOTE: a count of steps is found by division, and a quotient such as
// 0.3 / 0.1 lands a hair under the whole number it means. This much is
// forgiven before the count is floored.
const stepSlack = 1e-9

const decimalsOf = (size: number): number => {
  const text = size.toString()
  return Option.match(String.indexOf('.')(text), {
    onNone: () => 0,
    onSome: index => text.length - index - 1,
  })
}

/**
 * The value a drag should tell for a sample a painter measured, or none
 * when the sample is still on the step last told. `toldValue` is the value
 * the screen last painted, so a painter keeps nothing between samples.
 *
 * @example
 * ```typescript
 * told(Step({ size: 5, origin: 0 }), 0, 4) // None
 * told(Step({ size: 5, origin: 0 }), 0, 7) // Some(5)
 * told(Step({ size: 5, origin: 3 }), 3, 9) // Some(8)
 * told(Free(), 3, 4.5) // Some(4.5)
 * ```
 */
export const told = (
  grain: Grain,
  toldValue: number,
  sample: number,
): Option.Option<number> => {
  const value = M.value(grain).pipe(
    M.withReturnType<number>(),
    M.tagsExhaustive({
      Step: ({ size, origin }) => {
        const steps = Math.floor((sample - origin) / size + stepSlack)
        return Number((origin + steps * size).toFixed(decimalsOf(size)))
      },
      Free: () => sample,
    }),
  )
  return value === toldValue ? Option.none() : Option.some(value)
}

/**
 * The slot a dragged row should tell it is over, or none when it is still
 * over the slot last told.
 *
 * @example
 * ```typescript
 * slotTold(Option.some('first'), 'first') // None
 * slotTold(Option.some('first'), 'second') // Some('second')
 * ```
 */
export const slotTold = (
  maybeToldSlot: Option.Option<string>,
  over: string,
): Option.Option<string> =>
  Option.contains(maybeToldSlot, over) ? Option.none() : Option.some(over)

// QUEUE

const Waiting = S.Struct({
  part: S.String,
  key: S.String,
  sync: S.Union([Settled, Sampled]),
  arrivedAtMs: S.Number,
})
type Waiting = typeof Waiting.Type

const Written = S.Struct({ key: S.String, atMs: S.Number })

/**
 * What a writer of the log holds between looks: the newest Message of
 * each kind that waits, and when each sampled kind was last written.
 *
 * @example
 * ```typescript
 * const writer = { queue: Pace.empty }
 * ```
 */
export const Queue = S.Struct({
  waiting: S.Array(Waiting),
  written: S.Array(Written),
})
/** What a writer of the log holds between looks. */
export type Queue = typeof Queue.Type

/** A writer with nothing waiting. */
export const empty: Queue = { waiting: [], written: [] }

/**
 * What a look at the queue answers: the queue after it, the keys to write
 * now, in order, and when to look again while something still waits.
 */
export type Looked = Readonly<{
  queue: Queue
  write: ReadonlyArray<string>
  maybeNextAtMs: Option.Option<number>
}>

const lastWrittenAt = (queue: Queue, key: string): Option.Option<number> =>
  Option.map(
    Array.findFirst(queue.written, written => written.key === key),
    written => written.atMs,
  )

const dueAtOf = (queue: Queue, waiting: Waiting): number =>
  M.value(waiting.sync).pipe(
    M.withReturnType<number>(),
    M.tagsExhaustive({
      Settled: ({ afterMs }) => waiting.arrivedAtMs + afterMs,
      Sampled: ({ everyMs }) =>
        Option.match(lastWrittenAt(queue, waiting.key), {
          onNone: () => waiting.arrivedAtMs,
          onSome: atMs => atMs + everyMs,
        }),
    }),
  )

const withWritten = (
  queue: Queue,
  keys: ReadonlyArray<string>,
  atMs: number,
): Queue => ({
  waiting: Array.filter(
    queue.waiting,
    waiting => !Array.contains(keys, waiting.key),
  ),
  written: [
    ...Array.filter(
      queue.written,
      written => !Array.contains(keys, written.key),
    ),
    ...Array.map(keys, key => ({ key, atMs })),
  ],
})

const nextAtOf = (queue: Queue): Option.Option<number> =>
  Array.match(queue.waiting, {
    onEmpty: () => Option.none(),
    onNonEmpty: waiting =>
      Option.some(
        Math.min(...Array.map(waiting, each => dueAtOf(queue, each))),
      ),
  })

/**
 * Which waiting Messages to write at `nowMs`: each settled one whose rest
 * is over, and each sampled one whose interval has passed.
 *
 * @example
 * ```typescript
 * const { queue } = arrived(empty, { part: 'Search', key: 'Search.Typed', sync: Settled({ afterMs: 200 }), atMs: 1000 })
 * due(queue, 1050) // { write: [], maybeNextAtMs: Some(1200), ... }
 * due(queue, 1200) // { write: ['Search.Typed'], maybeNextAtMs: None, ... }
 * ```
 */
export const due = (queue: Queue, nowMs: number): Looked => {
  const write = Array.map(
    Array.filter(queue.waiting, waiting => dueAtOf(queue, waiting) <= nowMs),
    waiting => waiting.key,
  )
  const nextQueue = withWritten(queue, write, nowMs)
  return { queue: nextQueue, write, maybeNextAtMs: nextAtOf(nextQueue) }
}

const waitingWith = (queue: Queue, waiting: Waiting): Queue => ({
  ...queue,
  waiting: [
    ...Array.filter(queue.waiting, each => each.key !== waiting.key),
    waiting,
  ],
})

/**
 * What the writer does when a Message arrives at `atMs`. A synced one is
 * written at once, after every Message that still waits, whatever its
 * part, so the log never holds a keystroke after the Send that read it. A
 * settled one waits, in place of an older one of its kind. A sampled one
 * is written at once when its interval has passed, and waits otherwise. A
 * device one is never written.
 *
 * @example
 * ```typescript
 * arrived(empty, { part: 'Search', key: 'Search.Typed', sync: Settled({ afterMs: 200 }), atMs: 0 }).write
 * // []
 * arrived(queueWithTyping, { part: 'Search', key: 'Search.Submitted', sync: Synced(), atMs: 50 }).write
 * // ['Search.Typed', 'Search.Submitted']
 * ```
 */
export const arrived = (
  queue: Queue,
  arrival: Readonly<{ part: string; key: string; sync: Sync; atMs: number }>,
): Looked => {
  const { part, key, atMs } = arrival
  return M.value(arrival.sync).pipe(
    M.withReturnType<Looked>(),
    M.tagsExhaustive({
      Device: () => ({ queue, write: [], maybeNextAtMs: nextAtOf(queue) }),
      Synced: () => {
        const flushed = Array.map(queue.waiting, waiting => waiting.key)
        const nextQueue = withWritten(queue, flushed, atMs)
        return {
          queue: nextQueue,
          write: [...flushed, key],
          maybeNextAtMs: nextAtOf(nextQueue),
        }
      },
      Settled: sync => {
        const nextQueue = waitingWith(queue, {
          part,
          key,
          sync,
          arrivedAtMs: atMs,
        })
        return {
          queue: nextQueue,
          write: [],
          maybeNextAtMs: nextAtOf(nextQueue),
        }
      },
      Sampled: sync => {
        const waiting: Waiting = { part, key, sync, arrivedAtMs: atMs }
        if (dueAtOf(queue, waiting) <= atMs) {
          const nextQueue = withWritten(queue, [key], atMs)
          return {
            queue: nextQueue,
            write: [key],
            maybeNextAtMs: nextAtOf(nextQueue),
          }
        } else {
          const nextQueue = waitingWith(queue, waiting)
          return {
            queue: nextQueue,
            write: [],
            maybeNextAtMs: nextAtOf(nextQueue),
          }
        }
      },
    }),
  )
}
