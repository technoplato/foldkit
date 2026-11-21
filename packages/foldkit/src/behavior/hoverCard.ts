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

// NOTE: this is the core HoverCard Part (Widget #27 of 54, Scribe #2666). It
// composes `Placement` and `HoverIntent` (`isInteractive: true` by default)
// into one framework-free Machine and Part declaration covering Zag hover-card
// and Radix hover-card: configurable open/close delays (700 ms / 300 ms
// defaults), interactive panel engagement, safe-triangle pointer-corridor
// protection while moving from trigger to panel, keyboard focus / Escape
// dismissal, and anchor placement via `placeFor`. Its state (`Closed` | `Open`)
// lives in the Model, synced by default (`Navigation` category, `Pace.Synced`)
// with `HoverCard.make` and `HoverCard.deviceOnly()`, and projects
// reference-stable `SlotBindings` (`Trigger`, `Content`).

// CONSTANTS

/** Default pointer hover open delay in milliseconds (`700`, matching Radix HoverCard). */
export const defaultOpenDelayMs = 700

/** Default pointer departure close delay in milliseconds (`300`, matching Radix and Zag HoverCard). */
export const defaultCloseDelayMs = 300

/** Default lateral padding in pixels applied to the safe-triangle pointer corridor (`5`). */
export const defaultCorridorPaddingPx: number =
  HoverIntent.defaultCorridorPaddingPx

// SCHEMAS

/** Optional placement spacing overrides for the HoverCard panel. */
export const PlacementOptions = S.Struct({
  gapPx: S.optionalKey(S.Number),
  edgePx: S.optionalKey(S.Number),
})
/** Optional placement spacing overrides for the HoverCard panel. */
export type PlacementOptions = typeof PlacementOptions.Type

/** Standard `data-state` attribute value (`'open' | 'closed'`). */
export const DataState = S.Literals(['open', 'closed'])
/** Standard `data-state` attribute value. */
export type DataState = typeof DataState.Type

/**
 * Read-only configuration supplied to the HoverCard chart and projection from
 * the Program's Model.
 */
export const Props = S.Struct({
  id: S.String,
  openDelayMs: S.optionalKey(S.Number),
  closeDelayMs: S.optionalKey(S.Number),
  isDisabled: S.optionalKey(S.Boolean),
  isInteractive: S.optionalKey(S.Boolean),
  corridorPaddingPx: S.optionalKey(S.Number),
  label: S.optionalKey(S.String),
  labelledBy: S.optionalKey(S.String),
  placement: S.optionalKey(PlacementOptions),
})
/** Read-only configuration supplied to the HoverCard chart and projection. */
export type Props = typeof Props.Type

// STATE

/** The hover card is hidden (idle, counting down `openDelayMs`, or dismissed until full disengage). */
export const Closed = ts('Closed', {
  intent: HoverIntent.State,
})
/** The hover card is hidden. */
export type Closed = typeof Closed.Type

/** The hover card is visible (engaged, programmatically opened, or counting down `closeDelayMs`). */
export const Open = ts('Open', {
  intent: HoverIntent.State,
})
/** The hover card is visible. */
export type Open = typeof Open.Type

/** Where a HoverCard Part stands: `Closed` or `Open`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Closed, Open])
/** Where a HoverCard Part stands. */
export type State = typeof State.Type

/** Initial HoverCard state: closed with a fresh `HoverIntent` state. */
export const initial: State = Closed({
  intent: HoverIntent.initial,
})

// ACTIONS

/** Reveals the hover card content immediately without waiting for `openDelayMs`. */
export const OpenHoverCard = Catalog.action('OpenHoverCard', {
  what: 'Reveals the hover card content',
  why: 'To inspect a preview of the referenced subject',
  meta: { label: 'Open hover card', keys: [] },
})

/** Hides the visible hover card content immediately. */
export const CloseHoverCard = Catalog.action('CloseHoverCard', {
  what: 'Hides the visible hover card content',
  why: 'To clear the preview from view',
  meta: { label: 'Close hover card', keys: [] },
})

/** The Catalog Actions a HoverCard Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  OpenHoverCard,
  CloseHoverCard,
]

// MESSAGES

/** Pointer entered the hover card trigger element. */
export const EnterHoverCardTrigger = m('EnterHoverCardTrigger', {
  pointerType: S.optionalKey(S.String),
})

/** Pointer left the hover card trigger element. */
export const LeaveHoverCardTrigger = m('LeaveHoverCardTrigger', {
  pointerType: S.optionalKey(S.String),
})

