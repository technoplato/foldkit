import { Match as M, Option, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import {
  define,
  ignore,
  otherwise,
  to,
  when,
} from '../experimental/machine/machine.js'
import type { BoxLayer } from '../renderers/types.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import * as FocusScope from './focusScope.js'
import * as Layers from './layers.js'
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'
import * as Part from './part.js'
import * as Placement from './placement.js'
import type * as Slot from './slot.js'

// NOTE: this is the core Popover Part (Widget #4 of 54, Scribe #2616). It
// composes `placement`, `layers`, and `focusScope` into one framework-free
// Machine and Part declaration covering modal and non-modal popovers, trigger
// toggling, pointer-down vs click toggle suppression for mouse triggers, panel
// blur dismissal without returning focus, `contentFocus` focus handoff,
// layer-aware Escape and outside-press dismissal, focus trapping/wrapping/
// return, and anchor placement. Its state lives in the Model, synced by
// default with a device-only option, and projects reference-stable
// SlotBindings rendered by HTML, React, and React Native generic hosts with
// zero Popover-specific painter logic.

// CONSTANTS

/** Pointer event button code for the primary (left) mouse button. */
export const leftMouseButton = 0

// SCHEMAS

/** Optional placement spacing overrides for the Popover panel. */
export const PlacementOptions = S.Struct({
  gapPx: S.optionalKey(S.Number),
  edgePx: S.optionalKey(S.Number),
})
/** Optional placement spacing overrides. */
export type PlacementOptions = typeof PlacementOptions.Type

/** Outcome of deciding how a pointer-down on the trigger button behaves. */
export const PointerDownDecision = S.Literals(['RecordOnly', 'Open', 'Close'])
/** Outcome of deciding how a pointer-down on the trigger button behaves. */
export type PointerDownDecision = typeof PointerDownDecision.Type

/** Outcome of deciding how a click on the trigger button behaves. */
export const ButtonClickDecision = S.Literals([
  'IgnoreMouseClick',
  'Open',
  'Close',
])
/** Outcome of deciding how a click on the trigger button behaves. */
export type ButtonClickDecision = typeof ButtonClickDecision.Type

/** Outcome of deciding how panel blur behaves. */
export const PanelBlurDecision = S.Literals(['Ignore', 'CloseWithoutFocus'])
/** Outcome of deciding how panel blur behaves. */
export type PanelBlurDecision = typeof PanelBlurDecision.Type

/** Outcome of deciding how a key press on the trigger button behaves. */
export const TriggerKeyDecision = S.Literals(['Ignore', 'Open', 'Close'])
/** Outcome of deciding how a key press on the trigger button behaves. */
export type TriggerKeyDecision = typeof TriggerKeyDecision.Type

/**
 * Read-only props supplied to the Popover chart and projection from the
 * Program's Model. Focusable IDs, active layer/focus-scope stacks, and
 * placement spacing are plain data read by the chart without copying them
 * into its state.
 */
export const Props = S.Struct({
  id: S.String,
  isModal: S.optionalKey(S.Boolean),
  contentFocus: S.optionalKey(S.Boolean),
  isDisabled: S.optionalKey(S.Boolean),
  trapFocus: S.optionalKey(S.Boolean),
  loopFocus: S.optionalKey(S.Boolean),
  autoFocus: S.optionalKey(S.Boolean),
  restoreFocus: S.optionalKey(S.Boolean),
  preventScroll: S.optionalKey(S.Boolean),
  inertOthers: S.optionalKey(S.Boolean),
  dismissOnEscape: S.optionalKey(S.Boolean),
  dismissOnOutsidePress: S.optionalKey(S.Boolean),
  focusableIds: S.optionalKey(S.Array(S.String)),
  maybeInitialFocusId: S.optionalKey(S.Option(S.String)),
  maybeReturnFocusId: S.optionalKey(S.Option(S.String)),
  label: S.optionalKey(S.String),
  hasTitle: S.optionalKey(S.Boolean),
  hasDescription: S.optionalKey(S.Boolean),
  layers: S.optionalKey(Layers.Stack),
  focusScopes: S.optionalKey(FocusScope.Stack),
  branches: S.optionalKey(S.Array(S.String)),
  placement: S.optionalKey(PlacementOptions),
})
/** Read-only props supplied to the Popover chart and projection. */
export type Props = typeof Props.Type

/**
 * Active overlay hygiene declarations derived from a Popover's state and props
 * so any painter knows what platform mechanics to apply without holding rules.
 */
export const Hygiene = S.Struct({
  shouldLockScroll: S.Boolean,
  shouldInertOthers: S.Boolean,
  isOutsidePointerBlocked: S.Boolean,
  isTrappingFocus: S.Boolean,
  isFocusPaused: S.Boolean,
  isPanelFocusable: S.Boolean,
  closesOnPanelBlur: S.Boolean,
  maybeFocusedId: S.Option(S.String),
  maybeReturnFocusId: S.Option(S.String),
})
/** Active overlay hygiene declarations for painters. */
export type Hygiene = typeof Hygiene.Type

// STATE

/** The popover is closed, carrying its return-focus target and any last trigger pointer type. */
export const Closed = ts('Closed', {
  maybeReturnFocusId: S.Option(S.String),
  maybeLastButtonPointerType: S.Option(S.String),
})
/** The popover is closed. */
export type Closed = typeof Closed.Type

/** The popover is open, tracking its optional trigger value, focus targets, and last trigger pointer type. */
export const Open = ts('Open', {
  maybeTriggerValue: S.Option(S.String),
  maybePreviouslyFocusedId: S.Option(S.String),
  maybeFocusedId: S.Option(S.String),
  maybeLastButtonPointerType: S.Option(S.String),
})
/** The popover is open. */
export type Open = typeof Open.Type

/** Where a Popover stands. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Closed, Open])
/** Where a Popover stands. */
export type State = typeof State.Type

/** Initial Popover state: closed with no pending return focus or pointer type. */
export const initial: State = Closed({
  maybeReturnFocusId: Option.none(),
  maybeLastButtonPointerType: Option.none(),
})

// ACTIONS (Catalog Actions — what a person or agent does on purpose)

/** Opens the popover. */
export const OpenPopover = Catalog.action('OpenPopover', {
  what: 'Opens the popover',
  why: 'To reveal the popover content',
  meta: { label: 'Open popover', keys: [] },
})

/** Closes the open popover unconditionally. */
export const ClosePopover = Catalog.action('ClosePopover', {
  what: 'Closes the open popover',
  why: 'To return to the content beneath it',
  meta: { label: 'Close popover', keys: [] },
})

/** Opens the popover when closed or closes it when open. */
export const TogglePopover = Catalog.action('TogglePopover', {
  what: 'Opens the popover or closes it when open',
  why: 'To reveal or hide the popover content',
  meta: { label: 'Popover', keys: [] },
})

/** Dismisses the open popover when it is the topmost layer and outside dismissal is allowed. */
export const DismissPopover = Catalog.action('DismissPopover', {
  what: 'Dismisses the open popover when allowed',
  why: 'To leave the popover without completing its action',
  meta: { label: 'Dismiss popover', keys: [] },
})

/** The Catalog Actions a Popover Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  OpenPopover,
  ClosePopover,
  TogglePopover,
  DismissPopover,
]

// MESSAGES (Facts in addition to the Actions above)

/** Opens the popover with an explicit trigger value and previously focused element ID. */
export const OpenedPopover = m('OpenedPopover', {
  maybeTriggerValue: S.Option(S.String),
  maybePreviouslyFocusedId: S.Option(S.String),
})

/** A pointer device pressed on the popover trigger button; primary mouse presses toggle immediately. */
export const PressedPointerOnButton = m('PressedPointerOnButton', {
  pointerType: S.String,
  button: S.Number,
})

/** The popover trigger button was clicked; suppressed when a preceding mouse pointer-down already toggled. */
export const ClickedPopoverButton = m('ClickedPopoverButton')

/** A mouse click on the trigger button was ignored because pointer-down already handled the toggle. */
export const IgnoredMouseClick = m('IgnoredMouseClick')

/** The popover panel lost focus; closes without returning focus unless suppressed by mouse toggle or `contentFocus`. */
export const BlurredPopoverPanel = m('BlurredPopoverPanel')

/** A key was pressed while focus is on the trigger button. */
export const PressedTriggerKey = m('PressedTriggerKey', {
  key: S.String,
})

/** A key was pressed while the popover is open (`Escape` or `Tab` / `Shift+Tab`). */
export const PressedPopoverKey = m('PressedPopoverKey', {
  key: S.String,
  shiftKey: S.optionalKey(S.Boolean),
})

/** A pointer press landed outside the layers listed in `insideIds`. */
export const PressedOutsidePopover = m('PressedOutsidePopover', {
  insideIds: S.Array(S.String),
  shouldRestoreFocus: S.optionalKey(S.Boolean),
})

/** Focus moved onto `targetId` while the popover is open; trapped scopes reclaim focus if it escaped outside. */
export const FocusedPopoverElement = m('FocusedPopoverElement', {
  targetId: S.String,
})

/** The popover unmounted while open (for example on route leave), resetting it to closed. */
export const UnmountedPopover = m('UnmountedPopover', {
  restoreFocus: S.optionalKey(S.Boolean),
})

/** Every Message the Popover chart handles. */
export const Message = S.Union([
  OpenPopover,
  ClosePopover,
  TogglePopover,
  DismissPopover,
  OpenedPopover,
  PressedPointerOnButton,
  ClickedPopoverButton,
  IgnoredMouseClick,
  BlurredPopoverPanel,
  PressedTriggerKey,
  PressedPopoverKey,
  PressedOutsidePopover,
  FocusedPopoverElement,
  UnmountedPopover,
])
/** Every Message the Popover chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Popover Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS (shared by chart and thin painters such as @foldkit/ui Popover)

/** Derives the trigger button element id from a popover's base `id`. */
export const buttonId = (id: string): string => `${id}-button`

/** Derives the floating panel element id from a popover's base `id`. */
export const panelId = (id: string): string => `${id}-panel`

/** Derives the backdrop element id from a popover's base `id`. */
export const backdropId = (id: string): string => `${id}-backdrop`

/** Derives the heading element id referenced by `aria-labelledby`. */
export const titleId = (id: string): string => `${id}-title`

/** Derives the description element id referenced by `aria-describedby`. */
export const descriptionId = (id: string): string => `${id}-description`

/** Derives the close button element id from a popover's base `id`. */
export const closeButtonId = (id: string): string => `${id}-close`

// PURE RULES (shared by chart and thin painters such as @foldkit/ui Popover)

/** True when the Popover is modal (`false` by default). */
export const isModalOf = (props: Pick<Props, 'isModal'>): boolean =>
  props.isModal ?? false

/** True when focus ownership is delegated to content inside the Popover (`false` by default). */
export const contentFocusOf = (props: Pick<Props, 'contentFocus'>): boolean =>
  props.contentFocus ?? false

/** True when the Popover trigger is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'>): boolean =>
  props.isDisabled ?? false

/** True when pressing Escape is allowed to dismiss this Popover (`true` by default). */
export const dismissesOnEscapeOf = (
  props: Pick<Props, 'dismissOnEscape'>,
): boolean => props.dismissOnEscape ?? true

/** True when pressing outside (or on the backdrop) is allowed to dismiss this Popover (`true` by default). */
export const dismissesOnOutsidePressOf = (
  props: Pick<Props, 'dismissOnOutsidePress'>,
): boolean => props.dismissOnOutsidePress ?? true

/** True when focus should be trapped inside this Popover (defaults to `isModal`). */
export const isTrappingFocusOf = (
  props: Pick<Props, 'isModal' | 'trapFocus'>,
): boolean => props.trapFocus ?? isModalOf(props)

/** True when Tab traversal wraps around edges (defaults to `isTrappingFocusOf`). */
export const isLoopingFocusOf = (
  props: Pick<Props, 'isModal' | 'trapFocus' | 'loopFocus'>,
): boolean => props.loopFocus ?? isTrappingFocusOf(props)

/** True when opening the Popover resolves initial focus automatically (defaults to `!contentFocus`). */
export const shouldAutoFocusOf = (
  props: Pick<Props, 'contentFocus' | 'autoFocus'>,
): boolean => props.autoFocus ?? !contentFocusOf(props)

/** True when closing or unmounting should restore focus (`true` by default). */
export const shouldRestoreFocusOf = (
  props: Pick<Props, 'restoreFocus'>,
): boolean => props.restoreFocus ?? true

/** True when page scrolling should be locked while open (defaults to `isModal`). */
export const shouldPreventScrollOf = (
  props: Pick<Props, 'isModal' | 'preventScroll'>,
): boolean => props.preventScroll ?? isModalOf(props)

/** True when background content should be marked inert while open (defaults to `isModal`). */
export const shouldInertOthersOf = (
  props: Pick<Props, 'isModal' | 'inertOthers'>,
): boolean => props.inertOthers ?? isModalOf(props)

/** True when an animation transition state is actively leaving (`LeaveStart` or `LeaveAnimating`). */
export const isLeavingPhase = (transitionState: string): boolean =>
  transitionState === 'LeaveStart' || transitionState === 'LeaveAnimating'

/** True when the popover surface should remain rendered (open, or finishing a leave transition). */
export const isVisible = (
  input: Readonly<{ isOpen: boolean; isLeaving: boolean }>,
): boolean => input.isOpen || input.isLeaving

/** True when a pointer-down event is a primary (left) mouse button press. */
export const isPrimaryMousePointer = (
  pointerType: string,
  button: number,
): boolean => pointerType === 'mouse' && button === leftMouseButton

/** True when the last recorded trigger pointer type was `'mouse'`. */
export const isMousePointerType = (
  maybeLastButtonPointerType: Option.Option<string>,
): boolean => Option.contains(maybeLastButtonPointerType, 'mouse')

/**
 * Decides how a pointer-down on the trigger button should be handled:
 * - `'RecordOnly'` for touch, pen, or non-primary mouse buttons (toggles on click instead).
 * - `'Close'` for primary mouse press while open.
 * - `'Open'` for primary mouse press while closed.
 */
export const pointerDownDecision = (
  input: Readonly<{
    isOpen: boolean
    pointerType: string
    button: number
  }>,
): PointerDownDecision => {
  if (!isPrimaryMousePointer(input.pointerType, input.button)) {
    return 'RecordOnly'
  } else if (input.isOpen) {
    return 'Close'
  } else {
    return 'Open'
  }
}

/**
 * Decides how a click on the trigger button should be handled:
 * - `'IgnoreMouseClick'` when a mouse pointer-down already toggled.
 * - `'Close'` when open and not preceded by a mouse pointer-down.
 * - `'Open'` when closed and not preceded by a mouse pointer-down.
 */
export const buttonClickDecision = (
  input: Readonly<{
    isOpen: boolean
    maybeLastButtonPointerType: Option.Option<string>
  }>,
): ButtonClickDecision => {
  if (isMousePointerType(input.maybeLastButtonPointerType)) {
    return 'IgnoreMouseClick'
  } else if (input.isOpen) {
    return 'Close'
  } else {
    return 'Open'
  }
}

/**
 * Decides how panel blur should be handled:
 * - `'Ignore'` when closed, when `contentFocus` owns focus, or when a mouse
 *   pointer-down on the trigger button caused the blur.
 * - `'CloseWithoutFocus'` otherwise, closing without returning focus to the trigger.
 */
export const panelBlurDecision = (
  input: Readonly<{
    isOpen: boolean
    contentFocus?: boolean
    maybeLastButtonPointerType: Option.Option<string>
  }>,
): PanelBlurDecision => {
  if (
    !input.isOpen ||
    input.contentFocus === true ||
    isMousePointerType(input.maybeLastButtonPointerType)
  ) {
    return 'Ignore'
  } else {
    return 'CloseWithoutFocus'
  }
}

/**
 * Decides how a key press on the trigger button should be handled:
 * - `Enter`, `' '`, or `ArrowDown` toggles (`'Close'` when open, `'Open'` when closed).
 * - `Escape` returns `'Close'` when open.
 * - Any other key returns `'Ignore'`.
 */
export const triggerKeyDecision = (
  input: Readonly<{ isOpen: boolean; key: string }>,
): TriggerKeyDecision => {
  if (input.key === 'Enter' || input.key === ' ' || input.key === 'ArrowDown') {
    return input.isOpen ? 'Close' : 'Open'
  } else if (input.key === 'Escape' && input.isOpen) {
    return 'Close'
  } else {
    return 'Ignore'
  }
}

/** True when `key` is Space (`' '`), whose key-up scrolls the page unless suppressed. */
export const isSpaceScrollKey = (key: string): boolean => key === ' '

/** True when `key` is `'Escape'`. */
export const isEscapeKey = (key: string): boolean => key === 'Escape'

/**
 * Places a Popover panel by its anchor using `Placement.place`, applying any
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

/** Builds the {@link Layers.Layer} entry representing this Popover. */
export const layerOf = (
  props: Pick<
    Props,
    'id' | 'isModal' | 'dismissOnEscape' | 'dismissOnOutsidePress'
  >,
): Layers.Layer =>
  Layers.layer(props.id, {
    isModal: isModalOf(props),
    dismissesOnEscape: dismissesOnEscapeOf(props),
    dismissesOnOutsidePress: dismissesOnOutsidePressOf(props),
  })

/** The active dismissable layer stack containing this Popover. */
export const layersOf = (props: Props): Layers.Stack =>
  props.layers ?? [layerOf(props)]

/** Builds the {@link FocusScope.Scope} entry representing this Popover when open, or none while closed. */
export const focusScopeOf = (
  state: State,
  props: Props,
): Option.Option<FocusScope.Scope> =>
  M.value(state).pipe(
    M.withReturnType<Option.Option<FocusScope.Scope>>(),
    M.tagsExhaustive({
      Closed: () => Option.none(),
      Open: openState =>
        Option.some(
          FocusScope.scope(props.id, {
            containerId: panelId(props.id),
            isTrapped: isTrappingFocusOf(props),
            loop: isLoopingFocusOf(props),
            restoreFocus: shouldRestoreFocusOf(props),
            maybePreviouslyFocusedId: openState.maybePreviouslyFocusedId,
            maybeLastFocusedId: openState.maybeFocusedId,
            ...(props.branches === undefined
              ? {}
              : { branches: props.branches }),
          }),
        ),
    }),
  )

const focusScopesOf = (state: Open, props: Props): FocusScope.Stack =>
  props.focusScopes ?? Option.toArray(focusScopeOf(state, props))

/** True when this Popover's focus scope is mounted in `props.focusScopes` but paused beneath a nested scope. */
export const isFocusScopePaused = (state: State, props: Props): boolean =>
  state._tag === 'Open' &&
  FocusScope.isPaused(focusScopesOf(state, props), props.id)

/** True when page scrolling should be locked for this Popover in its current state. */
export const shouldLockScroll = (state: State, props: Props): boolean =>
  state._tag === 'Open' && shouldPreventScrollOf(props)

/** True when background content outside this Popover should be marked inert. */
export const shouldInertOutside = (state: State, props: Props): boolean =>
  state._tag === 'Open' && shouldInertOthersOf(props)

/** True when pointer interaction outside the Popover layer stack is blocked. */
export const isOutsidePointerBlocked = (state: State, props: Props): boolean =>
  state._tag === 'Open' && Layers.isOutsidePointerBlocked(layersOf(props))

/** Pure summary of active overlay hygiene declarations for a painter. */
export const hygieneOf = (state: State, props: Props): Hygiene => ({
  shouldLockScroll: shouldLockScroll(state, props),
  shouldInertOthers: shouldInertOutside(state, props),
  isOutsidePointerBlocked: isOutsidePointerBlocked(state, props),
  isTrappingFocus: state._tag === 'Open' && isTrappingFocusOf(props),
  isFocusPaused: isFocusScopePaused(state, props),
  isPanelFocusable: !contentFocusOf(props),
  closesOnPanelBlur: state._tag === 'Open' && !contentFocusOf(props),
  maybeFocusedId: focusedIdOf(state),
  maybeReturnFocusId: returnFocusIdOf(state),
})

// INTERNAL CHART HELPERS

const canDismissEscape = (props: Props): boolean =>
  Layers.canDismissOnEscape(layersOf(props), props.id)

const canDismissOutside = (
  props: Props,
  insideIds: ReadonlyArray<string>,
): boolean =>
  Layers.canDismissOnOutsidePress(layersOf(props), props.id, insideIds)

const openWith = (
  props: Props,
  maybeTriggerValue: Option.Option<string>,
  maybePreviouslyFocusedId: Option.Option<string>,
  maybeLastButtonPointerType: Option.Option<string> = Option.none(),
): Open =>
  Open({
    maybeTriggerValue,
    maybePreviouslyFocusedId: Option.orElse(maybePreviouslyFocusedId, () =>
      Option.some(buttonId(props.id)),
    ),
    maybeFocusedId: FocusScope.resolveInitialFocus({
      containerId: panelId(props.id),
      focusableIds: props.focusableIds ?? [],
      maybeInitialFocusId: props.maybeInitialFocusId ?? Option.none(),
      autoFocus: shouldAutoFocusOf(props),
    }),
    maybeLastButtonPointerType,
  })

const closeWith = (
  state: Open,
  props: Props,
  restoreFocusOverride?: boolean,
  maybeLastButtonPointerType: Option.Option<string> = Option.none(),
): Closed =>
  Closed({
    maybeReturnFocusId: FocusScope.resolveReturnFocus({
      restoreFocus: restoreFocusOverride ?? shouldRestoreFocusOf(props),
      maybeReturnFocusId: props.maybeReturnFocusId ?? Option.none(),
      maybePreviouslyFocusedId: state.maybePreviouslyFocusedId,
      maybeFallbackId: Option.some(buttonId(props.id)),
    }),
    maybeLastButtonPointerType,
  })

const tabMoveOf = (
  state: Open,
  props: Props,
  key: string,
  shiftKey?: boolean,
): Option.Option<FocusScope.MoveFocus> => {
  const resolution = FocusScope.resolveTabKey({
    key,
    ...(shiftKey === undefined ? {} : { shiftKey }),
    containerId: panelId(props.id),
    focusableIds: props.focusableIds ?? [],
    maybeCurrentId: state.maybeFocusedId,
    isTrapped: isTrappingFocusOf(props),
    loop: isLoopingFocusOf(props),
    isPaused: isFocusScopePaused(state, props),
  })
  return resolution._tag === 'MoveFocus'
    ? Option.some(resolution)
    : Option.none()
}

// CHART

/**
 * The Popover Machine chart: open/close/toggle transitions, mouse pointer-down
 * vs click suppression, panel blur dismissal without focus restoration,
 * `contentFocus` handoff, layer-aware Escape and outside-press dismissal,
 * Tab / Shift+Tab focus trapping and wrapping, outside-focus reclamation, and
 * return-focus target resolution.
 */
export const chart = define({ state: State, message: Message, context: Props })(
  {
    initial,
    states: {
      Closed: {
        on: {
          OpenPopover: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Open',
              ({ context }) => openWith(context, Option.none(), Option.none()),
            ),
            ignore(),
          ],
          TogglePopover: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Open',
              ({ context }) => openWith(context, Option.none(), Option.none()),
            ),
            ignore(),
          ],
          OpenedPopover: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Open',
              ({ message, context }) =>
                openWith(
                  context,
                  message.maybeTriggerValue,
                  message.maybePreviouslyFocusedId,
                ),
            ),
            ignore(),
          ],
          PressedPointerOnButton: [
            when(
              (_state, message, context) =>
                !isDisabledOf(context) &&
                pointerDownDecision({
                  isOpen: false,
                  pointerType: message.pointerType,
                  button: message.button,
                }) === 'Open',
              'Open',
              ({ message, context }) =>
                openWith(
                  context,
                  Option.none(),
                  Option.none(),
                  Option.some(message.pointerType),
                ),
            ),
            otherwise(
              to('Closed', ({ state, message }) =>
                Closed({
                  ...state,
                  maybeLastButtonPointerType: Option.some(message.pointerType),
                }),
              ),
            ),
          ],
          ClickedPopoverButton: [
            when(
              state =>
                buttonClickDecision({
                  isOpen: false,
                  maybeLastButtonPointerType: state.maybeLastButtonPointerType,
                }) === 'IgnoreMouseClick',
              'Closed',
              ({ state }) =>
                Closed({
                  ...state,
                  maybeLastButtonPointerType: Option.none(),
                }),
            ),
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Open',
              ({ context }) => openWith(context, Option.none(), Option.none()),
            ),
            ignore(),
          ],
          IgnoredMouseClick: to('Closed', ({ state }) =>
            Closed({
              ...state,
              maybeLastButtonPointerType: Option.none(),
            }),
          ),
          PressedTriggerKey: [
            when(
              (_state, message, context) =>
                !isDisabledOf(context) &&
                triggerKeyDecision({ isOpen: false, key: message.key }) ===
                  'Open',
              'Open',
              ({ context }) => openWith(context, Option.none(), Option.none()),
            ),
            ignore(),
          ],
        },
      },
      Open: {
        on: {
          ClosePopover: to('Closed', ({ state, context }) =>
            closeWith(state, context),
          ),
          TogglePopover: to('Closed', ({ state, context }) =>
            closeWith(state, context),
          ),
          OpenedPopover: to('Open', ({ message, context }) =>
            openWith(
              context,
              message.maybeTriggerValue,
              message.maybePreviouslyFocusedId,
            ),
          ),
          PressedPointerOnButton: [
            when(
              (_state, message) =>
                pointerDownDecision({
                  isOpen: true,
                  pointerType: message.pointerType,
                  button: message.button,
                }) === 'Close',
              'Closed',
              ({ state, message, context }) =>
                closeWith(
                  state,
                  context,
                  undefined,
                  Option.some(message.pointerType),
                ),
            ),
            otherwise(
              to('Open', ({ state, message }) =>
                Open({
                  ...state,
                  maybeLastButtonPointerType: Option.some(message.pointerType),
                }),
              ),
            ),
          ],
          ClickedPopoverButton: [
            when(
              state =>
                buttonClickDecision({
                  isOpen: true,
                  maybeLastButtonPointerType: state.maybeLastButtonPointerType,
                }) === 'IgnoreMouseClick',
              'Open',
              ({ state }) =>
                Open({
                  ...state,
                  maybeLastButtonPointerType: Option.none(),
                }),
            ),
            otherwise(
              to('Closed', ({ state, context }) => closeWith(state, context)),
            ),
          ],
          IgnoredMouseClick: to('Open', ({ state }) =>
            Open({
              ...state,
              maybeLastButtonPointerType: Option.none(),
            }),
          ),
          BlurredPopoverPanel: [
            when(
              (state, _message, context) =>
                panelBlurDecision({
                  isOpen: true,
                  contentFocus: contentFocusOf(context),
                  maybeLastButtonPointerType: state.maybeLastButtonPointerType,
                }) === 'CloseWithoutFocus',
              'Closed',
              ({ state, context }) => closeWith(state, context, false),
            ),
            ignore(),
          ],
          DismissPopover: [
            when(
              (_state, _message, context) => canDismissOutside(context, []),
              'Closed',
              ({ state, context }) => closeWith(state, context),
            ),
            ignore(),
          ],
          PressedOutsidePopover: [
            when(
              (_state, message, context) =>
                canDismissOutside(context, message.insideIds),
              'Closed',
              ({ state, message, context }) =>
                closeWith(state, context, message.shouldRestoreFocus),
            ),
            ignore(),
          ],
          PressedTriggerKey: [
            when(
              (_state, message, context) =>
                isEscapeKey(message.key) && canDismissEscape(context),
              'Closed',
              ({ state, context }) => closeWith(state, context),
            ),
            when(
              (_state, message) =>
                !isEscapeKey(message.key) &&
                triggerKeyDecision({ isOpen: true, key: message.key }) ===
                  'Close',
              'Closed',
              ({ state, context }) => closeWith(state, context),
            ),
            ignore(),
          ],
          PressedPopoverKey: [
            when(
              (_state, message, context) =>
                isEscapeKey(message.key) && canDismissEscape(context),
              'Closed',
              ({ state, context }) => closeWith(state, context),
            ),
            when(
              (state, message, context) =>
                tabMoveOf(state, context, message.key, message.shiftKey),
              'Open',
              ({ state, guardValue }) =>
                Open({
                  ...state,
                  maybeFocusedId: Option.some(guardValue.targetId),
                }),
            ),
            ignore(),
          ],
          FocusedPopoverElement: [
            when(
              (_state, message, context) =>
                FocusScope.isTargetInScope(
                  {
                    containerId: panelId(context.id),
                    focusableIds: context.focusableIds ?? [],
                    ...(context.branches === undefined
                      ? {}
                      : { branches: context.branches }),
                  },
                  message.targetId,
                ),
              'Open',
              ({ state, message }) =>
                Open({
                  ...state,
                  maybeFocusedId: Option.some(message.targetId),
                }),
            ),
            when(
              (state, message, context) =>
                FocusScope.resolveOutsideFocus({
                  containerId: panelId(context.id),
                  focusableIds: context.focusableIds ?? [],
                  targetId: message.targetId,
                  maybeLastFocusedId: state.maybeFocusedId,
                  ...(context.branches === undefined
                    ? {}
                    : { branches: context.branches }),
                  isTrapped: isTrappingFocusOf(context),
                  isPaused: isFocusScopePaused(state, context),
                }),
              'Open',
              ({ state, guardValue }) =>
                Open({
                  ...state,
                  maybeFocusedId: Option.some(guardValue),
                }),
            ),
            ignore(),
          ],
          UnmountedPopover: to('Closed', ({ state, message, context }) =>
            closeWith(state, context, message.restoreFocus),
          ),
        },
      },
    },
  },
)

