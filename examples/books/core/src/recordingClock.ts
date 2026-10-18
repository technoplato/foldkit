import { Array, Match as M, Option, Order, Schema as S, pipe } from 'effect'
import { ts } from 'foldkit/schema'

// RECORDING CLOCK

/**
 * One stretch where a Scribe recording's clock waited: a pause, the
 * microphone held by another app, a capture restart, the app closed. It
 * begins at a recording-clock offset and lasts from one wall time to
 * another; an open one has no end yet. Read from the recording's
 * `captureGapsJSON` (ADR 0034).
 */
export const CaptureGap = S.Struct({
  offsetSeconds: S.Number,
  startedAtMs: S.Number,
  maybeEndedAtMs: S.Option(S.Number),
})
/** One stretch where a recording's clock waited. */
export type CaptureGap = typeof CaptureGap.Type

/**
 * A recording's clock against the wall clock: the wall time of offset 0,
 * and the gaps where the clock waited. The YouTube companion's
 * `RecordingClock` and Scribe Videos' port of it, case for case, so a book
 * Books played lands on the recording's clock where a video would.
 */
export const RecordingClock = S.Struct({
  startedAtMs: S.Number,
  gaps: S.Array(CaptureGap),
})
/** A recording's clock against the wall clock. */
export type RecordingClock = typeof RecordingClock.Type

/** The wall time is before the recording began. */
export const Before = ts('Before')
/** The recording's clock ran at the wall time, and read `offsetSeconds`. */
export const Running = ts('Running', { offsetSeconds: S.Number })
/** The wall time is inside a gap: the clock stood at the gap's offset. */
export const Waiting = ts('Waiting', {
  offsetSeconds: S.Number,
  gapStartedAtMs: S.Number,
})
/** Where a wall time falls on a recording's clock. */
export const ClockPosition = S.Union([Before, Running, Waiting])
/** Where a wall time falls on a recording's clock. */
export type ClockPosition = typeof ClockPosition.Type

/**
 * A wall-clock stretch during which the recording's clock ran, in both
 * clocks: from and to by the wall clock, and the recording's seconds at
 * each end.
 */
export type RunningPart = Readonly<{
  fromMs: number
  toMs: number
  startSeconds: number
  endSeconds: number
}>

const byStart = Order.mapInput(
  Order.Number,
  (gap: CaptureGap) => gap.startedAtMs,
)

/**
 * The gaps in time order, one per start: a recording writes a gap when it
 * opens and again when it closes, and the closed record wins.
 *
 * @example
 * ```typescript
 * normalizedGaps([open, closed]) // [closed], both starting at 29.2 s
 * ```
 */
export const normalizedGaps = (
  gaps: ReadonlyArray<CaptureGap>,
): ReadonlyArray<CaptureGap> =>
  pipe(
    gaps,
    Array.filter(
      gap =>
        Number.isFinite(gap.offsetSeconds) && Number.isFinite(gap.startedAtMs),
    ),
    Array.reduce(new Map<number, CaptureGap>(), (known, gap) => {
      const isNewer = Option.match(
        Option.fromNullishOr(known.get(gap.startedAtMs)),
        {
          onNone: () => true,
          onSome: earlier =>
            Option.isNone(earlier.maybeEndedAtMs) &&
            Option.isSome(gap.maybeEndedAtMs),
        },
      )
      return isNewer ? new Map(known).set(gap.startedAtMs, gap) : known
    }),
    known => Array.fromIterable(known.values()),
    Array.sort(byStart),
  )

/**
 * The wall time of a recording-clock offset: from the last gap that closed
 * below it, else the start plus the offset.
 *
 * @example
 * ```typescript
 * wallClockMsAt({ startedAtMs: 1_000_000, gaps: [] }, 10) // 1_010_000
 * ```
 */
export const wallClockMsAt = (
  clock: RecordingClock,
  offsetSeconds: number,
): number =>
  Option.match(
    Array.findLast(
      normalizedGaps(clock.gaps),
      gap =>
        Option.isSome(gap.maybeEndedAtMs) && gap.offsetSeconds < offsetSeconds,
    ),
    {
      onNone: () => clock.startedAtMs + offsetSeconds * 1000,
      onSome: resume =>
        Option.getOrElse(resume.maybeEndedAtMs, () => clock.startedAtMs) +
        Math.max(0, offsetSeconds - resume.offsetSeconds) * 1000,
    },
  )

/**
 * Where a wall time falls on a recording's clock: before it began, while
 * it ran, or inside a gap.
 *
 * @example
 * ```typescript
 * positionAt({ startedAtMs: 1_000_000, gaps: [] }, 1_010_000) // Running({ offsetSeconds: 10 })
 * ```
 */
