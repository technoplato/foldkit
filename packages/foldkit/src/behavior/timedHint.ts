import { Match as M, Option, Schema as S } from 'effect'

import * as Command from '../command/index.js'
import {
  define,
  forStates,
  ignore,
  to,
  when,
} from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import type { Block } from './block.js'
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'

// NOTE: this is the reusable framework-free `timedHint` block (Scribe #2625).
// It models versioned timed visibility and auto-dismiss as a pure Machine
// whose wait is a Command (`Command.answerAfter`), so no painter holds a
// timer. Reused by Toast (#10), Tooltip (#11), Counter key hints, and
// Clipboard copy feedback (#53).

// STATE

/** Nothing is shown. `version` rises monotonically so stale waits stay rejected. */
export const Hidden = ts('Hidden', { version: S.Number })
/** Nothing is shown. */
export type Hidden = typeof Hidden.Type

/**
 * The hint is visible and running its countdown when `maybeDurationMs` is
 * `Some(ms)`, or staying open indefinitely (sticky) when `maybeDurationMs`
 * is `None`.
 */
export const Active = ts('Active', {
  version: S.Number,
  maybeDurationMs: S.Option(S.Number),
})
/** The hint is visible and counting down (or sticky when `maybeDurationMs` is `None`). */
export type Active = typeof Active.Type

/**
 * The hint is visible and paused (for example on pointer hover or focus).
 * Pausing bumps `version` so any in-flight wait becomes stale; resuming
 * bumps `version` again and reschedules `WaitForHintElapsed` when timed.
 */
export const Paused = ts('Paused', {
  version: S.Number,
  maybeDurationMs: S.Option(S.Number),
})
/** The hint is visible and paused. */
export type Paused = typeof Paused.Type

/**
 * Where a timed hint stands: `Hidden`, `Active`, or `Paused`. Lives in the
 * Model and is JSON-serializable with no sentinel values.
 *
 * @example
 * ```typescript
 * const state: TimedHint.State = TimedHint.initial
 * ```
 */
export const State = S.Union([Hidden, Active, Paused])
/** Where a timed hint stands. */
export type State = typeof State.Type

/** Initial timed hint state: hidden at version `0`. */
export const initial: State = Hidden({ version: 0 })

// MESSAGE

/**
 * Reveals or refreshes the hint. When `maybeDurationMs` is `Some(ms)`,
 * schedules `WaitForHintElapsed` for the new version; when `None`, shows
 * indefinitely (sticky) without scheduling a wait.
 */
export const ShowHint = m('ShowHint', {
  maybeDurationMs: S.Option(S.Number),
})
/** Reveals or refreshes the hint. */
export type ShowHint = typeof ShowHint.Type

/** Pauses an active hint and bumps `version` so any pending wait becomes stale. */
export const PauseHint = m('PauseHint')
/** Pauses an active hint. */
export type PauseHint = typeof PauseHint.Type

/** Resumes a paused hint, bumping `version` and rescheduling `WaitForHintElapsed` when timed. */
export const ResumeHint = m('ResumeHint')
/** Resumes a paused hint. */
export type ResumeHint = typeof ResumeHint.Type

/** Hides a visible hint immediately and bumps `version` so any pending wait becomes stale. */
export const DismissHint = m('DismissHint')
/** Hides a visible hint immediately. */
export type DismissHint = typeof DismissHint.Type

/** A previously scheduled wait elapsed for `version`. Ignored unless active, timed, and matching `version`. */
export const ElapsedHint = m('ElapsedHint', { version: S.Number })
/** A previously scheduled wait elapsed for `version`. */
export type ElapsedHint = typeof ElapsedHint.Type

/** Every Message the timedHint block handles. */
export const Message = S.Union([
  ShowHint,
  PauseHint,
  ResumeHint,
  DismissHint,
  ElapsedHint,
])
/** Every Message the timedHint block handles. */
export type Message = typeof Message.Type

/** True for a Message of the timedHint block. */
export const isMessage = S.is(Message)

// COMMAND

/** Waits `afterMs` milliseconds and answers `ElapsedHint({ version })`. */
export const WaitForHintElapsed = Command.define(
  'WaitForHintElapsed',
  { version: S.Number, afterMs: S.Number },
  ElapsedHint,
)(({ version, afterMs }) =>
  Command.answerAfter(afterMs, ElapsedHint({ version })),
)

// READINGS & PURE HELPERS

/** Monotonic version increment shared by transitions and thin painters. */
export const nextVersion = (version: number): number => version + 1

/** Current monotonic version counter of `state`. */
export const versionOf = (state: State): number => state.version

/** True while the hint is visible (`Active` or `Paused`). */
export const isVisible = (state: State): boolean => state._tag !== 'Hidden'

/** True while the hint is visible and unpaused (`Active`). */
export const isActive = (state: State): boolean => state._tag === 'Active'

/** True while the hint is visible and paused (`Paused`). */
export const isPaused = (state: State): boolean => state._tag === 'Paused'

/** True while the hint is visible with no auto-dismiss duration (`maybeDurationMs: None`). */
export const isSticky = (state: State): boolean =>
  M.value(state).pipe(
    M.withReturnType<boolean>(),
    M.tagsExhaustive({
      Hidden: () => false,
      Active: ({ maybeDurationMs }) => Option.isNone(maybeDurationMs),
      Paused: ({ maybeDurationMs }) => Option.isNone(maybeDurationMs),
    }),
  )

/** The configured auto-dismiss duration in milliseconds while visible, else `None`. */
export const durationMsOf = (state: State): Option.Option<number> =>
  M.value(state).pipe(
    M.withReturnType<Option.Option<number>>(),
    M.tagsExhaustive({
      Hidden: () => Option.none(),
      Active: ({ maybeDurationMs }) => maybeDurationMs,
      Paused: ({ maybeDurationMs }) => maybeDurationMs,
    }),
  )