// SYNC

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  OpenPopover: pace,
  ClosePopover: pace,
  TogglePopover: pace,
  DismissPopover: pace,
  OpenedPopover: pace,
  PressedPointerOnButton: pace,
  ClickedPopoverButton: pace,
  IgnoredMouseClick: pace,
  BlurredPopoverPanel: pace,
  PressedTriggerKey: pace,
  PressedPopoverKey: pace,
  PressedOutsidePopover: pace,
  FocusedPopoverElement: pace,
  UnmountedPopover: pace,
})

/** Default synchronization: every Popover Message syncs. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a Popover kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/** The six painted slots of a Popover Part. */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Trigger: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'TogglePopover' }],
  },
  Backdrop: {
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'DismissPopover' }],
  },
  Panel: {
    role: 'Dialog',
    focus: 'Container',
    gestures: [],
  },
  Title: {
    focus: 'None',
    gestures: [],
  },
  Description: {
    focus: 'None',
    gestures: [],
  },
  CloseButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ClosePopover' }],
  },
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  _maybeChoice: Option.Option<string>,
): Slot.SlotProps => {
  if (slot === 'Trigger') {
    return {
      id: buttonId(props.id),
      isExpanded: state._tag === 'Open',
      controls: panelId(props.id),
      hasPopup: 'dialog',
      ...(props.isDisabled === undefined
        ? {}
        : { isDisabled: props.isDisabled }),
    }
  } else if (slot === 'Backdrop') {
    return {
      id: backdropId(props.id),
    }
  } else if (slot === 'Panel') {
    const labelProps =
      props.label !== undefined
        ? { label: props.label }
        : props.hasTitle === false
          ? {}
          : { labelledBy: titleId(props.id) }
    const descriptionProps =
      props.hasDescription === false
        ? {}
        : { describedBy: descriptionId(props.id) }
    return {
      role: 'Dialog',
      id: panelId(props.id),
      isModal: isModalOf(props),
      ...labelProps,
      ...descriptionProps,
      ...(state._tag === 'Open' && Option.isSome(state.maybeFocusedId)
        ? { activeId: state.maybeFocusedId.value }
        : {}),
    }
  } else if (slot === 'Title') {
    return {
      id: titleId(props.id),
    }
  } else if (slot === 'Description') {
    return {
      id: descriptionId(props.id),
    }
  } else if (slot === 'CloseButton') {
    return {
      id: closeButtonId(props.id),
      isCurrent:
        state._tag === 'Open' &&
        Option.contains(state.maybeFocusedId, closeButtonId(props.id)),
    }
  } else {
    return {}
  }
}

