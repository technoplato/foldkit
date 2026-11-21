import { Array, Option, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import * as Command from '../command/index.js'
import { define, ignore, when } from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import * as HoverIntent from './hoverIntent.js'
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'
import * as Part from './part.js'
import * as Placement from './placement.js'
import type { SlotProps } from './slot.js'
import * as TimedHint from './timedHint.js'

// NOTE: this is the core Tooltip Part (Widget #11 of 54, Scribe #2630).
// It composes `HoverIntent`, `Placement`, and `TimedHint` in one
// framework-free Machine and Part declaration covering packages/ui Tooltip,
// Zag tooltip, and Radix tooltip. Its state (`Closed` | `Open`) lives in the
// Model, synced by default (`Navigation` category, `Pace.Synced`) with a
// device-only option, and projects reference-stable SlotBindings (`Trigger`,
// `Content`) rendered by HTML, React, and React Native generic hosts with
// zero Tooltip-specific painter logic.

// CONSTANTS

/** Default pointer hover show delay in milliseconds (`500`, matching `@foldkit/ui` Tooltip). */
export const defaultShowDelayMs = 500

/** Default pointer departure close delay in milliseconds (`0`, immediate close). */
export const defaultCloseDelayMs = 0

// SCHEMAS

/** Optional placement spacing overrides for the Tooltip panel. */
export const PlacementOptions = S.Struct({
  gapPx: S.optionalKey(S.Number),
  edgePx: S.optionalKey(S.Number),
})
/** Optional placement spacing overrides for the Tooltip panel. */
export type PlacementOptions = typeof PlacementOptions.Type

/** Standard `data-state` attribute value (`'open' | 'closed'`). */
export const DataState = S.Literals(['open', 'closed'])
/** Standard `data-state` attribute value. */
export type DataState = typeof DataState.Type

/**
 * Read-only configuration supplied to the Tooltip chart and projection from
 * the Program's Model.
 */
export const Props = S.Struct({
  id: S.String,
  showDelayMs: S.optionalKey(S.Number),
  closeDelayMs: S.optionalKey(S.Number),
  autoHideMs: S.optionalKey(S.Number),
  isDisabled: S.optionalKey(S.Boolean),
  isInteractive: S.optionalKey(S.Boolean),
  label: S.optionalKey(S.String),
  labelledBy: S.optionalKey(S.String),
  placement: S.optionalKey(PlacementOptions),
})
/** Read-only configuration supplied to the Tooltip chart and projection. */
export type Props = typeof Props.Type

// STATE

/** The tooltip is hidden (either idle, counting down `showDelayMs`, or dismissed until disengage). */
export const Closed = ts('Closed', {
  intent: HoverIntent.State,
  hint: TimedHint.State,
})
/** The tooltip is hidden. */
export type Closed = typeof Closed.Type

/** The tooltip is visible (engaged, programmatically shown, or counting down `closeDelayMs`). */
export const Open = ts('Open', {
  intent: HoverIntent.State,
  hint: TimedHint.State,
})
/** The tooltip is visible. */
export type Open = typeof Open.Type

/** Where a Tooltip Part stands: `Closed` or `Open`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Closed, Open])
/** Where a Tooltip Part stands. */
export type State = typeof State.Type

/** Initial Tooltip state: closed with fresh `HoverIntent` and `TimedHint` states. */
export const initial: State = Closed({
  intent: HoverIntent.initial,
  hint: TimedHint.initial,
})

// ACTIONS (Catalog Actions — what a person or agent does on purpose)

/** Reveals the tooltip immediately without waiting for `showDelayMs`. */
export const ShowTooltip = Catalog.action('ShowTooltip', {
  what: 'Reveals the tooltip content',
  why: 'To read supplemental guidance for the control',
  meta: { label: 'Show tooltip', keys: [] },
})

/** Hides the visible tooltip immediately. */
export const HideTooltip = Catalog.action('HideTooltip', {
  what: 'Hides the visible tooltip content',
  why: 'To clear supplemental guidance from view',
  meta: { label: 'Hide tooltip', keys: [] },
})

/** The Catalog Actions a Tooltip Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  ShowTooltip,
  HideTooltip,
]

// MESSAGES (Facts in addition to the Actions above)

/** Pointer entered the tooltip trigger element. */
export const EnterTooltipTrigger = m('EnterTooltipTrigger')

/** Pointer left the tooltip trigger element. */
export const LeaveTooltipTrigger = m('LeaveTooltipTrigger')

/** Pointer entered the tooltip panel (honored when `isInteractive` is true). */
export const EnterTooltipPanel = m('EnterTooltipPanel')

/** Pointer left the tooltip panel. */
export const LeaveTooltipPanel = m('LeaveTooltipPanel')

/** Focus moved onto the tooltip trigger element. */
export const FocusTooltipTrigger = m('FocusTooltipTrigger')

/** Focus left the tooltip trigger element. */
export const BlurTooltipTrigger = m('BlurTooltipTrigger')

/** Focus moved into the tooltip panel (honored when `isInteractive` is true). */
export const FocusTooltipPanel = m('FocusTooltipPanel')

/** Focus left the tooltip panel. */
export const BlurTooltipPanel = m('BlurTooltipPanel')

/** Pointer pressed down on the tooltip trigger; recorded to distinguish mouse focus from keyboard/touch/pen focus. */
export const PressTooltipPointer = m('PressTooltipPointer', {
  pointerType: S.String,
})

/** Escape was pressed, dismissing the tooltip and suppressing reopen until disengage. */
export const PressTooltipEscape = m('PressTooltipEscape')

/** The scheduled hover show delay elapsed for `version`. */
export const ElapsedTooltipShow = m('ElapsedTooltipShow', {
  version: S.Number,
})

/** The scheduled departure close delay elapsed for `version`. */
export const ElapsedTooltipClose = m('ElapsedTooltipClose', {
  version: S.Number,
})

/** The optional `autoHideMs` countdown elapsed for `version`. */
export const ElapsedTooltipAutoHide = m('ElapsedTooltipAutoHide', {
  version: S.Number,
})

/** Every Message the Tooltip chart handles. */
export const Message = S.Union([
  ShowTooltip,
  HideTooltip,
  EnterTooltipTrigger,
  LeaveTooltipTrigger,
  EnterTooltipPanel,
  LeaveTooltipPanel,
  FocusTooltipTrigger,
  BlurTooltipTrigger,
  FocusTooltipPanel,
  BlurTooltipPanel,
  PressTooltipPointer,
  PressTooltipEscape,
  ElapsedTooltipShow,
  ElapsedTooltipClose,
  ElapsedTooltipAutoHide,
])
/** Every Message the Tooltip chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Tooltip Part. */
export const isMessage = S.is(Message)

// COMMANDS

/** Waits `afterMs` milliseconds and answers `ElapsedTooltipShow({ version })`. */
export const WaitForTooltipShow = Command.define(
  'WaitForTooltipShow',
  { version: S.Number, afterMs: S.Number },
  ElapsedTooltipShow,
)(({ version, afterMs }) =>
  Command.answerAfter(afterMs, ElapsedTooltipShow({ version })),
)

/** Waits `afterMs` milliseconds and answers `ElapsedTooltipClose({ version })`. */
export const WaitForTooltipClose = Command.define(
  'WaitForTooltipClose',
  { version: S.Number, afterMs: S.Number },
  ElapsedTooltipClose,
)(({ version, afterMs }) =>
  Command.answerAfter(afterMs, ElapsedTooltipClose({ version })),
)

/** Waits `afterMs` milliseconds and answers `ElapsedTooltipAutoHide({ version })`. */
export const WaitForTooltipAutoHide = Command.define(
  'WaitForTooltipAutoHide',
  { version: S.Number, afterMs: S.Number },
  ElapsedTooltipAutoHide,
)(({ version, afterMs }) =>
  Command.answerAfter(afterMs, ElapsedTooltipAutoHide({ version })),
)

// ELEMENT IDS (shared by chart and thin painters such as @foldkit/ui Tooltip)

/** Derives the trigger element id from a Tooltip's base `id` (`${id}-trigger`). */
export const triggerId = (id: string): string => `${id}-trigger`

/** Derives the floating panel element id from a Tooltip's base `id` (`${id}-panel`). */
export const panelId = (id: string): string => `${id}-panel`

/** Alias for {@link panelId}: derives the tooltip content element id (`${id}-panel`). */
export const contentId = (id: string): string => panelId(id)

// PURE RULES & READINGS

/** Resolved hover show delay in milliseconds (defaults to `500`, clamped to `>= 0`). */
export const showDelayMsOf = (props: Pick<Props, 'showDelayMs'>): number =>
  Math.max(0, props.showDelayMs ?? defaultShowDelayMs)

/** Resolved departure close delay in milliseconds (defaults to `0`, clamped to `>= 0`). */
export const closeDelayMsOf = (props: Pick<Props, 'closeDelayMs'>): number =>
  Math.max(0, props.closeDelayMs ?? defaultCloseDelayMs)

/** Optional auto-hide duration in milliseconds (none by default). */
export const autoHideMsOf = (
  props: Pick<Props, 'autoHideMs'>,
): Option.Option<number> =>
  Option.filter(Option.fromNullishOr(props.autoHideMs), ms => ms >= 0)

/** True when the Tooltip trigger is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'>): boolean =>
  props.isDisabled === true

/** True when hovering or focusing the tooltip panel keeps it open (`false` by default). */
export const isInteractiveOf = (props: Pick<Props, 'isInteractive'>): boolean =>
  props.isInteractive === true

/** True when `key` is `'Escape'`. */
export const isEscapeKey = HoverIntent.isEscapeKey

/**
 * Places a Tooltip panel by its anchor using `Placement.place`, applying any
 * `gapPx` and `edgePx` configured in `props.placement`.
 *
 * @example
 * ```typescript
 * placeFor(props, { anchor, size, view }) // { left, top, side }
 * ```
 */
export const placeFor = (
  props: Pick<Props, 'placement'>,
  geometry: Readonly<{
    anchor: Placement.Rect
    size: Placement.Size
    view: Placement.Size
  }>,
): Placement.Placed =>
  Placement.place({
    ...geometry,
    ...(props.placement?.gapPx === undefined
      ? {}
      : { gapPx: props.placement.gapPx }),
    ...(props.placement?.edgePx === undefined
      ? {}
      : { edgePx: props.placement.edgePx }),
  })

/** True when the Tooltip is visible. */
export const isOpen = (state: State): boolean => state._tag === 'Open'

/** True while waiting for `showDelayMs` before opening. */
export const isOpening = (state: State): boolean =>
  HoverIntent.isOpening(state.intent)

/** True while visible and counting down `closeDelayMs` before closing. */
export const isClosing = (state: State): boolean =>
  HoverIntent.isClosing(state.intent)

/** True while pointer hover or affirming focus engages the trigger or panel. */
export const isEngaged = (state: State): boolean =>
  HoverIntent.isEngaged(state.intent)

/** True while Escape dismissal suppresses reopening until full disengage. */
export const isDismissed = (state: State): boolean => state.intent.isDismissed

/** True while the pointer is hovering over the trigger. */
export const isTriggerHovered = (state: State): boolean =>
  state.intent.isTriggerHovered

/** True while the pointer is hovering over the panel. */
export const isPanelHovered = (state: State): boolean =>
  state.intent.isPanelHovered

/** Where affirming focus currently sits (`Some('Trigger' | 'Panel')` or `None`). */
export const focusLocationOf = (
  state: State,
): Option.Option<HoverIntent.FocusLocation> => state.intent.maybeFocusLocation

/** Most recent recorded pointer type on the trigger, if any. */
export const lastPointerTypeOf = (state: State): Option.Option<string> =>
  state.intent.maybeLastPointerType

/** Current monotonic open-delay version counter. */
export const openVersionOf = (state: State): number => state.intent.openVersion

/** Current monotonic close-delay version counter. */
export const closeVersionOf = (state: State): number =>
  state.intent.closeVersion

/** Current monotonic auto-hide version counter from `TimedHint`. */
export const autoHideVersionOf = (state: State): number =>
  TimedHint.versionOf(state.hint)

/** Standard `data-state` attribute value (`'open' | 'closed'`). */
export const dataStateOf = (state: State): DataState =>
  isOpen(state) ? 'open' : 'closed'

// INTERNAL TRANSITION HELPERS

type StepResult = Readonly<{
  model: State
  commands: ReadonlyArray<Command.Command<Message>>
}>

const hoverIntentPropsOf = (props: Props): HoverIntent.Props => ({
  openDelayMs: showDelayMsOf(props),
  closeDelayMs: closeDelayMsOf(props),
  isInteractive: isInteractiveOf(props),
})

const translateIntentCommands = (
  intentMessage: HoverIntent.Message,
  nextIntent: HoverIntent.State,
  intentCommands: ReadonlyArray<Command.Command<HoverIntent.Message>>,
  props: Props,
): ReadonlyArray<Command.Command<Message>> => {
  const openCommands: ReadonlyArray<Command.Command<Message>> = Array.some(
    intentCommands,
    command => command.name === HoverIntent.WaitBeforeOpening.name,
  )
    ? [
        WaitForTooltipShow({
          version: nextIntent.openVersion,
          afterMs: showDelayMsOf(props),
        }),
      ]
    : []
  const closeCommands: ReadonlyArray<Command.Command<Message>> = Array.some(
    intentCommands,
    command => command.name === HoverIntent.WaitBeforeClosing.name,
  )
    ? [
        WaitForTooltipClose({
          version: nextIntent.closeVersion,
          afterMs: HoverIntent.closeWaitDelayMsOf(
            intentMessage,
            hoverIntentPropsOf(props),
          ),
        }),
      ]
    : []
  return [...openCommands, ...closeCommands]
}

const translateHintCommands = (
  nextHint: TimedHint.State,
  hintCommands: ReadonlyArray<Command.Command<TimedHint.Message>>,
): ReadonlyArray<Command.Command<Message>> =>
  Array.isReadonlyArrayNonEmpty(hintCommands)
    ? Option.match(TimedHint.durationMsOf(nextHint), {
        onNone: () => [],
        onSome: afterMs => [
          WaitForTooltipAutoHide({
            version: TimedHint.versionOf(nextHint),
            afterMs,
          }),
        ],
      })
    : []

const stepIntent = (
  state: State,
  intentMessage: HoverIntent.Message,
  props: Props,
): Option.Option<StepResult> => {
  const stepped = HoverIntent.chart.step(
    state.intent,
    intentMessage,
    hoverIntentPropsOf(props),
  )
  if (stepped._tag !== 'Transitioned') {
    return Option.none()
  }
  const nextIntent = stepped.state
  const intentCommands = translateIntentCommands(
    intentMessage,
    nextIntent,
    stepped.commands,
    props,
  )
  const wasOpen = state._tag === 'Open'
  const nowOpen = HoverIntent.isOpen(nextIntent)

  if (!wasOpen && nowOpen) {
    const [nextHint, hintCommands] = TimedHint.chart.transition(
      state.hint,
      TimedHint.ShowHint({ maybeDurationMs: autoHideMsOf(props) }),
    )
    return Option.some({
      model: Open({ intent: nextIntent, hint: nextHint }),
      commands: [
        ...intentCommands,
        ...translateHintCommands(nextHint, hintCommands),
      ],
    })
  } else if (wasOpen && !nowOpen) {
    const [nextHint] = TimedHint.chart.transition(
      state.hint,
      TimedHint.DismissHint(),
    )
    return Option.some({
      model: Closed({ intent: nextIntent, hint: nextHint }),
      commands: intentCommands,
    })
  } else if (nowOpen) {
    return Option.some({
      model: Open({ intent: nextIntent, hint: state.hint }),
      commands: intentCommands,
    })
  } else {
    return Option.some({
      model: Closed({ intent: nextIntent, hint: state.hint }),
      commands: intentCommands,
    })
  }
}

const stepToOpen = (
  state: State,
  intentMessage: HoverIntent.Message,
  props: Props,
): Option.Option<
  Readonly<{ model: Open; commands: ReadonlyArray<Command.Command<Message>> }>
> =>
  Option.flatMap(stepIntent(state, intentMessage, props), result =>
    result.model._tag === 'Open'
      ? Option.some({ model: result.model, commands: result.commands })
      : Option.none(),
  )

const stepToClosed = (
  state: State,
  intentMessage: HoverIntent.Message,
  props: Props,
): Option.Option<
  Readonly<{ model: Closed; commands: ReadonlyArray<Command.Command<Message>> }>
> =>
  Option.flatMap(stepIntent(state, intentMessage, props), result =>
    result.model._tag === 'Closed'
      ? Option.some({ model: result.model, commands: result.commands })
      : Option.none(),
  )

const stepAutoHide = (
  state: Open,
  version: number,
  props: Props,
): Option.Option<Closed> => {
  const steppedHint = TimedHint.chart.step(
    state.hint,
    TimedHint.ElapsedHint({ version }),
  )
  if (steppedHint._tag !== 'Transitioned') {
    return Option.none()
  }
  const [nextIntent] = HoverIntent.chart.transition(
    state.intent,
    HoverIntent.HideNow(),
    hoverIntentPropsOf(props),
  )
  return Option.some(Closed({ intent: nextIntent, hint: steppedHint.state }))
}

// CHART

/**
 * The Tooltip Machine chart: composes `HoverIntent` for hover open/close
 * delays, interactive panel engagement, pointer-type focus discrimination, and
 * Escape dismissal until disengage, together with `TimedHint` for optional
 * auto-hide durations.
 */
export const chart = define({ state: State, message: Message, context: Props })(
  {
    initial,
    states: {
      Closed: {
        on: {
          ShowTooltip: [
            when(
              (state, _message, context) =>
                isDisabledOf(context)
                  ? Option.none()
                  : stepToOpen(state, HoverIntent.ShowNow(), context),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          HideTooltip: [ignore()],
          EnterTooltipTrigger: [
            when(
              (state, _message, context) =>
                isDisabledOf(context)
                  ? Option.none()
                  : stepToOpen(state, HoverIntent.EnteredTrigger(), context),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            when(
              (state, _message, context) =>
                isDisabledOf(context)
                  ? Option.none()
                  : stepToClosed(state, HoverIntent.EnteredTrigger(), context),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          LeaveTooltipTrigger: [
            when(
              (state, _message, context) =>
                stepToClosed(state, HoverIntent.LeftTrigger(), context),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          EnterTooltipPanel: [
            when(
              (state, _message, context) =>
                isDisabledOf(context)
                  ? Option.none()
                  : stepToOpen(state, HoverIntent.EnteredPanel(), context),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            when(
              (state, _message, context) =>
                isDisabledOf(context)
                  ? Option.none()
                  : stepToClosed(state, HoverIntent.EnteredPanel(), context),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          LeaveTooltipPanel: [
            when(
              (state, _message, context) =>
                stepToClosed(state, HoverIntent.LeftPanel(), context),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          FocusTooltipTrigger: [
            when(
              (state, _message, context) =>
                isDisabledOf(context)
                  ? Option.none()
                  : stepToOpen(state, HoverIntent.FocusedTrigger(), context),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            when(
              (state, _message, context) =>
                isDisabledOf(context)
                  ? Option.none()
                  : stepToClosed(state, HoverIntent.FocusedTrigger(), context),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          BlurTooltipTrigger: [
            when(
              (state, _message, context) =>
                stepToClosed(state, HoverIntent.BlurredTrigger(), context),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          FocusTooltipPanel: [
            when(
              (state, _message, context) =>
                isDisabledOf(context)
                  ? Option.none()
                  : stepToOpen(state, HoverIntent.FocusedPanel(), context),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            when(
              (state, _message, context) =>
                isDisabledOf(context)
                  ? Option.none()
                  : stepToClosed(state, HoverIntent.FocusedPanel(), context),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          BlurTooltipPanel: [
            when(
              (state, _message, context) =>
                stepToClosed(state, HoverIntent.BlurredPanel(), context),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          PressTooltipPointer: [
            when(
              (state, message, context) =>
                isDisabledOf(context)
                  ? Option.none()
                  : stepToClosed(
                      state,
                      HoverIntent.PressedPointer({
                        pointerType: message.pointerType,
                      }),
                      context,
                    ),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          PressTooltipEscape: [
            when(
              (state, _message, context) =>
                stepToClosed(state, HoverIntent.PressedEscape(), context),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          ElapsedTooltipShow: [
            when(
              (state, message, context) =>
                isDisabledOf(context)
                  ? Option.none()
                  : stepToOpen(
                      state,
                      HoverIntent.ElapsedOpen({ version: message.version }),
                      context,
                    ),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          ElapsedTooltipClose: [ignore()],
          ElapsedTooltipAutoHide: [ignore()],
        },
      },
      Open: {
        on: {
          ShowTooltip: [ignore()],
          HideTooltip: [
            when(
              (state, _message, context) =>
                stepToClosed(state, HoverIntent.HideNow(), context),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          EnterTooltipTrigger: [
            when(
              (state, _message, context) =>
                stepToOpen(state, HoverIntent.EnteredTrigger(), context),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          LeaveTooltipTrigger: [
            when(
              (state, _message, context) =>
                stepToClosed(state, HoverIntent.LeftTrigger(), context),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            when(
              (state, _message, context) =>
                stepToOpen(state, HoverIntent.LeftTrigger(), context),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          EnterTooltipPanel: [
            when(
              (state, _message, context) =>
                stepToOpen(state, HoverIntent.EnteredPanel(), context),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          LeaveTooltipPanel: [
            when(
              (state, _message, context) =>
                stepToClosed(state, HoverIntent.LeftPanel(), context),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            when(
              (state, _message, context) =>
                stepToOpen(state, HoverIntent.LeftPanel(), context),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          FocusTooltipTrigger: [
            when(
              (state, _message, context) =>
                stepToOpen(state, HoverIntent.FocusedTrigger(), context),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          BlurTooltipTrigger: [
            when(
              (state, _message, context) =>
                stepToClosed(state, HoverIntent.BlurredTrigger(), context),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            when(
              (state, _message, context) =>
                stepToOpen(state, HoverIntent.BlurredTrigger(), context),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          FocusTooltipPanel: [
            when(
              (state, _message, context) =>
                stepToOpen(state, HoverIntent.FocusedPanel(), context),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          BlurTooltipPanel: [
            when(
              (state, _message, context) =>
                stepToClosed(state, HoverIntent.BlurredPanel(), context),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            when(
              (state, _message, context) =>
                stepToOpen(state, HoverIntent.BlurredPanel(), context),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          PressTooltipPointer: [
            when(
              (state, message, context) =>
                stepToOpen(
                  state,
                  HoverIntent.PressedPointer({
                    pointerType: message.pointerType,
                  }),
                  context,
                ),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          PressTooltipEscape: [
            when(
              (state, _message, context) =>
                stepToClosed(state, HoverIntent.PressedEscape(), context),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          ElapsedTooltipShow: [ignore()],
          ElapsedTooltipClose: [
            when(
              (state, message, context) =>
                stepToClosed(
                  state,
                  HoverIntent.ElapsedClose({ version: message.version }),
                  context,
                ),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          ElapsedTooltipAutoHide: [
            when(
              (state, message, context) =>
                stepAutoHide(state, message.version, context),
              'Closed',
              ({ guardValue }) => guardValue,
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
  ShowTooltip: pace,
  HideTooltip: pace,
  EnterTooltipTrigger: pace,
  LeaveTooltipTrigger: pace,
  EnterTooltipPanel: pace,
  LeaveTooltipPanel: pace,
  FocusTooltipTrigger: pace,
  BlurTooltipTrigger: pace,
  FocusTooltipPanel: pace,
  BlurTooltipPanel: pace,
  PressTooltipPointer: pace,
  PressTooltipEscape: pace,
  ElapsedTooltipShow: pace,
  ElapsedTooltipClose: pace,
  ElapsedTooltipAutoHide: pace,
})

/** Default synchronization: every Tooltip Message syncs. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a Tooltip kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/** The two painted slots of a Tooltip Part: `Trigger` and `Content`. */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Trigger: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'HeldLong', becomes: 'ShowTooltip' }],
  },
  Content: {
    role: 'Tooltip',
    focus: 'None',
    gestures: [],
  },
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  _maybeChoice: Option.Option<string>,
): SlotProps => {
  if (slot === 'Trigger') {
    const labelProps =
      props.label !== undefined
        ? { label: props.label }
        : props.labelledBy !== undefined
          ? { labelledBy: props.labelledBy }
          : {}
    return {
      id: triggerId(props.id),
      ...labelProps,
      ...(isOpen(state) ? { describedBy: contentId(props.id) } : {}),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
    }
  } else if (slot === 'Content') {
    return {
      role: 'Tooltip',
      id: contentId(props.id),
      ...(isOpen(state) ? {} : { isHidden: true }),
    }
  } else {
    return {}
  }
}

/** What a restart opens a Tooltip on: closed and unengaged while keeping monotonic version counters. */
export const atRest = (state: State): State =>
  Closed({
    intent: HoverIntent.atRest(state.intent),
    hint: TimedHint.atRest(state.hint),
  })

// PART FACTORY

/** Options for customizing a Tooltip Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'`) to keep this Tooltip device-only. */
  sync?: 'Synced' | DeviceReason
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Tooltip {@link Part.Part}. Synced by default
 * (`category: 'Navigation'`, `Pace.Synced`); pass `sync: 'OwnView'` (or use
 * {@link deviceOnly}) to keep a Program's Tooltip local to one device.
 *
 * @example
 * ```typescript
 * const HelpTooltip = Tooltip.make({ name: 'HelpTooltip' })
 * const LocalTooltip = Tooltip.make({ name: 'LocalTooltip', sync: 'OwnView' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> =>
  Part.define<State, Message, Props>({
    name: options.name ?? 'Tooltip',
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

/** Default synced Tooltip {@link Part.Part} (`category: 'Navigation'`). */
export const part: Part.Part<State, Message, Props> = make()

/** Creates a device-only Tooltip {@link Part.Part} (`Device({ because })`, defaulting to `'OwnView'`). */
export const deviceOnly = (
  options: Omit<MakeOptions, 'sync'> &
    Readonly<{ because?: DeviceReason }> = {},
): Part.Part<State, Message, Props> =>
  make({
    ...(options.name === undefined ? {} : { name: options.name }),
    ...(options.category === undefined ? {} : { category: options.category }),
    ...(options.configuration === undefined
      ? {}
      : { configuration: options.configuration }),
    sync: options.because ?? 'OwnView',
  })