/** Pointer entered the hover card content panel. */
export const EnterHoverCardPanel = m('EnterHoverCardPanel', {
  pointerType: S.optionalKey(S.String),
})

/** Pointer left the hover card content panel. */
export const LeaveHoverCardPanel = m('LeaveHoverCardPanel', {
  pointerType: S.optionalKey(S.String),
})

/** Focus moved onto the hover card trigger element. */
export const FocusHoverCardTrigger = m('FocusHoverCardTrigger')

/** Focus left the hover card trigger element. */
export const BlurHoverCardTrigger = m('BlurHoverCardTrigger')

/** Focus moved into the hover card content panel. */
export const FocusHoverCardPanel = m('FocusHoverCardPanel')

/** Focus left the hover card content panel. */
export const BlurHoverCardPanel = m('BlurHoverCardPanel')

/** Pointer pressed down on the hover card trigger, distinguishing mouse focus from keyboard/touch/pen focus. */
export const PressHoverCardPointer = m('PressHoverCardPointer', {
  pointerType: S.String,
})

/**
 * Pointer moved from `origin` to `point` relative to `panelRect` while leaving
 * the trigger; extends the close grace period while moving within the safe
 * triangle toward the interactive card panel.
 */
export const MovedHoverCardPointer = m('MovedHoverCardPointer', {
  origin: HoverIntent.Point,
  point: HoverIntent.Point,
  panelRect: Placement.Rect,
})

/** Escape was pressed, dismissing the hover card and suppressing reopen until full disengage. */
export const PressHoverCardEscape = m('PressHoverCardEscape')

/** A scheduled open delay elapsed for `version`. */
export const ElapsedHoverCardOpen = m('ElapsedHoverCardOpen', {
  version: S.Number,
})

/** A scheduled close delay elapsed for `version`. */
export const ElapsedHoverCardClose = m('ElapsedHoverCardClose', {
  version: S.Number,
})

/** Every Message the HoverCard chart handles. */
export const Message = S.Union([
  OpenHoverCard,
  CloseHoverCard,
  EnterHoverCardTrigger,
  LeaveHoverCardTrigger,
  EnterHoverCardPanel,
  LeaveHoverCardPanel,
  FocusHoverCardTrigger,
  BlurHoverCardTrigger,
  FocusHoverCardPanel,
  BlurHoverCardPanel,
  PressHoverCardPointer,
  MovedHoverCardPointer,
  PressHoverCardEscape,
  ElapsedHoverCardOpen,
  ElapsedHoverCardClose,
])
/** Every Message the HoverCard chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the HoverCard Part. */
export const isMessage = S.is(Message)

// COMMANDS

/** Waits `afterMs` milliseconds and answers `ElapsedHoverCardOpen({ version })`. */
export const WaitForHoverCardOpen = Command.define(
  'WaitForHoverCardOpen',
  { version: S.Number, afterMs: S.Number },
  ElapsedHoverCardOpen,
)(({ version, afterMs }) =>
  Command.answerAfter(afterMs, ElapsedHoverCardOpen({ version })),
)

/** Waits `afterMs` milliseconds and answers `ElapsedHoverCardClose({ version })`. */
export const WaitForHoverCardClose = Command.define(
  'WaitForHoverCardClose',
  { version: S.Number, afterMs: S.Number },
  ElapsedHoverCardClose,
)(({ version, afterMs }) =>
  Command.answerAfter(afterMs, ElapsedHoverCardClose({ version })),
)

// ELEMENT IDS

/** Derives the trigger element id from a HoverCard base `id` (`${id}-trigger`). */
export const triggerId = (id: string): string => `${id}-trigger`

/** Derives the floating card content element id from a HoverCard base `id` (`${id}-content`). */
export const contentId = (id: string): string => `${id}-content`

// PURE RULES & READINGS

/** Resolved hover open delay in milliseconds (defaults to `700`, clamped to `>= 0`). */
export const openDelayMsOf = (props: Pick<Props, 'openDelayMs'> = {}): number =>
  Math.max(0, props.openDelayMs ?? defaultOpenDelayMs)

/** Resolved departure close delay in milliseconds (defaults to `300`, clamped to `>= 0`). */
export const closeDelayMsOf = (
  props: Pick<Props, 'closeDelayMs'> = {},
): number => Math.max(0, props.closeDelayMs ?? defaultCloseDelayMs)

