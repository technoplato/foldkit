import { Option, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import {
  define,
  ignore,
  otherwise,
  to,
  when,
} from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'
import * as Part from './part.js'
import type { SlotOrientation, SlotProps } from './slot.js'

// NOTE: this is the core Marquee Part (Widget #49 of 54, Scribe #2688). It is
// a pure framework-free Machine and Part declaration covering Zag marquee:
// `Paused | Running` playback, `direction` (`Left | Right | Up | Down`),
// `speedPxPerSec`, `loopCount` (`0` = infinite), `completedLoops`,
// `pauseOnHover`, `pauseOnInteraction`, `PauseMarquee`, `ResumeMarquee`,
// `ToggleMarquee`, `CompletedMarqueeLoop`, `RestartMarquee`, `EnteredMarquee`,
// `LeftMarquee`, `isFinishedOf`, and `atRest`. Its state lives in the Model,
// synced by default (`Navigation` category, `Pace.Synced`) with `Marquee.make`
// and `Marquee.deviceOnly()`, and projects reference-stable SlotBindings
// (`Root`, `Viewport`, `Content`, `ToggleButton`).

// CONSTANTS

/** Default marquee scroll direction (`'Left'`). */
export const defaultDirection = 'Left'

/** Default marquee scroll speed in pixels per second (`50`, matching Zag Marquee). */
export const defaultSpeedPxPerSec = 50

/** Minimum positive speed clamp in pixels per second to prevent divide-by-zero durations (`0.001`). */
export const minSpeedPxPerSec = 0.001

/** Default loop count (`0` means infinite looping, matching Zag Marquee). */
export const defaultLoopCount = 0

/** Default accessible label for the marquee region landmark. */
export const defaultLabel = 'Marquee content'

// SCHEMAS

/** Travel direction of the scrolling marquee content. */
export const Direction = S.Literals(['Left', 'Right', 'Up', 'Down'])
/** Travel direction of the scrolling marquee content. */
export type Direction = typeof Direction.Type

/** Why a marquee is currently paused (`User`, `Hover`, `Interaction`, or `Finished`). */
export const PauseReason = S.Literals([
  'User',
  'Hover',
  'Interaction',
  'Finished',
])
/** Why a marquee is currently paused. */
export type PauseReason = typeof PauseReason.Type

/**
 * Read-only configuration supplied to the Marquee chart and projection from
 * the Program's Model.
 */
export const Props = S.Struct({
  id: S.String,
  direction: S.optionalKey(Direction),
  speedPxPerSec: S.optionalKey(S.Number),
  loopCount: S.optionalKey(S.Number),
  pauseOnHover: S.optionalKey(S.Boolean),
  pauseOnInteraction: S.optionalKey(S.Boolean),
  isDisabled: S.optionalKey(S.Boolean),
  label: S.optionalKey(S.String),
})
/** Read-only configuration supplied to the Marquee chart and projection. */
export type Props = typeof Props.Type

// STATE

/** The marquee is actively scrolling, tracking completed loop iterations and restart `cycle`. */
export const Running = ts('Running', {
  completedLoops: S.Number,
  cycle: S.Number,
})
/** The marquee is actively scrolling. */
export type Running = typeof Running.Type

/** The marquee is paused, carrying the `reason` so hover-exit only resumes hover/interaction pauses. */
export const Paused = ts('Paused', {
  completedLoops: S.Number,
  cycle: S.Number,
  reason: PauseReason,
})
/** The marquee is paused. */
export type Paused = typeof Paused.Type

/** Where a Marquee Part stands: `Paused` or `Running`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Paused, Running])
/** Where a Marquee Part stands. */
export type State = typeof State.Type

/** Initial Marquee state: running at `completedLoops: 0` and `cycle: 0`. */
export const initial: State = Running({ completedLoops: 0, cycle: 0 })

/** Creates an initial paused Marquee state (`reason: 'User'`). */
export const initialPaused: State = Paused({
  completedLoops: 0,
  cycle: 0,
  reason: 'User',
})

// ACTIONS

/** Pauses marquee playback until resumed or restarted. */
export const PauseMarquee = Catalog.action('PauseMarquee', {
  what: 'Pauses continuous marquee motion',
  why: 'To read scrolling items comfortably at rest',
  meta: { label: 'Pause marquee', keys: [] },
})

/** Resumes paused marquee playback unless finite `loopCount` has already finished. */
export const ResumeMarquee = Catalog.action('ResumeMarquee', {
  what: 'Resumes continuous marquee motion',
  why: 'To continue cycling items across the viewport',
  meta: { label: 'Resume marquee', keys: [] },
})

/** Pauses marquee playback when running or resumes it when paused. */
export const ToggleMarquee = Catalog.action('ToggleMarquee', {
  what: 'Pauses marquee motion or resumes it when paused',
  why: 'To control whether items keep scrolling',
  meta: { label: 'Toggle marquee', keys: [] },
})

/** Resets `completedLoops` to `0`, bumps `cycle`, and begins running again. */
export const RestartMarquee = Catalog.action('RestartMarquee', {
  what: 'Resets completed loops and starts marquee motion again',
  why: 'To replay a finite sequence from the beginning',
  meta: { label: 'Restart marquee', keys: [] },
})

/** The Catalog Actions a Marquee Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  PauseMarquee,
  ResumeMarquee,
  ToggleMarquee,
  RestartMarquee,
]

// MESSAGES

/** One full marquee loop animation iteration finished; stops automatically once `loopCount` is reached. */
export const CompletedMarqueeLoop = m('CompletedMarqueeLoop')

/** Pointer or focus entered the marquee, pausing playback when `pauseOnHover` or `pauseOnInteraction` is enabled. */
export const EnteredMarquee = m('EnteredMarquee')

/** Pointer or focus left the marquee, resuming playback if it was paused by hover or interaction. */
export const LeftMarquee = m('LeftMarquee')

/** Every Message the Marquee chart handles. */
export const Message = S.Union([
  PauseMarquee,
  ResumeMarquee,
  ToggleMarquee,
  RestartMarquee,
  CompletedMarqueeLoop,
  EnteredMarquee,
  LeftMarquee,
])
/** Every Message the Marquee chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Marquee Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the root marquee landmark element id from a base `id`. */
export const rootId = (id: string): string => `${id}-root`

/** Derives the marquee clipping viewport element id from a base `id`. */
export const viewportId = (id: string): string => `${id}-viewport`

/** Derives one marquee content track element id (`0` for primary, `1+` for clones). */
export const contentId = (id: string, index: number = 0): string =>
  `${id}-content-${index.toString()}`

/** Derives the play/pause toggle button element id from a base `id`. */
export const toggleButtonId = (id: string): string => `${id}-toggle`

// PURE RULES & CONFIGURATION READERS

/** Resolved marquee scroll direction (`'Left'` by default). */
export const directionOf = (props: Pick<Props, 'direction'> = {}): Direction =>
  props.direction ?? defaultDirection

/** Axis corresponding to `direction`: `'Vertical'` for `Up`/`Down`, `'Horizontal'` for `Left`/`Right`. */
export const orientationOf = (
  props: Pick<Props, 'direction'> = {},
): SlotOrientation => {
  const dir = directionOf(props)
  return dir === 'Up' || dir === 'Down' ? 'Vertical' : 'Horizontal'
}

/** True when the marquee scrolls vertically (`'Up'` or `'Down'`). */
export const isVerticalOf = (props: Pick<Props, 'direction'> = {}): boolean =>
  orientationOf(props) === 'Vertical'

/** True when the marquee travels toward increasing coordinates (`'Right'` or `'Down'`). */
export const isReversedOf = (props: Pick<Props, 'direction'> = {}): boolean => {
  const dir = directionOf(props)
  return dir === 'Right' || dir === 'Down'
}

/** Resolved positive scroll speed in pixels per second (`50` by default). */
export const speedPxPerSecOf = (
  props: Pick<Props, 'speedPxPerSec'> = {},
): number => {
  const raw = props.speedPxPerSec ?? defaultSpeedPxPerSec
  return Number.isFinite(raw) && raw > 0
    ? Math.max(minSpeedPxPerSec, raw)
    : defaultSpeedPxPerSec
}

/** Resolved non-negative loop limit (`0` = infinite, matching Zag Marquee). */
export const loopCountOf = (props: Pick<Props, 'loopCount'> = {}): number => {
  const raw = props.loopCount ?? defaultLoopCount
  return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : defaultLoopCount
}

/** True when `loopCount === 0` (infinite looping). */
export const isInfiniteOf = (props: Pick<Props, 'loopCount'> = {}): boolean =>
  loopCountOf(props) === 0

/** True when pointer hover pauses marquee playback (`false` by default). */
export const pauseOnHoverOf = (
  props: Pick<Props, 'pauseOnHover'> = {},
): boolean => props.pauseOnHover === true

/** True when interactive hover/focus pauses marquee playback (`false` by default). */
export const pauseOnInteractionOf = (
  props: Pick<Props, 'pauseOnInteraction'> = {},
): boolean => props.pauseOnInteraction === true

/** True when the marquee controls are disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/** Resolved accessible label for the marquee landmark (`'Marquee content'` by default). */
export const labelOf = (props: Pick<Props, 'label'> = {}): string =>
  props.label ?? defaultLabel

/**
 * Pure animation duration in seconds for one loop of `contentSizePx` pixels at
 * `speedPxPerSecOf(props)`.
 *
 * @example
 * ```typescript
 * durationSecOf(500, { speedPxPerSec: 50 }) // 10
 * ```
 */
export const durationSecOf = (
  contentSizePx: number,
  props: Pick<Props, 'speedPxPerSec'> = {},
): number => {
  if (!Number.isFinite(contentSizePx) || contentSizePx <= 0) {
    return 0
  } else {
    return contentSizePx / speedPxPerSecOf(props)
  }
}

// READINGS

/** True while the marquee is actively scrolling. */
export const isRunning = (state: State): boolean => state._tag === 'Running'

/** True while the marquee is paused. */
export const isPaused = (state: State): boolean => state._tag === 'Paused'

/** Number of loop iterations completed since start or last restart. */
export const completedLoopsOf = (state: State): number => state.completedLoops

/** Monotonic restart counter incremented on each `RestartMarquee`. */
export const cycleOf = (state: State): number => state.cycle

/** Pause reason while `Paused`, or none while `Running`. */
export const pauseReasonOf = (state: State): Option.Option<PauseReason> =>
  state._tag === 'Paused' ? Option.some(state.reason) : Option.none()

/**
 * True when `loopCount > 0` and `completedLoops >= loopCount` (finite playback
 * has reached completion).
 */
export const isFinishedOf = (
  state: State,
  props: Pick<Props, 'loopCount'> = {},
): boolean => {
  const limit = loopCountOf(props)
  return limit > 0 && state.completedLoops >= limit
}

/** Remaining loops before completion for a finite `loopCount`, or `Option.none()` when infinite. */
export const remainingLoopsOf = (
  state: State,
  props: Pick<Props, 'loopCount'> = {},
): Option.Option<number> => {
  const limit = loopCountOf(props)
  return limit === 0
    ? Option.none()
    : Option.some(Math.max(0, limit - state.completedLoops))
}

// INTERNAL CHART HELPERS

const shouldPauseOnEnter = (props: Props): boolean =>
  !isDisabledOf(props) && (pauseOnHoverOf(props) || pauseOnInteractionOf(props))

const enterPauseReasonOf = (props: Props): PauseReason =>
  pauseOnHoverOf(props) ? 'Hover' : 'Interaction'

const isAutoPaused = (state: Paused): boolean =>
  state.reason === 'Hover' || state.reason === 'Interaction'

// CHART

/**
 * The Marquee Machine chart: `Paused | Running` playback with finite or
 * infinite `loopCount`, `CompletedMarqueeLoop` tracking, hover/interaction
 * pause and auto-resume (`EnteredMarquee` / `LeftMarquee`), `PauseMarquee`,
 * `ResumeMarquee`, `ToggleMarquee`, and `RestartMarquee`.
 */
export const chart = define({ state: State, message: Message, context: Props })(
  {
    initial,
    states: {
      Running: {
        on: {
          PauseMarquee: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Paused',
              ({ state }) =>
                Paused({
                  completedLoops: state.completedLoops,
                  cycle: state.cycle,
                  reason: 'User',
                }),
            ),
            ignore(),
          ],
          ResumeMarquee: [ignore()],
          ToggleMarquee: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Paused',
              ({ state }) =>
                Paused({
                  completedLoops: state.completedLoops,
                  cycle: state.cycle,
                  reason: 'User',
                }),
            ),
            ignore(),
          ],
          RestartMarquee: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Running',
              ({ state }) =>
                Running({
                  completedLoops: 0,
                  cycle: state.cycle + 1,
                }),
            ),
            ignore(),
          ],
          CompletedMarqueeLoop: [
            when(
              (state, _message, context) => {
                const limit = loopCountOf(context)
                return limit > 0 && state.completedLoops + 1 >= limit
              },
              'Paused',
              ({ state }) =>
                Paused({
                  completedLoops: state.completedLoops + 1,
                  cycle: state.cycle,
                  reason: 'Finished',
                }),
            ),
            otherwise(
              to('Running', ({ state }) =>
                Running({
                  completedLoops: state.completedLoops + 1,
                  cycle: state.cycle,
                }),
              ),
            ),
          ],
          EnteredMarquee: [
            when(
              (_state, _message, context) => shouldPauseOnEnter(context),
              'Paused',
              ({ state, context }) =>
                Paused({
                  completedLoops: state.completedLoops,
                  cycle: state.cycle,
                  reason: enterPauseReasonOf(context),
                }),
            ),
            ignore(),
          ],
          LeftMarquee: [ignore()],
        },
      },
      Paused: {
        on: {
          PauseMarquee: [
            when(
              (state, _message, context) =>
                !isDisabledOf(context) &&
                state.reason !== 'User' &&
                state.reason !== 'Finished',
              'Paused',
              ({ state }) =>
                Paused({
                  completedLoops: state.completedLoops,
                  cycle: state.cycle,
                  reason: 'User',
                }),
            ),
            ignore(),
          ],
          ResumeMarquee: [
            when(
              (state, _message, context) =>
                !isDisabledOf(context) && !isFinishedOf(state, context),
              'Running',
              ({ state }) =>
                Running({
                  completedLoops: state.completedLoops,
                  cycle: state.cycle,
                }),
            ),
            ignore(),
          ],
          ToggleMarquee: [
            when(
              (state, _message, context) =>
                !isDisabledOf(context) && !isFinishedOf(state, context),
              'Running',
              ({ state }) =>
                Running({
                  completedLoops: state.completedLoops,
                  cycle: state.cycle,
                }),
            ),
            ignore(),
          ],
          RestartMarquee: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Running',
              ({ state }) =>
                Running({
                  completedLoops: 0,
                  cycle: state.cycle + 1,
                }),
            ),
            ignore(),
          ],
          CompletedMarqueeLoop: [ignore()],
          EnteredMarquee: [ignore()],
          LeftMarquee: [
            when(
              (state, _message, context) =>
                !isDisabledOf(context) &&
                isAutoPaused(state) &&
                !isFinishedOf(state, context),
              'Running',
              ({ state }) =>
                Running({
                  completedLoops: state.completedLoops,
                  cycle: state.cycle,
                }),
            ),
            ignore(),
          ],
        },
      },
    },
  },
)

