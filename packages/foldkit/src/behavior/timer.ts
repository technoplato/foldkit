import { Array, Match as M, Option, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import * as Command from '../command/index.js'
import {
  define,
  forStates,
  ignore,
  to,
  when,
} from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import {
  Device,
  type DeviceReason,
  Free,
  Sampled,
  type Sync,
  Synced,
  defaultPace,
} from './pace.js'
import * as Part from './part.js'
import type { SlotProps } from './slot.js'

// NOTE: this is the core Timer Part (Widget #50 of 54, Scribe #2689). It
// models countdown and stopwatch timers over `Idle | Running | Paused |
// Completed` with configurable `intervalMs`, `startMs`, `targetMs`, and
// recorded `laps`. Time advances purely via `TickTimer({ nowMs })` or
// version-guarded `WaitForTimerTick` Commands (`Command.answerAfter`), with
// zero timers or clock reads inside `foldkit/behavior`. Synced by default
// (`Domain` category, `Pace.Sampled` on ticks and `Pace.Synced` on discrete
// actions) with `Timer.make` and `Timer.deviceOnly()`.

// CONSTANTS

/** Default tick interval in milliseconds (`1000`). */
export const defaultIntervalMs = 1000

/** Default starting duration in milliseconds (`0`). */
export const defaultStartMs = 0

/** Default tick sync sampling window in milliseconds (`1000`). */
export const defaultSampleMs = 1000

const msPerSecond = 1000
const msPerMinute = 60_000
const msPerHour = 3_600_000
const msPerDay = 86_400_000
const secondsPerMinute = 60
const minutesPerHour = 60
const hoursPerDay = 24
const twoDigitWidth = 2
const threeDigitWidth = 3

// SCHEMAS

/** Individual time component unit projected by an `Item` slot. */
export const PartUnit = S.Literals([
  'Days',
  'Hours',
  'Minutes',
  'Seconds',
  'Milliseconds',
])
/** Individual time component unit projected by an `Item` slot. */
export type PartUnit = typeof PartUnit.Type

/** Standard `data-state` marker for the Timer (`'idle' | 'running' | 'paused' | 'completed'`). */
export const DataState = S.Literals(['idle', 'running', 'paused', 'completed'])
/** Standard `data-state` marker for the Timer. */
export type DataState = typeof DataState.Type

/** Broken-down numeric duration parts produced by {@link partsOf}. */
export const TimeParts = S.Struct({
  days: S.Number,
  hours: S.Number,
  minutes: S.Number,
  seconds: S.Number,
  milliseconds: S.Number,
})
/** Broken-down numeric duration parts. */
export type TimeParts = typeof TimeParts.Type

/** Zero-padded string duration parts produced by {@link formattedOf}. */
export const FormattedTimeParts = S.Struct({
  days: S.String,
  hours: S.String,
  minutes: S.String,
  seconds: S.String,
  milliseconds: S.String,
})
/** Zero-padded string duration parts. */
export type FormattedTimeParts = typeof FormattedTimeParts.Type

/**
 * Read-only configuration supplied to the Timer chart and projection from
 * the Program's Model.
 */
export const Props = S.Struct({
  id: S.String,
  countdown: S.optionalKey(S.Boolean),
  startMs: S.optionalKey(S.Number),
  targetMs: S.optionalKey(S.Number),
  intervalMs: S.optionalKey(S.Number),
  label: S.optionalKey(S.String),
  labelledBy: S.optionalKey(S.String),
})
/** Read-only configuration supplied to the Timer chart and projection. */
export type Props = typeof Props.Type

// STATE

/** The timer has not started yet (or was reset). `maybeCurrentMs` is `None` until modified. */
export const Idle = ts('Idle', {
  maybeCurrentMs: S.Option(S.Number),
  maybeTargetMs: S.Option(S.Number),
  laps: S.Array(S.Number),
  version: S.Number,
})
/** The timer has not started yet (or was reset). */
export type Idle = typeof Idle.Type

/** The timer is actively counting. `maybeLastTickMs` anchors explicit `nowMs` stepping. */
export const Running = ts('Running', {
  currentMs: S.Number,
  maybeTargetMs: S.Option(S.Number),
  maybeLastTickMs: S.Option(S.Number),
  laps: S.Array(S.Number),
  version: S.Number,
})
/** The timer is actively counting. */
export type Running = typeof Running.Type

/** The timer is temporarily held at `currentMs` and can resume or reset. */
export const Paused = ts('Paused', {
  currentMs: S.Number,
  maybeTargetMs: S.Option(S.Number),
  laps: S.Array(S.Number),
  version: S.Number,
})
/** The timer is temporarily held at `currentMs`. */
export type Paused = typeof Paused.Type

/** The timer reached its target duration (`targetMs` or `0` in countdown mode). */
export const Completed = ts('Completed', {
  currentMs: S.Number,
  maybeTargetMs: S.Option(S.Number),
  laps: S.Array(S.Number),
  version: S.Number,
})
/** The timer reached its target duration. */
export type Completed = typeof Completed.Type

/** Where a Timer Part stands: `Idle`, `Running`, `Paused`, or `Completed`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Idle, Running, Paused, Completed])
/** Where a Timer Part stands. */
export type State = typeof State.Type

/** Initial Timer state: idle at version `0` with no laps. */
export const initial: State = Idle({
  maybeCurrentMs: Option.none(),
  maybeTargetMs: Option.none(),
  laps: [],
  version: 0,
})

// ACTIONS

/** Starts the timer from its starting duration (or restarts after completion). */
export const StartTimer = Catalog.action('StartTimer', {
  what: 'Starts the timer',
  why: 'To begin measuring or counting down time',
  meta: { label: 'Start', keys: [] },
})

/** Pauses a running timer and holds its current duration. */
export const PauseTimer = Catalog.action('PauseTimer', {
  what: 'Pauses the running timer',
  why: 'To hold the current elapsed duration',
  meta: { label: 'Pause', keys: [] },
})

/** Resumes a paused timer from its held duration. */
export const ResumeTimer = Catalog.action('ResumeTimer', {
  what: 'Resumes the paused timer',
  why: 'To continue tracking time from the held duration',
  meta: { label: 'Resume', keys: [] },
})

/** Resets the timer back to `Idle` and clears recorded laps. */
export const ResetTimer = Catalog.action('ResetTimer', {
  what: 'Resets the timer and clears recorded laps',
  why: 'To return to the starting duration',
  meta: { label: 'Reset', keys: [] },
})

/** Records the current timer reading as a lap without stopping the timer. */
export const LapTimer = Catalog.action('LapTimer', {
  what: 'Records the current timer reading as a lap',
  why: 'To capture a split point without stopping',
  meta: { label: 'Lap', keys: [] },
})

/** Sets the target duration in milliseconds for countdown or stopwatch completion. */
export const SetTimerTarget = Catalog.action('SetTimerTarget', {
  fields: { targetMs: S.Number },
  choose: {
    field: 'targetMs',
    noun: 'target',
    prompt: 'Set the target duration in milliseconds?',
    token: S.FiniteFromString,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'Enter a target duration in milliseconds',
  },
  what: 'Sets the target duration for the timer',
  why: 'To define when the countdown or stopwatch completes',
  meta: { label: 'Set target', keys: [] },
})

/** The Catalog Actions a Timer Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  StartTimer,
  PauseTimer,
  ResumeTimer,
  ResetTimer,
  LapTimer,
  SetTimerTarget,
]

// MESSAGES

/** Starts the timer anchored at an explicit clock reading `nowMs`. */
export const StartedTimer = m('StartedTimer', { nowMs: S.Number })

/** Resumes a paused timer anchored at an explicit clock reading `nowMs`. */
export const ResumedTimer = m('ResumedTimer', { nowMs: S.Number })

/** Advances a running timer purely using an explicit clock reading `nowMs`. */
export const TickTimer = m('TickTimer', { nowMs: S.Number })

/** A scheduled `WaitForTimerTick` Command elapsed for `version` by `deltaMs`. */
export const ElapsedTimerInterval = m('ElapsedTimerInterval', {
  version: S.Number,
  deltaMs: S.Number,
})

/** Every Message the Timer chart handles. */
export const Message = S.Union([
  StartTimer,
  PauseTimer,
  ResumeTimer,
  ResetTimer,
  LapTimer,
  SetTimerTarget,
  StartedTimer,
  ResumedTimer,
  TickTimer,
  ElapsedTimerInterval,
])
/** Every Message the Timer chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Timer Part. */
export const isMessage = S.is(Message)

// COMMAND

/** Waits `afterMs` milliseconds and answers `ElapsedTimerInterval({ version, deltaMs: afterMs })`. */
export const WaitForTimerTick = Command.define(
  'WaitForTimerTick',
  { version: S.Number, afterMs: S.Number },
  ElapsedTimerInterval,
)(({ version, afterMs }) =>
  Command.answerAfter(
    afterMs,
    ElapsedTimerInterval({ version, deltaMs: afterMs }),
  ),
)

// ELEMENT IDS

/** Derives the root container element id from a Timer base `id`. */
export const rootId = (id: string): string => `${id}-root`

/** Derives the live readout area element id from a Timer base `id`. */
export const areaId = (id: string): string => `${id}-area`

/** Derives the action controls group element id from a Timer base `id`. */
export const controlId = (id: string): string => `${id}-control`

/** Derives the start trigger button element id from a Timer base `id`. */
export const startTriggerId = (id: string): string => `${id}-start`

/** Derives the pause trigger button element id from a Timer base `id`. */
export const pauseTriggerId = (id: string): string => `${id}-pause`

/** Derives the resume trigger button element id from a Timer base `id`. */
export const resumeTriggerId = (id: string): string => `${id}-resume`

/** Derives the reset trigger button element id from a Timer base `id`. */
export const resetTriggerId = (id: string): string => `${id}-reset`

/** Derives the lap trigger button element id from a Timer base `id`. */
export const lapTriggerId = (id: string): string => `${id}-lap`

/** Derives one time-unit item element id from a Timer base `id` and `unit`. */
export const itemId = (id: string, unit: string): string =>
  `${id}-item-${unit.toLowerCase()}`

// PURE RULES & FORMATTING HELPERS

const sanitizeNonNegative = (value: number | undefined, fallback: number) =>
  value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback

/** True when the Timer runs in countdown mode (`false` by default). */
export const isCountdownOf = (props: Pick<Props, 'countdown'> = {}): boolean =>
  props.countdown === true

/** Resolved starting duration in milliseconds (`0` by default). */
export const startMsOf = (props: Pick<Props, 'startMs'> = {}): number =>
  sanitizeNonNegative(props.startMs, defaultStartMs)

/** Resolved tick interval in milliseconds (`1000` by default, strictly positive). */
export const intervalMsOf = (props: Pick<Props, 'intervalMs'> = {}): number =>
  props.intervalMs !== undefined &&
  Number.isFinite(props.intervalMs) &&
  props.intervalMs > 0
    ? props.intervalMs
    : defaultIntervalMs

/**
 * Resolves the effective target duration in milliseconds: `state.maybeTargetMs`
 * takes precedence, then `props.targetMs`, defaulting to `Some(0)` in
 * countdown mode and `None` for an unbounded stopwatch.
 */
export const targetMsOf = (
  state: State,
  props: Pick<Props, 'countdown' | 'targetMs'> = {},
): Option.Option<number> =>
  Option.orElse(state.maybeTargetMs, () => {
    if (props.targetMs !== undefined && Number.isFinite(props.targetMs)) {
      return Option.some(Math.max(0, props.targetMs))
    } else if (isCountdownOf(props)) {
      return Option.some(0)
    } else {
      return Option.none()
    }
  })

/**
 * Splits a duration in milliseconds into non-negative integer parts
 * `{ days, hours, minutes, seconds, milliseconds }`.
 *
 * @example
 * ```typescript
 * partsOf(90_061_250)
 * // { days: 1, hours: 1, minutes: 1, seconds: 1, milliseconds: 250 }
 * ```
 */
export const partsOf = (ms: number): TimeParts => {
  const safeMs = Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : defaultStartMs
  const milliseconds = safeMs % msPerSecond
  const seconds = Math.floor(safeMs / msPerSecond) % secondsPerMinute
  const minutes = Math.floor(safeMs / msPerMinute) % minutesPerHour
  const hours = Math.floor(safeMs / msPerHour) % hoursPerDay
  const days = Math.floor(safeMs / msPerDay)
  return { days, hours, minutes, seconds, milliseconds }
}

const padNumber = (value: number, width: number): string =>
  value.toString().padStart(width, '0')

/**
 * Formats a duration in milliseconds into zero-padded string parts
 * `{ days, hours, minutes, seconds, milliseconds }`.
 *
 * @example
 * ```typescript
 * formattedOf(65_005)
 * // { days: '00', hours: '00', minutes: '01', seconds: '05', milliseconds: '005' }
 * ```
 */
export const formattedOf = (ms: number): FormattedTimeParts => {
  const parts = partsOf(ms)
  return {
    days: padNumber(parts.days, twoDigitWidth),
    hours: padNumber(parts.hours, twoDigitWidth),
    minutes: padNumber(parts.minutes, twoDigitWidth),
    seconds: padNumber(parts.seconds, twoDigitWidth),
    milliseconds: padNumber(parts.milliseconds, threeDigitWidth),
  }
}

/** Human-readable clock string (`HH:MM:SS`, prefixed with `Nd ` when `days > 0`). */
export const clockTextOf = (ms: number): string => {
  const parts = partsOf(ms)
  const formatted = formattedOf(ms)
  const hms = `${formatted.hours}:${formatted.minutes}:${formatted.seconds}`
  return parts.days > 0 ? `${parts.days.toString()}d ${hms}` : hms
}

/** Accessible aria-label summary of the timer reading. */
export const areaLabelOf = (ms: number): string => {
  const parts = partsOf(ms)
  const formatted = formattedOf(ms)
  return `${parts.days.toString()} days ${formatted.hours}:${formatted.minutes}:${formatted.seconds}`
}

// READINGS

/** True when the Timer is in `Idle`. */
export const isIdle = (state: State): boolean => state._tag === 'Idle'

/** True when the Timer is actively `Running`. */
export const isRunning = (state: State): boolean => state._tag === 'Running'

/** True when the Timer is `Paused`. */
export const isPaused = (state: State): boolean => state._tag === 'Paused'

/** True when the Timer reached its target (`Completed`). */
export const isCompleted = (state: State): boolean => state._tag === 'Completed'

/** Standard `data-state` marker for the Timer. */
export const dataStateOf = (state: State): DataState =>
  M.value(state).pipe(
    M.withReturnType<DataState>(),
    M.tagsExhaustive({
      Idle: () => 'idle',
      Running: () => 'running',
      Paused: () => 'paused',
      Completed: () => 'completed',
    }),
  )

/** Current duration reading in milliseconds (falling back to `props.startMs` while idle). */
export const currentMsOf = (
  state: State,
  props: Pick<Props, 'startMs'> = {},
): number =>
  M.value(state).pipe(
    M.withReturnType<number>(),
    M.tagsExhaustive({
      Idle: ({ maybeCurrentMs }) =>
        Option.getOrElse(maybeCurrentMs, () => startMsOf(props)),
      Running: ({ currentMs }) => currentMs,
      Paused: ({ currentMs }) => currentMs,
      Completed: ({ currentMs }) => currentMs,
    }),
  )

/** Recorded lap readings in milliseconds, in the order captured. */
export const lapsOf = (state: State): ReadonlyArray<number> => state.laps

/**
 * Normalized completion progress in `[0, 1]` between `startMs` and `targetMs`,
 * or `0` when running an unbounded stopwatch.
 */
export const progressRatioOf = (
  state: State,
  props: Pick<Props, 'countdown' | 'startMs' | 'targetMs'> = {},
): number =>
  Option.match(targetMsOf(state, props), {
    onNone: () => 0,
    onSome: targetMs => {
      const startMs = startMsOf(props)
      const currentMs = currentMsOf(state, props)
      const span = isCountdownOf(props)
        ? startMs - targetMs
        : targetMs - startMs
      if (span <= 0) {
        return isCompleted(state) ? 1 : 0
      } else {
        const progressed = isCountdownOf(props)
          ? startMs - currentMs
          : currentMs - startMs
        return Math.min(Math.max(progressed / span, 0), 1)
      }
    },
  })

// INTERNAL TRANSITION HELPERS

const hasReachedTarget = (
  currentMs: number,
  maybeTargetMs: Option.Option<number>,
  props: Pick<Props, 'countdown'>,
): boolean =>
  Option.match(maybeTargetMs, {
    onNone: () => false,
    onSome: targetMs =>
      isCountdownOf(props) ? currentMs <= targetMs : currentMs >= targetMs,
  })

const stepDuration = (
  currentMs: number,
  deltaMs: number,
  maybeTargetMs: Option.Option<number>,
  props: Pick<Props, 'countdown'>,
): number => {
  const safeDelta = Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0
  if (isCountdownOf(props)) {
    const floor = Option.getOrElse(maybeTargetMs, () => 0)
    return Math.max(floor, currentMs - safeDelta)
  } else {
    const raw = currentMs + safeDelta
    return Option.match(maybeTargetMs, {
      onNone: () => raw,
      onSome: ceiling => Math.min(ceiling, raw),
    })
  }
}

const nextVersion = (version: number): number => version + 1

const steppedDurationOf = (
  state: Running,
  deltaMs: number,
  props: Props,
): number =>
  stepDuration(state.currentMs, deltaMs, targetMsOf(state, props), props)

const completedAfterStep = (state: Running, nextMs: number): Completed =>
  Completed({
    currentMs: nextMs,
    maybeTargetMs: state.maybeTargetMs,
    laps: state.laps,
    version: nextVersion(state.version),
  })

const runningAfterStep = (
  state: Running,
  nextMs: number,
  nextLastTickMs: Option.Option<number>,
  props: Props,
): Readonly<{
  model: Running
  commands: ReadonlyArray<Command.Command<Message>>
}> => {
  const version = nextVersion(state.version)
  return {
    model: Running({
      currentMs: nextMs,
      maybeTargetMs: state.maybeTargetMs,
      maybeLastTickMs: nextLastTickMs,
      laps: state.laps,
      version,
    }),
    commands: [WaitForTimerTick({ version, afterMs: intervalMsOf(props) })],
  }
}

// CHART

/**
 * The Timer Machine chart: start, pause, resume, lap, reset, target updates,
 * explicit `TickTimer({ nowMs })` stepping, and version-guarded
 * `WaitForTimerTick` interval ticks.
 */
export const chart = define({ state: State, message: Message, context: Props })(
  {
    initial,
    states: {
      Idle: {
        on: {
          StartTimer: [
            when(
              (state, _message, context) =>
                hasReachedTarget(
                  currentMsOf(state, context),
                  targetMsOf(state, context),
                  context,
                ),
              'Completed',
              ({ state, context }) =>
                Completed({
                  currentMs: currentMsOf(state, context),
                  maybeTargetMs: state.maybeTargetMs,
                  laps: state.laps,
                  version: nextVersion(state.version),
                }),
            ),
            when(
              () => true,
              'Running',
              ({ state, context }) => {
                const version = nextVersion(state.version)
                return {
                  model: Running({
                    currentMs: currentMsOf(state, context),
                    maybeTargetMs: state.maybeTargetMs,
                    maybeLastTickMs: Option.none(),
                    laps: state.laps,
                    version,
                  }),
                  commands: [
                    WaitForTimerTick({
                      version,
                      afterMs: intervalMsOf(context),
                    }),
                  ],
                }
              },
            ),
          ],
          StartedTimer: [
            when(
              (state, _message, context) =>
                hasReachedTarget(
                  currentMsOf(state, context),
                  targetMsOf(state, context),
                  context,
                ),
              'Completed',
              ({ state, context }) =>
                Completed({
                  currentMs: currentMsOf(state, context),
                  maybeTargetMs: state.maybeTargetMs,
                  laps: state.laps,
                  version: nextVersion(state.version),
                }),
            ),
            when(
              () => true,
              'Running',
              ({ state, message, context }) => {
                const version = nextVersion(state.version)
                return {
                  model: Running({
                    currentMs: currentMsOf(state, context),
                    maybeTargetMs: state.maybeTargetMs,
                    maybeLastTickMs: Option.some(message.nowMs),
                    laps: state.laps,
                    version,
                  }),
                  commands: [
                    WaitForTimerTick({
                      version,
                      afterMs: intervalMsOf(context),
                    }),
                  ],
                }
              },
            ),
          ],
          SetTimerTarget: to('Idle', ({ state, message }) =>
            Idle({
              ...state,
              maybeTargetMs: Option.some(
                sanitizeNonNegative(message.targetMs, 0),
              ),
            }),
          ),
        },
      },
      Running: {
        on: {
          PauseTimer: to('Paused', ({ state }) =>
            Paused({
              currentMs: state.currentMs,
              maybeTargetMs: state.maybeTargetMs,
              laps: state.laps,
              version: nextVersion(state.version),
            }),
          ),
          LapTimer: to('Running', ({ state }) =>
            Running({
              ...state,
              laps: [...state.laps, state.currentMs],
            }),
          ),
          SetTimerTarget: [
            when(
              (state, message, context) =>
                hasReachedTarget(
                  state.currentMs,
                  Option.some(sanitizeNonNegative(message.targetMs, 0)),
                  context,
                ),
              'Completed',
              ({ state, message }) =>
                Completed({
                  currentMs: state.currentMs,
                  maybeTargetMs: Option.some(
                    sanitizeNonNegative(message.targetMs, 0),
                  ),
                  laps: state.laps,
                  version: nextVersion(state.version),
                }),
            ),
            when(
              () => true,
              'Running',
              ({ state, message }) =>
                Running({
                  ...state,
                  maybeTargetMs: Option.some(
                    sanitizeNonNegative(message.targetMs, 0),
                  ),
                }),
            ),
          ],
          TickTimer: [
            when(
              (state, message, context) => {
                const deltaMs = Option.match(state.maybeLastTickMs, {
                  onNone: () => intervalMsOf(context),
                  onSome: lastTickMs => Math.max(0, message.nowMs - lastTickMs),
                })
                const nextMs = steppedDurationOf(state, deltaMs, context)
                return hasReachedTarget(
                  nextMs,
                  targetMsOf(state, context),
                  context,
                )
                  ? Option.some(nextMs)
                  : Option.none()
              },
              'Completed',
              ({ state, guardValue }) => completedAfterStep(state, guardValue),
            ),
            when(
              () => true,
              'Running',
              ({ state, message, context }) => {
                const deltaMs = Option.match(state.maybeLastTickMs, {
                  onNone: () => intervalMsOf(context),
                  onSome: lastTickMs => Math.max(0, message.nowMs - lastTickMs),
                })
                const nextMs = steppedDurationOf(state, deltaMs, context)
                return runningAfterStep(
                  state,
                  nextMs,
                  Option.some(message.nowMs),
                  context,
                )
              },
            ),
          ],
          ElapsedTimerInterval: [
            when(
              (state, message, context) => {
                if (state.version !== message.version) {
                  return Option.none()
                }
                const nextMs = steppedDurationOf(
                  state,
                  message.deltaMs,
                  context,
                )
                return hasReachedTarget(
                  nextMs,
                  targetMsOf(state, context),
                  context,
                )
                  ? Option.some(nextMs)
                  : Option.none()
              },
              'Completed',
              ({ state, guardValue }) => completedAfterStep(state, guardValue),
            ),
            when(
              (state, message) => state.version === message.version,
              'Running',
              ({ state, message, context }) => {
                const nextLastTickMs = Option.map(
                  state.maybeLastTickMs,
                  lastTickMs => lastTickMs + Math.max(0, message.deltaMs),
                )
                const nextMs = steppedDurationOf(
                  state,
                  message.deltaMs,
                  context,
                )
                return runningAfterStep(state, nextMs, nextLastTickMs, context)
              },
            ),
            ignore(),
          ],
        },
      },
      Paused: {
        on: {
          ResumeTimer: [
            when(
              (state, _message, context) =>
                hasReachedTarget(
                  state.currentMs,
                  targetMsOf(state, context),
                  context,
                ),
              'Completed',
              ({ state }) =>
                Completed({
                  currentMs: state.currentMs,
                  maybeTargetMs: state.maybeTargetMs,
                  laps: state.laps,
                  version: nextVersion(state.version),
                }),
            ),
            when(
              () => true,
              'Running',
              ({ state, context }) => {
                const version = nextVersion(state.version)
                return {
                  model: Running({
                    currentMs: state.currentMs,
                    maybeTargetMs: state.maybeTargetMs,
                    maybeLastTickMs: Option.none(),
                    laps: state.laps,
                    version,
                  }),
                  commands: [
                    WaitForTimerTick({
                      version,
                      afterMs: intervalMsOf(context),
                    }),
                  ],
                }
              },
            ),
          ],
          ResumedTimer: [
            when(
              (state, _message, context) =>
                hasReachedTarget(
                  state.currentMs,
                  targetMsOf(state, context),
                  context,
                ),
              'Completed',
              ({ state }) =>
                Completed({
                  currentMs: state.currentMs,
                  maybeTargetMs: state.maybeTargetMs,
                  laps: state.laps,
                  version: nextVersion(state.version),
                }),
            ),
            when(
              () => true,
              'Running',
              ({ state, message, context }) => {
                const version = nextVersion(state.version)
                return {
                  model: Running({
                    currentMs: state.currentMs,
                    maybeTargetMs: state.maybeTargetMs,
                    maybeLastTickMs: Option.some(message.nowMs),
                    laps: state.laps,
                    version,
                  }),
                  commands: [
                    WaitForTimerTick({
                      version,
                      afterMs: intervalMsOf(context),
                    }),
                  ],
                }
              },
            ),
          ],
          LapTimer: to('Paused', ({ state }) =>
            Paused({
              ...state,
              laps: [...state.laps, state.currentMs],
            }),
          ),
          SetTimerTarget: [
            when(
              (state, message, context) =>
                hasReachedTarget(
                  state.currentMs,
                  Option.some(sanitizeNonNegative(message.targetMs, 0)),
                  context,
                ),
              'Completed',
              ({ state, message }) =>
                Completed({
                  currentMs: state.currentMs,
                  maybeTargetMs: Option.some(
                    sanitizeNonNegative(message.targetMs, 0),
                  ),
                  laps: state.laps,
                  version: nextVersion(state.version),
                }),
            ),
            when(
              () => true,
              'Paused',
              ({ state, message }) =>
                Paused({
                  ...state,
                  maybeTargetMs: Option.some(
                    sanitizeNonNegative(message.targetMs, 0),
                  ),
                }),
            ),
          ],
        },
      },
      Completed: {
        on: {
          StartTimer: [
            when(
              (state, _message, context) =>
                hasReachedTarget(
                  startMsOf(context),
                  targetMsOf(state, context),
                  context,
                ),
              'Completed',
              ({ state, context }) =>
                Completed({
                  currentMs: startMsOf(context),
                  maybeTargetMs: state.maybeTargetMs,
                  laps: [],
                  version: nextVersion(state.version),
                }),
            ),
            when(
              () => true,
              'Running',
              ({ state, context }) => {
                const version = nextVersion(state.version)
                return {
                  model: Running({
                    currentMs: startMsOf(context),
                    maybeTargetMs: state.maybeTargetMs,
                    maybeLastTickMs: Option.none(),
                    laps: [],
                    version,
                  }),
                  commands: [
                    WaitForTimerTick({
                      version,
                      afterMs: intervalMsOf(context),
                    }),
                  ],
                }
              },
            ),
          ],
          StartedTimer: [
            when(
              (state, _message, context) =>
                hasReachedTarget(
                  startMsOf(context),
                  targetMsOf(state, context),
                  context,
                ),
              'Completed',
              ({ state, context }) =>
                Completed({
                  currentMs: startMsOf(context),
                  maybeTargetMs: state.maybeTargetMs,
                  laps: [],
                  version: nextVersion(state.version),
                }),
            ),
            when(
              () => true,
              'Running',
              ({ state, message, context }) => {
                const version = nextVersion(state.version)
                return {
                  model: Running({
                    currentMs: startMsOf(context),
                    maybeTargetMs: state.maybeTargetMs,
                    maybeLastTickMs: Option.some(message.nowMs),
                    laps: [],
                    version,
                  }),
                  commands: [
                    WaitForTimerTick({
                      version,
                      afterMs: intervalMsOf(context),
                    }),
                  ],
                }
              },
            ),
          ],
          SetTimerTarget: to('Completed', ({ state, message }) =>
            Completed({
              ...state,
              maybeTargetMs: Option.some(
                sanitizeNonNegative(message.targetMs, 0),
              ),
            }),
          ),
        },
      },
    },
    shared: [
      forStates(['Idle', 'Running', 'Paused', 'Completed']).on({
        ResetTimer: to('Idle', ({ state }) =>
          Idle({
            maybeCurrentMs: Option.none(),
            maybeTargetMs: state.maybeTargetMs,
            laps: [],
            version: nextVersion(state.version),
          }),
        ),
      }),
    ],
  },
)

// SYNC

/**
 * Builds the Timer sync table using `Pace.Sampled({ everyMs })` on tick
 * Messages and `Pace.Synced()` on start, pause, resume, reset, lap, and
 * target updates.
 */
export const syncOf = (
  sampleMs: number = defaultSampleMs,
): Readonly<Record<Message['_tag'], Sync>> => ({
  StartTimer: Synced(),
  PauseTimer: Synced(),
  ResumeTimer: Synced(),
  ResetTimer: Synced(),
  LapTimer: Synced(),
  SetTimerTarget: Synced(),
  StartedTimer: Synced(),
  ResumedTimer: Synced(),
  TickTimer: Sampled({ everyMs: sampleMs }),
  ElapsedTimerInterval: Sampled({ everyMs: sampleMs }),
})

/** Default Timer synchronization: ticks sampled at 1000 ms, control actions synced immediately. */
export const synced: Readonly<Record<Message['_tag'], Sync>> = syncOf()

/** Device-only synchronization table for a Timer kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => ({
  StartTimer: Device({ because }),
  PauseTimer: Device({ because }),
  ResumeTimer: Device({ because }),
  ResetTimer: Device({ because }),
  LapTimer: Device({ because }),
  SetTimerTarget: Device({ because }),
  StartedTimer: Device({ because }),
  ResumedTimer: Device({ because }),
  TickTimer: Device({ because }),
  ElapsedTimerInterval: Device({ because }),
})

/** Returns the {@link Sync} pace for one Timer Message under `sampleMs`. */
export const paceOf = (
  message: Message,
  sampleMs: number = defaultSampleMs,
): Sync => syncOf(sampleMs)[message._tag]

// SLOTS & PROJECTION

/**
 * The nine painted slots of a Timer Part: `Root`, `Area`, `Control`,
 * `StartTrigger`, `PauseTrigger`, `ResumeTrigger`, `ResetTrigger`,
 * `LapTrigger`, and `Item`.
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Root: {
    role: 'Group',
    focus: 'None',
    gestures: [],
  },
  Area: {
    role: 'Status',
    focus: 'None',
    gestures: [],
  },
  Control: {
    role: 'Group',
    focus: 'None',
    gestures: [],
  },
  StartTrigger: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'StartTimer' }],
  },
  PauseTrigger: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'PauseTimer' }],
  },
  ResumeTrigger: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ResumeTimer' }],
  },
  ResetTrigger: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ResetTimer' }],
  },
  LapTrigger: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'LapTimer' }],
  },
  Item: {
    focus: 'None',
    gestures: [],
  },
}

const unitEntryOf = (
  ms: number,
  unit: string,
): Readonly<{ valueNow: number; valueText: string; label: string }> => {
  const parts = partsOf(ms)
  const formatted = formattedOf(ms)
  const normalized = unit.toLowerCase()
  if (normalized === 'days') {
    return { valueNow: parts.days, valueText: formatted.days, label: 'Days' }
  } else if (normalized === 'hours') {
    return { valueNow: parts.hours, valueText: formatted.hours, label: 'Hours' }
  } else if (normalized === 'minutes') {
    return {
      valueNow: parts.minutes,
      valueText: formatted.minutes,
      label: 'Minutes',
    }
  } else if (normalized === 'milliseconds') {
    return {
      valueNow: parts.milliseconds,
      valueText: formatted.milliseconds,
      label: 'Milliseconds',
    }
  } else {
    return {
      valueNow: parts.seconds,
      valueText: formatted.seconds,
      label: 'Seconds',
    }
  }
}

const rootLabelPropsOf = (
  props: Props,
): Pick<SlotProps, 'label' | 'labelledBy'> => {
  if (props.labelledBy !== undefined) {
    return { labelledBy: props.labelledBy }
  } else if (props.label !== undefined) {
    return { label: props.label }
  } else {
    return {}
  }
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  maybeChoice: Option.Option<string>,
): SlotProps => {
  const currentMs = currentMsOf(state, props)
  if (slot === 'Root') {
    return {
      id: rootId(props.id),
      ...rootLabelPropsOf(props),
    }
  } else if (slot === 'Area') {
    return {
      id: areaId(props.id),
      live: 'Off',
      isAtomic: true,
      label: areaLabelOf(currentMs),
      valueNow: currentMs,
      valueText: clockTextOf(currentMs),
    }
  } else if (slot === 'Control') {
    return {
      id: controlId(props.id),
      label: 'Timer controls',
    }
  } else if (slot === 'StartTrigger') {
    const isHidden = isRunning(state) || isPaused(state)
    return {
      id: startTriggerId(props.id),
      ...(isHidden ? { isHidden: true, isDisabled: true } : {}),
    }
  } else if (slot === 'PauseTrigger') {
    return {
      id: pauseTriggerId(props.id),
      ...(isRunning(state) ? {} : { isHidden: true, isDisabled: true }),
    }
  } else if (slot === 'ResumeTrigger') {
    return {
      id: resumeTriggerId(props.id),
      ...(isPaused(state) ? {} : { isHidden: true, isDisabled: true }),
    }
  } else if (slot === 'ResetTrigger') {
    const isPristine =
      state._tag === 'Idle' &&
      Array.isReadonlyArrayEmpty(state.laps) &&
      Option.isNone(state.maybeCurrentMs)
    return {
      id: resetTriggerId(props.id),
      ...(isPristine ? { isDisabled: true } : {}),
    }
  } else if (slot === 'LapTrigger') {
    return {
      id: lapTriggerId(props.id),
      ...(isRunning(state) || isPaused(state) ? {} : { isDisabled: true }),
    }
  } else if (slot === 'Item') {
    const unit = Option.getOrElse(maybeChoice, () => 'Seconds')
    const entry = unitEntryOf(currentMs, unit)
    return {
      id: itemId(props.id, unit),
      label: entry.label,
      valueNow: entry.valueNow,
      valueText: entry.valueText,
    }
  } else {
    return {}
  }
}

/** What a restart opens a Timer on: a running timer pauses with a bumped version so stale ticks cannot fire. */
export const atRest = (state: State): State =>
  state._tag === 'Running'
    ? Paused({
        currentMs: state.currentMs,
        maybeTargetMs: state.maybeTargetMs,
        laps: state.laps,
        version: nextVersion(state.version),
      })
    : state

// PART FACTORY

/** Options for customizing a Timer Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'`) to keep this Timer device-only. */
  sync?: 'Synced' | DeviceReason
  /** Tick sync sampling interval in milliseconds (`1000` by default). */
  sampleMs?: number
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Timer {@link Part.Part}. Synced by default (`category: 'Domain'`,
 * ticks at `Pace.Sampled({ everyMs: 1000 })`, discrete controls at
 * `Pace.Synced`); pass `sync: 'OwnView'` (or use {@link deviceOnly}) to keep
 * a Program's Timer local to one device.
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> => {
  const sampleMs = options.sampleMs ?? defaultSampleMs
  return Part.define<State, Message, Props>({
    name: options.name ?? 'Timer',
    State,
    Message,
    chart,
    actions,
    sync:
      options.sync === undefined || options.sync === 'Synced'
        ? syncOf(sampleMs)
        : deviceSync(options.sync),
    category: options.category ?? 'Domain',
    slots,
    atRest,
    project: projectSlot,
    configuration: options.configuration ?? {
      base: {
        pace: {
          ...defaultPace,
          dragGrain: Free(),
          dragSampleMs: sampleMs,
        },
      },
      presets: {},
    },
  })
}

/**
 * Shorthand for a Timer Part whose state stays on the device and is omitted
 * from the synced log and encoded Model.
 */
export const deviceOnly = (
  options: Omit<MakeOptions, 'sync'> &
    Readonly<{ because?: DeviceReason }> = {},
): Part.Part<State, Message, Props> => {
  const { because, ...rest } = options
  return make({
    ...rest,
    sync: because ?? 'OwnView',
  })
}

/** The default synced Timer Part (`name: 'Timer'`, `category: 'Domain'`). */
export const part: Part.Part<State, Message, Props> = make()