/**
 * True when an `ElapsedHint` carrying `version` should dismiss `state`:
 * the hint must be `Active`, timed (`maybeDurationMs` is `Some`), and on the
 * exact matching `version`.
 *
 * @example
 * ```typescript
 * shouldAcceptElapsed(Active({ version: 2, maybeDurationMs: Option.some(4000) }), 2) // true
 * shouldAcceptElapsed(Active({ version: 2, maybeDurationMs: Option.some(4000) }), 1) // false
 * shouldAcceptElapsed(Paused({ version: 2, maybeDurationMs: Option.some(4000) }), 2) // false
 * shouldAcceptElapsed(Active({ version: 2, maybeDurationMs: Option.none() }), 2) // false
 * ```
 */
export const shouldAcceptElapsed = (state: State, version: number): boolean =>
  state._tag === 'Active' &&
  Option.isSome(state.maybeDurationMs) &&
  state.version === version

/**
 * Reconstructs a {@link State} from flat visibility, pause, version, and
 * duration fields, allowing thin painters with flat models (such as
 * `@foldkit/ui` `Toast`) to delegate timer and pause rules to `TimedHint`.
 *
 * @example
 * ```typescript
 * fromFields({ isVisible: true, isPaused: false, version: 0, maybeDurationMs: Option.some(4000) })
 * // Active({ version: 0, maybeDurationMs: Option.some(4000) })
 * ```
 */
export const fromFields = (
  input: Readonly<{
    isVisible: boolean
    isPaused: boolean
    version: number
    maybeDurationMs: Option.Option<number>
  }>,
): State => {
  if (!input.isVisible) {
    return Hidden({ version: input.version })
  } else if (input.isPaused) {
    return Paused({
      version: input.version,
      maybeDurationMs: input.maybeDurationMs,
    })
  } else {
    return Active({
      version: input.version,
      maybeDurationMs: input.maybeDurationMs,
    })
  }
}

// CHART

const waitCommandsFor = (
  version: number,
  maybeDurationMs: Option.Option<number>,
): ReadonlyArray<Command.Command<Message>> =>
  Option.match(maybeDurationMs, {
    onNone: () => [],
    onSome: afterMs => [WaitForHintElapsed({ version, afterMs })],
  })

/**
 * The timedHint Machine chart: showing enters `Active` (with
 * `WaitForHintElapsed` when timed, or no wait when sticky), pausing enters
 * `Paused` with a bumped version so in-flight waits are ignored, resuming
 * returns to `Active` with a fresh wait, manual dismiss enters `Hidden` with
 * a bumped version, and `ElapsedHint` hides only when active, timed, and
 * matching `version`.
 *
 * @example
 * ```typescript
 * const [shown, commands] = TimedHint.chart.transition(
 *   TimedHint.initial,
 *   TimedHint.ShowHint({ maybeDurationMs: Option.some(4000) }),
 * )
 * // shown: Active({ version: 1, maybeDurationMs: Some(4000) })
 * // commands: [WaitForHintElapsed({ version: 1, afterMs: 4000 })]
 * ```
 */
export const chart = define({ state: State, message: Message })({
  initial,
  states: {
    Hidden: {
      on: {
        PauseHint: [ignore()],
        ResumeHint: [ignore()],
        DismissHint: [ignore()],
        ElapsedHint: [ignore()],
      },
    },
    Active: {
      on: {
        PauseHint: to('Paused', ({ state }) =>
          Paused({
            version: nextVersion(state.version),
            maybeDurationMs: state.maybeDurationMs,
          }),
        ),
        ResumeHint: [ignore()],
        ElapsedHint: [
          when(
            (state, message) => shouldAcceptElapsed(state, message.version),
            'Hidden',
            ({ state }) => Hidden({ version: state.version }),
          ),
          ignore(),
        ],
      },
    },
    Paused: {
      on: {
        PauseHint: [ignore()],
        ResumeHint: to('Active', ({ state }) => {
          const version = nextVersion(state.version)
          return {
            model: Active({
              version,
              maybeDurationMs: state.maybeDurationMs,
            }),
            commands: waitCommandsFor(version, state.maybeDurationMs),
          }
        }),
        ElapsedHint: [ignore()],
      },
    },
  },
  shared: [
    forStates(['Hidden', 'Active', 'Paused']).on({
      ShowHint: to('Active', ({ state, message }) => {
        const version = nextVersion(state.version)
        return {
          model: Active({
            version,
            maybeDurationMs: message.maybeDurationMs,
          }),
          commands: waitCommandsFor(version, message.maybeDurationMs),
        }
      }),
    }),
    forStates(['Active', 'Paused']).on({
      DismissHint: to('Hidden', ({ state }) =>
        Hidden({ version: nextVersion(state.version) }),
      ),
    }),
  ],
})

// SYNC, REST & BLOCK

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  ShowHint: pace,
  PauseHint: pace,
  ResumeHint: pace,
  DismissHint: pace,
  ElapsedHint: pace,
})

/** Synced synchronization table when a host Part syncs its timedHint Messages. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for timed hints kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

/** Default standalone block synchronization: device-only view feedback. */
export const sync: Readonly<Record<Message['_tag'], Sync>> =
  deviceSync('OwnView')

/** What a restart opens a timedHint on: hidden, preserving the monotonic version counter. */
export const atRest = (state: State): State =>
  Hidden({ version: state.version })

/**
 * TimedHint as a reusable {@link Block}: state, Messages, chart, sync, and
 * resting state.
 */
export const block: Block<State, Message> = {
  name: 'TimedHint',
  State,
  Message,
  chart,
  sync,
  atRest,
}
