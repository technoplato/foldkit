import { Array } from 'effect'

// STALLS

/**
 * One thing a screen laid out: the part of the app, as a
 * `PaintedPart` names it, how long it took from its render to its
 * commit when that was timed, and how many passages or rows it had, when
 * it is a reader or a list.
 */
export type LaidOut = Readonly<{
  part: string
  ms?: number
  passages?: number
  rows?: number
}>

/** A watch for the JavaScript thread being held. */
export type StallWatch = Readonly<{
  /** Takes note of something being laid out now. */
  noteLaidOut: (entry: LaidOut) => void
  /** Ends the watch. */
  stop: () => void
}>

const defaultEveryMs = 200

const defaultAtLeastMs = 400

const defaultAsleepMs = 20_000

const maximumNoted = 200

type Summed = Readonly<{
  part: string
  times: number
  ms?: number
  passages?: number
  rows?: number
}>

const nothingSummed: ReadonlyArray<Summed> = []

const withMs = (
  maybeBefore: number | undefined,
  maybeMore: number | undefined,
): Readonly<{ ms?: number }> =>
  maybeBefore === undefined && maybeMore === undefined
    ? {}
    : { ms: (maybeBefore ?? 0) + (maybeMore ?? 0) }

const summed = (noted: ReadonlyArray<LaidOut>): ReadonlyArray<Summed> =>
  Array.reduce(noted, nothingSummed, (sums, entry) => {
    const counts = {
      ...(entry.passages === undefined ? {} : { passages: entry.passages }),
      ...(entry.rows === undefined ? {} : { rows: entry.rows }),
    }
    return Array.some(sums, sum => sum.part === entry.part)
      ? Array.map(sums, sum =>
          sum.part === entry.part
            ? {
                part: sum.part,
                times: sum.times + 1,
                ...withMs(sum.ms, entry.ms),
                ...(sum.passages === undefined
                  ? {}
                  : { passages: sum.passages }),
                ...(sum.rows === undefined ? {} : { rows: sum.rows }),
                ...counts,
              }
            : sum,
        )
      : [
          ...sums,
          {
            part: entry.part,
            times: 1,
            ...withMs(undefined, entry.ms),
            ...counts,
          },
        ]
  })

/**
 * Watches for the JavaScript thread of a phone app being held: a timer
 * is set every `everyMs`, and when it fires `atLeastMs` or more after it
 * was due, the thread was held that long. `say` is given how long, and
 * what the app laid out meanwhile, as `noteLaidOut` heard it: which
 * parts, how many times, with how many passages or rows. So a trace
 * names each freeze a person feels, in a build that cannot time its
 * paints. A timer later than `asleepMs` is the app asleep in the
 * background, not a stall, and is not said.
 *
 * It sees the JavaScript thread only: what holds the thread the screen
 * is drawn on is for a profiler.
 *
 * @example
 * ```typescript
 * attachDevelopmentTelemetry(handle, {
 *   app: 'books',
 *   laterNotes: say => {
 *     const stalls = stallWatch({ say })
 *   },
 * })
 * ```
 */
export const stallWatch = (
  options: Readonly<{
    say: (note: Readonly<Record<string, unknown>>) => void
    everyMs?: number
    atLeastMs?: number
    asleepMs?: number
    now?: () => number
    setTimer?: (run: () => void, afterMs: number) => void
  }>,
): StallWatch => {
  const everyMs = options.everyMs ?? defaultEveryMs
  const atLeastMs = options.atLeastMs ?? defaultAtLeastMs
  const asleepMs = options.asleepMs ?? defaultAsleepMs
  const now = options.now ?? Date.now
  const setTimer =
    options.setTimer ??
    ((run: () => void, afterMs: number): void => {
      setTimeout(run, afterMs)
    })
  const state: { noted: ReadonlyArray<LaidOut>; isStopped: boolean } = {
    noted: [],
    isStopped: false,
  }
  const wait = (): void => {
    const dueAt = now() + everyMs
    setTimer(() => {
      if (state.isStopped) {
        return
      }
      const heldMs = now() - dueAt
      if (heldMs >= atLeastMs && heldMs < asleepMs) {
        options.say({
          stall: {
            heldMs: Math.round(heldMs),
            laidOut: Array.map(summed(state.noted), sum =>
              sum.ms === undefined ? sum : { ...sum, ms: Math.round(sum.ms) },
            ),
          },
        })
      }
      state.noted = []
      wait()
    }, everyMs)
  }
  wait()
  return {
    noteLaidOut: entry => {
      if (state.noted.length < maximumNoted) {
        state.noted = [...state.noted, entry]
      }
    },
    stop: () => {
      state.isStopped = true
    },
  }
}