/** True when the HoverCard trigger is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/** True when hovering or focusing the card content keeps it open (`true` by default for HoverCard). */
export const isInteractiveOf = (
  props: Pick<Props, 'isInteractive'> = {},
): boolean => props.isInteractive ?? true

/** Resolved safe-triangle corridor lateral padding in pixels (`5` by default). */
export const corridorPaddingPxOf = (
  props: Pick<Props, 'corridorPaddingPx'> = {},
): number => Math.max(0, props.corridorPaddingPx ?? defaultCorridorPaddingPx)

/** True when `key` is `'Escape'`. */
export const isEscapeKey = HoverIntent.isEscapeKey

/**
 * Builds the safe-triangle vertices spanning the silhouette of `panelRect`
 * from `origin`, delegating to `HoverIntent.safeTriangleOf`.
 */
export const safeTriangleOf = HoverIntent.safeTriangleOf

/**
 * True when a pointer moving from `origin` to `point` stays inside `panelRect`
 * or within the safe triangle pointing toward `panelRect`.
 *
 * @example
 * ```typescript
 * const panel = { left: 110, top: 60, width: 220, height: 180 }
 * isInSafeCorridor({ x: 100, y: 115 }, { x: 106, y: 90 }, panel) // true
 * ```
 */
export const isInSafeCorridor = (
  origin: HoverIntent.Point,
  point: HoverIntent.Point,
  panelRect: Placement.Rect,
  paddingPx: number = defaultCorridorPaddingPx,
): boolean =>
  HoverIntent.isMovingTowardPanel(origin, point, panelRect, paddingPx)

/**
 * Places a HoverCard content panel by its anchor using `Placement.place`,
 * applying any `gapPx` and `edgePx` configured in `props.placement`.
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

/** True when the HoverCard is visible. */
export const isOpen = (state: State): boolean => state._tag === 'Open'

/** True while waiting for `openDelayMs` before opening. */
export const isOpening = (state: State): boolean =>
  HoverIntent.isOpening(state.intent)

/** True while visible and counting down `closeDelayMs` before closing. */
export const isClosing = (state: State): boolean =>
  HoverIntent.isClosing(state.intent)

/** True while pointer hover or affirming focus engages the trigger or content panel. */
export const isEngaged = (state: State): boolean =>
  HoverIntent.isEngaged(state.intent)

/** True while Escape dismissal suppresses reopening until full disengage. */
export const isDismissed = (state: State): boolean => state.intent.isDismissed

/** True while the pointer is hovering over the trigger. */
export const isTriggerHovered = (state: State): boolean =>
  state.intent.isTriggerHovered

/** True while the pointer is hovering over the content panel. */
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

/** Standard `data-state` attribute value (`'open' | 'closed'`). */
export const dataStateOf = (state: State): DataState =>
  isOpen(state) ? 'open' : 'closed'

// INTERNAL TRANSITION HELPERS

type StepResult = Readonly<{
  model: State
  commands: ReadonlyArray<Command.Command<Message>>
}>

const hoverPointerArg = (
  pointerType?: string,
): Readonly<{ pointerType: string }> | undefined =>
  pointerType === undefined ? undefined : { pointerType }