/** What a restart opens a Popover on: closed with no pending return focus or pointer type. */
export const atRest = (_state: State): State => initial

// PART FACTORY

/** Options for customizing a Popover Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'`) to keep this Popover device-only. */
  sync?: 'Synced' | DeviceReason
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Popover {@link Part.Part}. Synced by default (`category: 'Navigation'`);
 * pass `sync: 'OwnView'` (or use {@link deviceOnly}) to keep a Program's
 * Popover local to one device.
 *
 * @example
 * ```typescript
 * const InfoPopover = Popover.make({ name: 'InfoPopover' })
 * const LocalPopover = Popover.make({ name: 'LocalPopover', sync: 'OwnView' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> =>
  Part.define<State, Message, Props>({
    name: options.name ?? 'Popover',
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

/**
 * Shorthand for a Popover Part whose state stays on the device and is omitted
 * from the synced log and encoded Model.
 *
 * @example
 * ```typescript
 * const LocalPopover = Popover.deviceOnly({ name: 'LocalPopover' })
 * ```
 */
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

/** The default synced Popover Part (`name: 'Popover'`, `category: 'Navigation'`). */
export const part: Part.Part<State, Message, Props> = make()

// READINGS & SCREEN HELPERS

/** True when the Popover is open. */
export const isOpen = (state: State): boolean => state._tag === 'Open'

/** The currently focused element ID inside the Popover when open, or none. */
export const focusedIdOf = (state: State): Option.Option<string> =>
  state._tag === 'Open' ? state.maybeFocusedId : Option.none()

/** The element ID that should receive return focus after closing, or none. */
export const returnFocusIdOf = (state: State): Option.Option<string> =>
  state._tag === 'Closed' ? state.maybeReturnFocusId : Option.none()

/** The element ID that had focus before the Popover opened, or none while closed. */
export const previouslyFocusedIdOf = (state: State): Option.Option<string> =>
  state._tag === 'Open' ? state.maybePreviouslyFocusedId : Option.none()

/** The trigger value that opened the Popover, or none. */
export const triggerValueOf = (state: State): Option.Option<string> =>
  state._tag === 'Open' ? state.maybeTriggerValue : Option.none()

/** The last pointer type recorded on the trigger button, or none. */
export const lastButtonPointerTypeOf = (state: State): Option.Option<string> =>
  state.maybeLastButtonPointerType

/**
 * Projects an open Popover into the `BoxLayer` field a `Box` node reads on
 * HTML, React, and React Native, or `{}` while closed. Modal popovers project
 * `kind: 'Dialog'` and non-modal popovers project `kind: 'Panel'`.
 *
 * @example
 * ```typescript
 * Box({ padding: 2, ...Popover.boxLayerOf(views.Popover, props) }, content)
 * ```
 */
export const boxLayerOf = (
  view: Part.View<State>,
  props: Props,
): Readonly<{ layer?: BoxLayer }> =>
  M.value(view.state).pipe(
    M.withReturnType<Readonly<{ layer?: BoxLayer }>>(),
    M.tagsExhaustive({
      Closed: () => ({}),
      Open: () => ({
        layer: {
          kind: isModalOf(props) ? 'Dialog' : 'Panel',
          label: props.label ?? props.id,
          ...(dismissesOnOutsidePressOf(props)
            ? { dismissToken: DismissPopover.tag }
            : {}),
        },
      }),
    }),
  )
