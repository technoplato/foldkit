import { Match as M, Option, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import {
  define,
  forStates,
  ignore,
  otherwise,
  to,
  when,
} from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'
import * as Part from './part.js'
import type { SlotProps } from './slot.js'

// NOTE: this is the reusable framework-free `presence` block and core Presence
// Part (Scribe #2617, #2664). It models the enter/leave mount lifecycle as a
// pure Machine whose state lives in the Model, covering animated double-rAF +
// settle phases (`Closed -> EnterStart -> EnterAnimating -> Open -> LeaveStart
// -> LeaveAnimating -> Closed`), interruptible enter->leave and leave->enter
// reversals, immediate non-animated transitions, size-collapse state, and
// stale-event guards. Both composed Foldkit Parts (Disclosure, Toast) and
// `@foldkit/ui` `Animation` share these semantics without touching the DOM,
// timers, or any UI framework, and standalone consumers can compose
// `Presence.part` / `Presence.make` / `Presence.deviceOnly()` directly.

// CONSTANTS

const defaultPresenceId = 'presence'

// SCHEMAS

/**
 * Read-only configuration supplied to the Presence chart and projection.
 *
 * When `isAnimated` is `true` (the default), `Show` steps through
 * `EnterStart -> EnterAnimating -> Open` and `Hide` steps through
 * `LeaveStart -> LeaveAnimating -> Closed`. When `isAnimated` is `false`,
 * `Show` jumps straight to `Open` and `Hide` jumps straight to `Closed`.
 */
export const Props = S.Struct({
  id: S.optionalKey(S.String),
  isAnimated: S.optionalKey(S.Boolean),
  animateSize: S.optionalKey(S.Boolean),
  label: S.optionalKey(S.String),
  labelledBy: S.optionalKey(S.String),
})
/** Read-only configuration supplied to the Presence chart and projection. */
export type Props = typeof Props.Type

/**
 * The five animation transition phases matching `@foldkit/ui` `Animation`:
 * `'Idle'` when settled (`Closed` or `Open`), or one of the four active
 * enter/leave phases.
 */
export const TransitionPhase = S.Literals([
  'Idle',
  'EnterStart',
  'EnterAnimating',
  'LeaveStart',
  'LeaveAnimating',
])
/** The five animation transition phases matching `@foldkit/ui` `Animation`. */
export type TransitionPhase = typeof TransitionPhase.Type

/** Standard `data-state` attribute value matching Zag and Radix Presence (`'open' | 'closed'`). */
export const DataState = S.Literals(['open', 'closed'])
/** Standard `data-state` attribute value (`'open' | 'closed'`). */
export type DataState = typeof DataState.Type

// STATE

/** Content is hidden and unmounted. */
export const Closed = ts('Closed')
/** Content is hidden and unmounted. */
export type Closed = typeof Closed.Type

/** Content just mounted for enter; waiting for a double-rAF before starting the enter animation. */
export const EnterStart = ts('EnterStart')
/** Content just mounted for enter; waiting for a double-rAF. */
export type EnterStart = typeof EnterStart.Type

/** Content is actively running its enter transition or keyframe animation. */
export const EnterAnimating = ts('EnterAnimating')
/** Content is actively running its enter animation. */
export type EnterAnimating = typeof EnterAnimating.Type

/** Content is fully visible and settled. */
export const Open = ts('Open')
/** Content is fully visible and settled. */
export type Open = typeof Open.Type

/** Content started leaving; stays mounted while waiting for a double-rAF before starting the leave animation. */
export const LeaveStart = ts('LeaveStart')
/** Content started leaving; waiting for a double-rAF. */
export type LeaveStart = typeof LeaveStart.Type

/** Content is actively running its leave animation and stays mounted until it settles. */
export const LeaveAnimating = ts('LeaveAnimating')
/** Content is actively running its leave animation. */
export type LeaveAnimating = typeof LeaveAnimating.Type

/** Where a Presence lifecycle stands. Lives in the Model and is JSON-serializable. */
export const State = S.Union([
  Closed,
  EnterStart,
  EnterAnimating,
  Open,
  LeaveStart,
  LeaveAnimating,
])
/** Where a Presence lifecycle stands. */
export type State = typeof State.Type

/** Initial Presence state: closed and unmounted. */
export const initial: State = Closed()

/** Creates an initial Presence state from a boolean open flag (`true` -> `Open`, `false` -> `Closed`). */
export const initialOf = (isOpen: boolean): State =>
  isOpen ? Open() : Closed()

// ACTIONS

/** Intent to reveal and mount the content. */
export const Show = Catalog.action('Show', {
  what: 'Reveals and mounts the animated content',
  why: 'To bring hidden details into view',
  meta: { label: 'Show', keys: [] },
})

/** Intent to hide and unmount the content. */
export const Hide = Catalog.action('Hide', {
  what: 'Hides and unmounts the animated content',
  why: 'To remove temporary details from view',
  meta: { label: 'Hide', keys: [] },
})

/** The Catalog Actions a Presence Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [Show, Hide]

// MESSAGE

/** Painter reported that a double-rAF completed, advancing `EnterStart`/`LeaveStart` to animating. */
export const AdvanceFrame = m('AdvanceFrame')
/** Painter reported that CSS or native animations settled, completing `EnterAnimating`/`LeaveAnimating`. */
export const EndAnimation = m('EndAnimation')

/** Every Message the Presence chart handles. */
export const Message = S.Union([Show, Hide, AdvanceFrame, EndAnimation])
/** Every Message the Presence chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Presence block. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the presence container element id from a base `id`. */
export const containerId = (id: string): string => `${id}-container`

// PURE HELPERS & READINGS

/** Resolved `isAnimated` flag for `props` (defaults to `true`). */
export const isAnimatedOf = (props: Props = {}): boolean =>
  props.isAnimated ?? true

/**
 * True when the content should remain mounted in the tree (`true` in every
 * state except `Closed`, including while exit animations play).
 *
 * @example
 * ```typescript
 * isMounted(Presence.LeaveAnimating()) // true
 * isMounted(Presence.Closed()) // false
 * ```
 */
export const isMounted = (state: State): boolean => state._tag !== 'Closed'

/**
 * Alias of {@link isMounted}: true when the content should stay visible/rendered
 * (open, entering, or finishing its leave animation).
 */
export const isVisible = isMounted

/**
 * True when visibility intent is open (`EnterStart`, `EnterAnimating`, or
 * `Open`). Matches `@foldkit/ui` `Animation.Model.isShowing`.
 *
 * @example
 * ```typescript
 * isShowing(Presence.EnterStart()) // true
 * isShowing(Presence.LeaveStart()) // false
 * ```
 */
export const isShowing = (state: State): boolean =>
  state._tag === 'EnterStart' ||
  state._tag === 'EnterAnimating' ||
  state._tag === 'Open'

/** True while entering (`EnterStart` or `EnterAnimating`). */
export const isEntering = (state: State): boolean =>
  state._tag === 'EnterStart' || state._tag === 'EnterAnimating'

/** True while leaving (`LeaveStart` or `LeaveAnimating`). */
export const isLeaving = (state: State): boolean =>
  state._tag === 'LeaveStart' || state._tag === 'LeaveAnimating'

/**
 * True when size-animated containers (such as `grid-template-rows: 0fr -> 1fr`)
 * should sit in their collapsed `0fr` state: `Closed`, `EnterStart` (before
 * the enter frame expands it), or `LeaveAnimating` (while collapsing out).
 * Shared by `@foldkit/ui` `Animation`.
 *
 * @example
 * ```typescript
 * isClosedForSize(Presence.Closed()) // true
 * isClosedForSize(Presence.EnterStart()) // true
 * isClosedForSize(Presence.EnterAnimating()) // false
 * isClosedForSize(Presence.LeaveStart()) // false
 * isClosedForSize(Presence.LeaveAnimating()) // true
 * ```
 */
export const isClosedForSize = (state: State): boolean =>
  state._tag === 'Closed' ||
  state._tag === 'EnterStart' ||
  state._tag === 'LeaveAnimating'

/**
 * True while any enter or leave transition phase is active (anything other
 * than settled `Closed` or `Open`).
 */
export const isAnimating = (state: State): boolean =>
  state._tag !== 'Closed' && state._tag !== 'Open'

/** True when waiting for a double-rAF (`EnterStart` or `LeaveStart`). */
export const isWaitingForFrame = (state: State): boolean =>
  state._tag === 'EnterStart' || state._tag === 'LeaveStart'

/** True when waiting for CSS or native animations to settle (`EnterAnimating` or `LeaveAnimating`). */
export const isWaitingForAnimationEnd = (state: State): boolean =>
  state._tag === 'EnterAnimating' || state._tag === 'LeaveAnimating'

/**
 * Derives Zag/Radix `data-state` (`'open'` while entering or open, `'closed'`
 * while leaving or closed).
 *
 * @example
 * ```typescript
 * dataStateOf(Presence.EnterStart()) // 'open'
 * dataStateOf(Presence.LeaveAnimating()) // 'closed'
 * ```
 */
export const dataStateOf = (state: State): DataState =>
  isShowing(state) ? 'open' : 'closed'

/**
 * Maps a {@link State} onto `@foldkit/ui` `Animation`'s 5-phase
 * {@link TransitionPhase}.
 *
 * @example
 * ```typescript
 * transitionPhaseOf(Presence.Open()) // 'Idle'
 * transitionPhaseOf(Presence.LeaveAnimating()) // 'LeaveAnimating'
 * ```
 */
export const transitionPhaseOf = (state: State): TransitionPhase =>
  M.value(state).pipe(
    M.withReturnType<TransitionPhase>(),
    M.tagsExhaustive({
      Closed: () => 'Idle',
      EnterStart: () => 'EnterStart',
      EnterAnimating: () => 'EnterAnimating',
      Open: () => 'Idle',
      LeaveStart: () => 'LeaveStart',
      LeaveAnimating: () => 'LeaveAnimating',
    }),
  )

/**
 * Converts a `@foldkit/ui` `Animation` `(isShowing, transitionPhase)` pair
 * into the corresponding {@link State}.
 */
export const fromAnimation = (
  input: Readonly<{ isShowing: boolean; transitionPhase: TransitionPhase }>,
): State =>
  M.value(input.transitionPhase).pipe(
    M.withReturnType<State>(),
    M.when('Idle', () => (input.isShowing ? Open() : Closed())),
    M.when('EnterStart', () => EnterStart()),
    M.when('EnterAnimating', () => EnterAnimating()),
    M.when('LeaveStart', () => LeaveStart()),
    M.when('LeaveAnimating', () => LeaveAnimating()),
    M.exhaustive,
  )

/**
 * Projects a {@link State} into `@foldkit/ui` `Animation`'s
 * `{ isShowing, transitionPhase }` shape.
 */
export const toAnimation = (
  state: State,
): Readonly<{ isShowing: boolean; transitionPhase: TransitionPhase }> => ({
  isShowing: isShowing(state),
  transitionPhase: transitionPhaseOf(state),
})

// CHART

const showAnimated = (
  _state: State,
  _message: typeof Show.Type,
  props: Props,
) => isAnimatedOf(props)

const hideAnimated = (
  _state: State,
  _message: typeof Hide.Type,
  props: Props,
) => isAnimatedOf(props)

/**
 * Builds the Presence Machine chart starting in `initialState`: animated
 * enter/leave phases, instant non-animated open/close, interruptible
 * enter->leave and leave->enter reversals, and explicit ignore guards for
 * stale frame/animation events.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Closed: {
        on: {
          Hide: [ignore()],
          AdvanceFrame: [ignore()],
          EndAnimation: [ignore()],
        },
      },
      EnterStart: {
        on: {
          Show: [ignore()],
          AdvanceFrame: to('EnterAnimating', () => EnterAnimating()),
          EndAnimation: [ignore()],
        },
      },
      EnterAnimating: {
        on: {
          Show: [ignore()],
          AdvanceFrame: [ignore()],
          EndAnimation: to('Open', () => Open()),
        },
      },
      Open: {
        on: {
          Show: [ignore()],
          AdvanceFrame: [ignore()],
          EndAnimation: [ignore()],
        },
      },
      LeaveStart: {
        on: {
          Hide: [ignore()],
          AdvanceFrame: to('LeaveAnimating', () => LeaveAnimating()),
          EndAnimation: [ignore()],
        },
      },
      LeaveAnimating: {
        on: {
          Hide: [ignore()],
          AdvanceFrame: [ignore()],
          EndAnimation: to('Closed', () => Closed()),
        },
      },
    },
    shared: [
      forStates(['Closed', 'LeaveStart', 'LeaveAnimating']).on({
        Show: [
          when(showAnimated, 'EnterStart', () => EnterStart()),
          otherwise(to('Open', () => Open())),
        ],
      }),
      forStates(['Open', 'EnterStart', 'EnterAnimating']).on({
        Hide: [
          when(hideAnimated, 'LeaveStart', () => LeaveStart()),
          otherwise(to('Closed', () => Closed())),
        ],
      }),
    ],
  })

/**
 * The default Presence Machine chart starting in `Closed`: animated
 * enter/leave phases, instant non-animated open/close, interruptible
 * enter->leave and leave->enter reversals, and explicit ignore guards for
 * stale frame/animation events.
 *
 * @example
 * ```typescript
 * Presence.chart.transition(Presence.Closed(), Presence.Show(), { isAnimated: true })
 * // [EnterStart(), []]
 * Presence.chart.transition(Presence.Closed(), Presence.Show(), { isAnimated: false })
 * // [Open(), []]
 * ```
 */
export const chart = chartOf(initial)

// SYNC & REST

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  Show: pace,
  Hide: pace,
  AdvanceFrame: pace,
  EndAnimation: pace,
})