export const positionAt = (
  clock: RecordingClock,
  wallMs: number,
): ClockPosition => {
  if (wallMs < clock.startedAtMs) {
    return Before()
  } else {
    return Option.match(
      Array.findLast(
        normalizedGaps(clock.gaps),
        gap => gap.startedAtMs <= wallMs,
      ),
      {
        onNone: () =>
          Running({ offsetSeconds: (wallMs - clock.startedAtMs) / 1000 }),
        onSome: last =>
          Option.match(
            Option.filter(
              last.maybeEndedAtMs,
              endedAtMs => wallMs >= endedAtMs,
            ),
            {
              onNone: () =>
                Waiting({
                  offsetSeconds: last.offsetSeconds,
                  gapStartedAtMs: last.startedAtMs,
                }),
              onSome: resumedAtMs =>
                Running({
                  offsetSeconds:
                    last.offsetSeconds + (wallMs - resumedAtMs) / 1000,
                }),
            },
          ),
      },
    )
  }
}

type Cut = Readonly<{ fromMs: number; toMs: number }>

type Cutting = Readonly<{ cuts: ReadonlyArray<Cut>; cursorMs: number }>

const cutsOf = (
  clock: RecordingClock,
  fromMs: number,
  toMs: number,
): ReadonlyArray<Cut> => {
  const initial: Cutting = {
    cuts: [],
    cursorMs: Math.max(fromMs, clock.startedAtMs),
  }
  const { cuts, cursorMs } = Array.reduce(
    normalizedGaps(clock.gaps),
    initial,
    (cutting, gap): Cutting => {
      const gapEndMs = Option.getOrElse(
        gap.maybeEndedAtMs,
        () => Number.POSITIVE_INFINITY,
      )
      if (
        cutting.cursorMs >= toMs ||
        gapEndMs <= cutting.cursorMs ||
        gap.startedAtMs >= toMs
      ) {
        return cutting
      } else {
        const before =
          gap.startedAtMs > cutting.cursorMs
            ? [
                {
                  fromMs: cutting.cursorMs,
                  toMs: Math.min(gap.startedAtMs, toMs),
                },
              ]
            : []
        return {
          cuts: [...cutting.cuts, ...before],
          cursorMs: Math.max(cutting.cursorMs, gapEndMs),
        }
      }
    },
  )
  return cursorMs < toMs ? [...cuts, { fromMs: cursorMs, toMs }] : cuts
}

const runningPartOf = (
  clock: RecordingClock,
  cut: Cut,
): Option.Option<RunningPart> => {
  const start = positionAt(clock, cut.fromMs)
  const end = positionAt(clock, cut.toMs - 1)
  return start._tag === 'Running'
    ? M.value(end).pipe(
        M.withReturnType<Option.Option<RunningPart>>(),
        M.tagsExhaustive({
          Before: () => Option.none(),
          Running: ({ offsetSeconds }) =>
            Option.some({
              ...cut,
              startSeconds: start.offsetSeconds,
              endSeconds: offsetSeconds + 0.001,
            }),
          Waiting: ({ offsetSeconds }) =>
            Option.some({
              ...cut,
              startSeconds: start.offsetSeconds,
              endSeconds: offsetSeconds,
            }),
        }),
      )
    : Option.none()
}

/**
 * The parts of a wall-clock stretch during which the recording's clock
 * ran, each as a range of the recording's seconds. A stretch that crosses a
 * gap becomes two parts, one on each side, so a book heard across a pause
 * in the recording keeps the recording's own seconds. A part's end maps the
 * moment just before it, since a gap that begins exactly at the end would
 * otherwise read the end as waiting.
 *
 * @example
 * ```typescript
 * runningPartsOf(clock, fromMs, toMs) // [{ startSeconds: 60, endSeconds: 100, … }, { startSeconds: 100, endSeconds: 130, … }]
 * ```
 */
export const runningPartsOf = (
  clock: RecordingClock,
  fromMs: number,
  toMs: number,
): ReadonlyArray<RunningPart> =>
  toMs > fromMs
    ? Array.getSomes(
        Array.map(cutsOf(clock, fromMs, toMs), cut =>
          runningPartOf(clock, cut),
        ),
      )
    : []

const GapRow = S.Struct({
  offsetSeconds: S.Number,
  startedAtMs: S.Number,
  endedAtMs: S.optionalKey(S.NullOr(S.Number)),
})

const GapRows = S.fromJsonString(S.Array(S.Unknown))

/**
 * The gaps in a recording's `captureGapsJSON`
 * (`[{cause, endedAtMs?, holder?, id, offsetSeconds, startedAtMs}]`). A
 * gap that does not read is left out, and a value that does not read is no
 * gaps: the stretch still lands, at the clock's plain offsets.
 *
 * @example
 * ```typescript
 * gapsOfJson(Option.some('[{"offsetSeconds":10,"startedAtMs":1000}]')) // [{ offsetSeconds: 10, startedAtMs: 1000, maybeEndedAtMs: None }]
 * ```
 */
export const gapsOfJson = (
  maybeJson: Option.Option<string>,
): ReadonlyArray<CaptureGap> =>
  pipe(
    maybeJson,
    Option.flatMap(S.decodeUnknownOption(GapRows)),
    Option.map(rows =>
      Array.getSomes(
        Array.map(rows, row =>
          Option.map(S.decodeUnknownOption(GapRow)(row), gap => ({
            offsetSeconds: gap.offsetSeconds,
            startedAtMs: gap.startedAtMs,
            maybeEndedAtMs: Option.fromNullishOr(gap.endedAtMs),
          })),
        ),
      ),
    ),
    Option.getOrElse(() => []),
  )