// SYNC

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  PauseMarquee: pace,
  ResumeMarquee: pace,
  ToggleMarquee: pace,
  RestartMarquee: pace,
  CompletedMarqueeLoop: pace,
  EnteredMarquee: pace,
  LeftMarquee: pace,
})

/** Default synchronization: every Marquee Message syncs immediately. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a Marquee kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/**
 * The four painted slots of a Marquee Part: `Root`, `Viewport`, `Content`, and
 * `ToggleButton`.
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Root: {
    role: 'Region',
    focus: 'None',
    gestures: [],
  },
  Viewport: {
    role: 'Group',
    focus: 'None',
    gestures: [],
  },
  Content: {
    role: 'Group',
    focus: 'None',
    gestures: [],
  },
  ToggleButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ToggleMarquee' }],
  },
}

const parseCloneIndex = (maybeChoice: Option.Option<string>): number =>
  Option.match(maybeChoice, {
    onNone: () => 0,
    onSome: raw => {
      const parsed = Number(raw)
      return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0
    },
  })

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  maybeChoice: Option.Option<string>,
): SlotProps => {
  const orientation = orientationOf(props)
  const disabled = isDisabledOf(props)

  if (slot === 'Root') {
    return {
      id: rootId(props.id),
      label: labelOf(props),
      orientation,
      live: 'Off',
      ...(disabled ? { isDisabled: true } : {}),
    }
  } else if (slot === 'Viewport') {
    return {
      id: viewportId(props.id),
      orientation,
    }
  } else if (slot === 'Content') {
    const index = parseCloneIndex(maybeChoice)
    return {
      id: contentId(props.id, index),
      orientation,
      ...(index > 0 ? { isHidden: true } : {}),
    }
  } else if (slot === 'ToggleButton') {
    const running = isRunning(state)
    const finished = isFinishedOf(state, props)
    return {
      id: toggleButtonId(props.id),
      label: running ? 'Pause marquee' : 'Resume marquee',
      isPressed: !running,
      controls: viewportId(props.id),
      isDisabled: disabled || finished,
    }
  } else {
    return {}
  }
}

/**
 * What a restart opens a Marquee on: paused at its current `completedLoops`
 * and `cycle`, preserving `'Finished'` when finite loops have completed.
 */