/** Default synchronization: every Presence Message syncs. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for Presence kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

/**
 * What a restart opens Presence on: settles any in-flight enter to `Open` and
 * any in-flight leave to `Closed` so a restored Model never hangs mid-animation.
 *
 * @example
 * ```typescript
 * atRest(Presence.EnterAnimating()) // Open()
 * atRest(Presence.LeaveStart()) // Closed()
 * ```
 */
export const atRest = (state: State): State =>
  isShowing(state) ? Open() : Closed()

// SLOTS & PROJECTION

/**
 * The three painted slots of a Presence Part:
 * - `Container`: the mounted animated region (`role="region"`, `aria-expanded`, `hidden` when unmounted).
 * - `ShowTrigger`: button revealing the presence container (`role="button"`, `Show`).
 * - `HideTrigger`: button hiding the presence container (`role="button"`, `Hide`).
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Container: {
    role: 'Region',
    focus: 'None',
    gestures: [],
  },
  ShowTrigger: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'Show' }],
  },
  HideTrigger: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'Hide' }],
  },
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  _maybeChoice: Option.Option<string>,
): SlotProps => {
  const baseId = props.id ?? defaultPresenceId
  const targetId = containerId(baseId)
  if (slot === 'Container') {
    const isHidden =
      props.animateSize === true ? isClosedForSize(state) : !isMounted(state)
    return {
      id: targetId,
      isExpanded: isShowing(state),
      ...(isHidden ? { isHidden: true } : {}),
      ...(props.label === undefined ? {} : { label: props.label }),
      ...(props.labelledBy === undefined
        ? {}
        : { labelledBy: props.labelledBy }),
    }
  } else if (slot === 'ShowTrigger') {
    return {
      id: `${baseId}-show`,
      controls: targetId,
      isExpanded: isShowing(state),
      tabIndex: 0,
    }
  } else if (slot === 'HideTrigger') {
    return {
      id: `${baseId}-hide`,
      controls: targetId,
      isExpanded: isShowing(state),
      tabIndex: 0,
    }
  } else {
    return {}
  }
}

// PART FACTORY

/** Options for customizing a Presence Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'`) to keep this Presence device-only. */
  sync?: 'Synced' | DeviceReason
  /** Initial visibility state for the Part's chart (`false` by default). */
  defaultOpen?: boolean
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Presence {@link Part.Part}. Synced by default
 * (`category: 'Navigation'`); pass `sync: 'OwnView'` (or use
 * {@link deviceOnly}) to keep a Program's Presence local to one device.
 *
 * @example
 * ```typescript
 * const BannerPresence = Presence.make({ name: 'BannerPresence' })
 * const LocalPresence = Presence.deviceOnly({ name: 'LocalPresence' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> =>
  Part.define<State, Message, Props>({
    name: options.name ?? 'Presence',
    State,
    Message,
    chart: options.defaultOpen === true ? chartOf(Open()) : chart,
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

/**
 * Shorthand for a Presence Part whose state stays on the device and is omitted
 * from the synced log and encoded Model.
 */
export const deviceOnly = (
  options: Omit<MakeOptions, 'sync'> &
    Readonly<{ because?: DeviceReason }> = {},
): Part.Part<State, Message, Props> =>
  make({
    ...(options.name === undefined ? {} : { name: options.name }),
    ...(options.category === undefined ? {} : { category: options.category }),
    ...(options.defaultOpen === undefined
      ? {}
      : { defaultOpen: options.defaultOpen }),
    ...(options.configuration === undefined
      ? {}
      : { configuration: options.configuration }),
    sync: options.because ?? 'OwnView',
  })

/** The default synced Presence Part (`name: 'Presence'`, `category: 'Navigation'`). */
export const part: Part.Part<State, Message, Props> = make()