const hoverIntentPropsOf = (props: Props): HoverIntent.Props => ({
  openDelayMs: openDelayMsOf(props),
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
        WaitForHoverCardOpen({
          version: nextIntent.openVersion,
          afterMs: openDelayMsOf(props),
        }),
      ]
    : []
  const closeCommands: ReadonlyArray<Command.Command<Message>> = Array.some(
    intentCommands,
    command => command.name === HoverIntent.WaitBeforeClosing.name,
  )
    ? [
        WaitForHoverCardClose({
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
  const commands = translateIntentCommands(
    intentMessage,
    nextIntent,
    stepped.commands,
    props,
  )
  return HoverIntent.isOpen(nextIntent)
    ? Option.some({ model: Open({ intent: nextIntent }), commands })
    : Option.some({ model: Closed({ intent: nextIntent }), commands })
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

const extendCorridorClose = (
  state: Open,
  props: Props,
): Readonly<{
  model: Open
  commands: ReadonlyArray<Command.Command<Message>>
}> => {
  const version = TimedHint.nextVersion(state.intent.closeVersion)
  const nextIntent = HoverIntent.Closing({
    isTriggerHovered: state.intent.isTriggerHovered,
    isPanelHovered: state.intent.isPanelHovered,
    maybeFocusLocation: state.intent.maybeFocusLocation,
    isDismissed: state.intent.isDismissed,
    maybeLastPointerType: state.intent.maybeLastPointerType,
    openVersion: state.intent.openVersion,
    closeVersion: version,
  })
  return {
    model: Open({ intent: nextIntent }),
    commands: [
      WaitForHoverCardClose({
        version,
        afterMs: closeDelayMsOf(props),
      }),
    ],
  }
}

// CHART

/**
 * The HoverCard Machine chart: composes `HoverIntent` with `isInteractive: true`
 * by default, configurable 700 ms open / 300 ms close delays, safe-triangle
 * pointer-corridor protection during close countdown, pointer-type focus
 * discrimination, and Escape dismissal until full disengage.
 */
export const chart = define({ state: State, message: Message, context: Props })(
  {
    initial,
    states: {
      Closed: {
        on: {
          OpenHoverCard: [
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
          CloseHoverCard: [ignore()],
          EnterHoverCardTrigger: [
            when(
              (state, message, context) =>
                isDisabledOf(context)
                  ? Option.none()
                  : stepToOpen(
                      state,
                      HoverIntent.EnteredTrigger(
                        hoverPointerArg(message.pointerType),
                      ),
                      context,
                    ),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            when(
              (state, message, context) =>
                isDisabledOf(context)
                  ? Option.none()
                  : stepToClosed(
                      state,
                      HoverIntent.EnteredTrigger(
                        hoverPointerArg(message.pointerType),
                      ),
                      context,
                    ),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          LeaveHoverCardTrigger: [
            when(
              (state, message, context) =>
                stepToClosed(
                  state,
                  HoverIntent.LeftTrigger(hoverPointerArg(message.pointerType)),
                  context,
                ),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          EnterHoverCardPanel: [
            when(
              (state, message, context) =>
                isDisabledOf(context)
                  ? Option.none()
                  : stepToOpen(
                      state,
                      HoverIntent.EnteredPanel(
                        hoverPointerArg(message.pointerType),
                      ),
                      context,
                    ),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            when(
              (state, message, context) =>
                isDisabledOf(context)
                  ? Option.none()
                  : stepToClosed(
                      state,
                      HoverIntent.EnteredPanel(
                        hoverPointerArg(message.pointerType),
                      ),
                      context,
                    ),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          LeaveHoverCardPanel: [
            when(
              (state, message, context) =>
                stepToClosed(
                  state,
                  HoverIntent.LeftPanel(hoverPointerArg(message.pointerType)),
                  context,
                ),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          FocusHoverCardTrigger: [
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
          BlurHoverCardTrigger: [
            when(
              (state, _message, context) =>
                stepToClosed(state, HoverIntent.BlurredTrigger(), context),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          FocusHoverCardPanel: [
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
          BlurHoverCardPanel: [
            when(
              (state, _message, context) =>
                stepToClosed(state, HoverIntent.BlurredPanel(), context),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          PressHoverCardPointer: [
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
          MovedHoverCardPointer: [ignore()],
          PressHoverCardEscape: [
            when(
              (state, _message, context) =>
                stepToClosed(state, HoverIntent.PressedEscape(), context),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          ElapsedHoverCardOpen: [
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
          ElapsedHoverCardClose: [ignore()],
        },
      },
      Open: {
        on: {
          OpenHoverCard: [ignore()],
          CloseHoverCard: [
            when(
              (state, _message, context) =>
                stepToClosed(state, HoverIntent.HideNow(), context),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          EnterHoverCardTrigger: [
            when(
              (state, message, context) =>
                stepToOpen(
                  state,
                  HoverIntent.EnteredTrigger(
                    hoverPointerArg(message.pointerType),
                  ),
                  context,
                ),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          LeaveHoverCardTrigger: [
            when(
              (state, message, context) =>
                stepToClosed(
                  state,
                  HoverIntent.LeftTrigger(hoverPointerArg(message.pointerType)),
                  context,
                ),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            when(
              (state, message, context) =>
                stepToOpen(
                  state,
                  HoverIntent.LeftTrigger(hoverPointerArg(message.pointerType)),
                  context,
                ),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          EnterHoverCardPanel: [
            when(
              (state, message, context) =>
                stepToOpen(
                  state,
                  HoverIntent.EnteredPanel(
                    hoverPointerArg(message.pointerType),
                  ),
                  context,
                ),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          LeaveHoverCardPanel: [
            when(
              (state, message, context) =>
                stepToClosed(
                  state,
                  HoverIntent.LeftPanel(hoverPointerArg(message.pointerType)),
                  context,
                ),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            when(
              (state, message, context) =>
                stepToOpen(
                  state,
                  HoverIntent.LeftPanel(hoverPointerArg(message.pointerType)),
                  context,
                ),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          FocusHoverCardTrigger: [
            when(
              (state, _message, context) =>
                stepToOpen(state, HoverIntent.FocusedTrigger(), context),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          BlurHoverCardTrigger: [
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
          FocusHoverCardPanel: [
            when(
              (state, _message, context) =>
                stepToOpen(state, HoverIntent.FocusedPanel(), context),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          BlurHoverCardPanel: [
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
          PressHoverCardPointer: [
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
          MovedHoverCardPointer: [
            when(
              (state, message, context) =>
                isInteractiveOf(context) &&
                HoverIntent.isClosing(state.intent) &&
                closeDelayMsOf(context) > 0 &&
                isInSafeCorridor(
                  message.origin,
                  message.point,
                  message.panelRect,
                  corridorPaddingPxOf(context),
                ),
              'Open',
              ({ state, context }) => extendCorridorClose(state, context),
            ),
            ignore(),
          ],
          PressHoverCardEscape: [
            when(
              (state, _message, context) =>
                stepToClosed(state, HoverIntent.PressedEscape(), context),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          ElapsedHoverCardOpen: [ignore()],
          ElapsedHoverCardClose: [
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
        },
      },
    },
  },
)

// SYNC

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  OpenHoverCard: pace,
  CloseHoverCard: pace,
  EnterHoverCardTrigger: pace,
  LeaveHoverCardTrigger: pace,
  EnterHoverCardPanel: pace,
  LeaveHoverCardPanel: pace,
  FocusHoverCardTrigger: pace,
  BlurHoverCardTrigger: pace,
  FocusHoverCardPanel: pace,
  BlurHoverCardPanel: pace,
  PressHoverCardPointer: pace,
  MovedHoverCardPointer: pace,
  PressHoverCardEscape: pace,
  ElapsedHoverCardOpen: pace,
  ElapsedHoverCardClose: pace,
})

/** Default synchronization: every HoverCard Message syncs. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a HoverCard kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/** The two painted slots of a HoverCard Part: `Trigger` and `Content`. */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Trigger: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'HeldLong', becomes: 'OpenHoverCard' }],
  },
  Content: {
    role: 'Region',
    focus: 'None',
    gestures: [],
  },
}

const triggerLabelPropsOf = (
  props: Props,
): Pick<SlotProps, 'label' | 'labelledBy'> => {
  if (props.label !== undefined) {
    return { label: props.label }
  } else if (props.labelledBy !== undefined) {
    return { labelledBy: props.labelledBy }
  } else {
    return {}
  }
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  _maybeChoice: Option.Option<string>,
): SlotProps => {
  if (slot === 'Trigger') {
    return {
      id: triggerId(props.id),
      isExpanded: isOpen(state),
      controls: contentId(props.id),
      ...triggerLabelPropsOf(props),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
    }
  } else if (slot === 'Content') {
    return {
      role: 'Region',
      id: contentId(props.id),
      labelledBy: triggerId(props.id),
      tabIndex: -1,
      ...(isOpen(state) ? {} : { isHidden: true }),
    }
  } else {
    return {}
  }
}

/** What a restart opens a HoverCard on: closed and unengaged while keeping monotonic version counters. */
export const atRest = (state: State): State =>
  Closed({
    intent: HoverIntent.atRest(state.intent),
  })

// PART FACTORY

/** Options for customizing a HoverCard Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'`) to keep this HoverCard device-only. */
  sync?: 'Synced' | DeviceReason
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a HoverCard {@link Part.Part}. Synced by default
 * (`category: 'Navigation'`, `Pace.Synced`); pass `sync: 'OwnView'` (or use
 * {@link deviceOnly}) to keep a Program's HoverCard local to one device.
 *
 * @example
 * ```typescript
 * const ProfileHoverCard = HoverCard.make({ name: 'ProfileHoverCard' })
 * const LocalHoverCard = HoverCard.deviceOnly({ name: 'LocalHoverCard' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> =>
  Part.define<State, Message, Props>({
    name: options.name ?? 'HoverCard',
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

/** Default synced HoverCard {@link Part.Part} (`category: 'Navigation'`). */
export const part: Part.Part<State, Message, Props> = make()

/** Creates a device-only HoverCard {@link Part.Part} (`Device({ because })`, defaulting to `'OwnView'`). */
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