export const atRest = (state: State): State =>
  Paused({
    completedLoops: state.completedLoops,
    cycle: state.cycle,
    reason:
      state._tag === 'Paused' && state.reason === 'Finished'
        ? 'Finished'
        : 'User',
  })

// PART FACTORY

/** Options for customizing a Marquee Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'`) to keep this Marquee device-only. */
  sync?: 'Synced' | DeviceReason
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Marquee {@link Part.Part}. Synced by default
 * (`category: 'Navigation'`, `Pace.Synced`); pass `sync: 'OwnView'` (or use
 * {@link deviceOnly}) to keep a Program's Marquee local to one device.
 *
 * @example
 * ```typescript
 * const TickerMarquee = Marquee.make({ name: 'TickerMarquee' })
 * const LocalMarquee = Marquee.deviceOnly({ name: 'LocalMarquee' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> =>
  Part.define<State, Message, Props>({
    name: options.name ?? 'Marquee',
    State,
    Message,
    chart,
    actions,
    sync:
      options.sync === undefined || options.sync === 'Synced'
        ? synced
        : deviceSync(options.sync),
    category: options.category ?? 'Navigation',
    slots,
    atRest,
    project: projectSlot,
    ...(options.configuration === undefined
      ? {}
      : { configuration: options.configuration }),
  })

/** Shorthand for a Marquee Part whose state stays on the device and is omitted from the synced log and encoded Model. */
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

/** The default synced Marquee Part (`name: 'Marquee'`, `category: 'Navigation'`). */
export const part: Part.Part<State, Message, Props> = make()
