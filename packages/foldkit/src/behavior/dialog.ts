import { Match as M, Option, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import { define, ignore, to, when } from '../experimental/machine/machine.js'
import type { BoxLayer } from '../renderers/types.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import * as FocusScope from './focusScope.js'
import * as Layers from './layers.js'
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'
import * as Part from './part.js'
import type * as Slot from './slot.js'

// NOTE: this is the core Dialog Part (Widget #2 of 54, Scribe #2612). It
// composes `layers` and `focusScope` into one framework-free Machine and Part
// declaration covering regular dialogs and alert dialogs, modal and non-modal
// modes, Escape and outside-press dismissal, focus trapping/wrapping/return,
// and scroll-lock / inert-others declarations. Its state lives in the Model,
// synced by default with a device-only option, and projects reference-stable
// SlotBindings rendered by HTML, React, and React Native generic hosts with
// zero Dialog-specific painter logic.

// SCHEMAS

/** WAI-ARIA dialog role: standard `'dialog'` or urgent `'alertdialog'`. */
export const Role = S.Literals(['dialog', 'alertdialog'])
/** WAI-ARIA dialog role. */
export type Role = typeof Role.Type

/** Outcome of deciding how a thin painter handles a close request. */
export const CloseDecision = S.Literals(['Ignore', 'NoOp', 'Close'])
/** Outcome of deciding how a thin painter handles a close request. */
export type CloseDecision = typeof CloseDecision.Type

/**
 * Read-only props supplied to the Dialog chart and projection from the
 * Program's Model. Focusable IDs and active layer/focus-scope stacks are
 * plain data read by the chart without copying them into its state.
 */
export const Props = S.Struct({
  id: S.String,
  role: S.optionalKey(Role),
  isModal: S.optionalKey(S.Boolean),
  trapFocus: S.optionalKey(S.Boolean),
  loopFocus: S.optionalKey(S.Boolean),
  restoreFocus: S.optionalKey(S.Boolean),
  preventScroll: S.optionalKey(S.Boolean),
  inertOthers: S.optionalKey(S.Boolean),
  dismissOnEscape: S.optionalKey(S.Boolean),
  dismissOnOutsidePress: S.optionalKey(S.Boolean),
  focusableIds: S.optionalKey(S.Array(S.String)),
  maybeInitialFocusId: S.optionalKey(S.Option(S.String)),
  maybeReturnFocusId: S.optionalKey(S.Option(S.String)),
  label: S.optionalKey(S.String),
  layers: S.optionalKey(Layers.Stack),
  focusScopes: S.optionalKey(FocusScope.Stack),
  branches: S.optionalKey(S.Array(S.String)),
})
/** Read-only props supplied to the Dialog chart and projection. */
export type Props = typeof Props.Type

/**
 * Active overlay hygiene declarations derived from a Dialog's state and props
 * so any painter knows what platform mechanics to apply without holding rules.
 */
export const Hygiene = S.Struct({
  shouldLockScroll: S.Boolean,
  shouldInertOthers: S.Boolean,
  isOutsidePointerBlocked: S.Boolean,
  isTrappingFocus: S.Boolean,
  isFocusPaused: S.Boolean,
  maybeFocusedId: S.Option(S.String),
  maybeReturnFocusId: S.Option(S.String),
})
/** Active overlay hygiene declarations for painters. */
export type Hygiene = typeof Hygiene.Type

// STATE

/** The dialog is closed, carrying the target that should receive return focus when applicable. */
export const Closed = ts('Closed', {
  maybeReturnFocusId: S.Option(S.String),
})
/** The dialog is closed. */
export type Closed = typeof Closed.Type

/** The dialog is open, tracking its optional trigger value, previously focused element, and current focused element. */
export const Open = ts('Open', {
  maybeTriggerValue: S.Option(S.String),
  maybePreviouslyFocusedId: S.Option(S.String),
  maybeFocusedId: S.Option(S.String),
})
/** The dialog is open. */
export type Open = typeof Open.Type

/** Where a Dialog stands. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Closed, Open])
/** Where a Dialog stands. */
export type State = typeof State.Type

/** Initial Dialog state: closed with no pending return focus target. */
export const initial: State = Closed({ maybeReturnFocusId: Option.none() })

// ACTIONS (Catalog Actions — what a person or agent does on purpose)

/** Opens the dialog. */
export const OpenDialog = Catalog.action('OpenDialog', {
  what: 'Opens the dialog',
  why: 'To reveal the dialog content',
  meta: { label: 'Open dialog', keys: [] },
})

/** Closes the open dialog unconditionally. */
export const CloseDialog = Catalog.action('CloseDialog', {
  what: 'Closes the open dialog',
  why: 'To return to the content beneath it',
  meta: { label: 'Close dialog', keys: [] },
})

/** Opens the dialog when closed or closes it when open. */
export const ToggleDialog = Catalog.action('ToggleDialog', {
  what: 'Opens the dialog or closes it when open',
  why: 'To reveal or hide the dialog content',
  meta: { label: 'Dialog', keys: [] },
})

/** Dismisses the open dialog when it is the topmost layer and outside dismissal is allowed. */
export const DismissDialog = Catalog.action('DismissDialog', {
  what: 'Dismisses the open dialog when allowed',
  why: 'To leave the dialog without completing its action',
  meta: { label: 'Dismiss dialog', keys: [] },
})

/** The Catalog Actions a Dialog Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  OpenDialog,
  CloseDialog,
  ToggleDialog,
  DismissDialog,
]

// MESSAGES (Facts in addition to the Actions above)

/** Opens the dialog with an explicit trigger value and previously focused element ID. */
export const OpenedDialog = m('OpenedDialog', {
  maybeTriggerValue: S.Option(S.String),
  maybePreviouslyFocusedId: S.Option(S.String),
})

/** A key was pressed while the dialog is open (`Escape` or `Tab` / `Shift+Tab`). */
export const PressedDialogKey = m('PressedDialogKey', {
  key: S.String,
  shiftKey: S.optionalKey(S.Boolean),
})

/** A pointer press landed outside the layers listed in `insideIds`. */
export const PressedOutsideDialog = m('PressedOutsideDialog', {
  insideIds: S.Array(S.String),
  shouldRestoreFocus: S.optionalKey(S.Boolean),
})

/** Focus moved onto `targetId` while the dialog is open; trapped scopes reclaim focus if it escaped outside. */
export const FocusedDialogElement = m('FocusedDialogElement', {
  targetId: S.String,
})

/** The dialog unmounted while open (for example on route leave), resetting it to closed. */
export const UnmountedDialog = m('UnmountedDialog', {
  restoreFocus: S.optionalKey(S.Boolean),
})

/** Every Message the Dialog chart handles. */
export const Message = S.Union([
  OpenDialog,
  CloseDialog,
  ToggleDialog,
  DismissDialog,
  OpenedDialog,
  PressedDialogKey,
  PressedOutsideDialog,
  FocusedDialogElement,
  UnmountedDialog,
])
/** Every Message the Dialog chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Dialog Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS (shared by chart and thin painters such as @foldkit/ui Dialog)

/** Derives the heading element id referenced by `aria-labelledby`. */
export const titleId = (id: string): string => `${id}-dialog-title`

/** Derives the description element id referenced by `aria-describedby`. */
export const descriptionId = (id: string): string => `${id}-dialog-description`

/** Derives the dialog content panel element id. */
export const panelId = (id: string): string => `${id}-panel`

/** Derives the dialog backdrop element id. */
export const backdropId = (id: string): string => `${id}-backdrop`

/** Derives the dialog trigger button element id. */
export const triggerId = (id: string): string => `${id}-trigger`

/** Derives the dialog close button element id. */
export const closeButtonId = (id: string): string => `${id}-close`

// PURE RULES (shared by chart and thin painters such as @foldkit/ui Dialog)

/** The effective WAI-ARIA role for a Dialog (`'dialog'` by default). */
export const roleOf = (props: Pick<Props, 'role'>): Role =>
  props.role ?? 'dialog'

/** True when the Dialog carries the `'alertdialog'` role. */
export const isAlertDialog = (props: Pick<Props, 'role'>): boolean =>
  roleOf(props) === 'alertdialog'

/** True when the Dialog is modal (`true` by default). */
export const isModalOf = (props: Pick<Props, 'isModal'>): boolean =>
  props.isModal ?? true

/** True when pressing Escape is allowed to dismiss this Dialog (`true` by default). */
export const dismissesOnEscapeOf = (
  props: Pick<Props, 'dismissOnEscape'>,
): boolean => props.dismissOnEscape ?? true

/**
 * True when pressing outside (or on the backdrop) is allowed to dismiss this
 * Dialog. Defaults to `false` for `'alertdialog'` and `true` for `'dialog'`.
 */
export const dismissesOnOutsidePressOf = (
  props: Pick<Props, 'role' | 'dismissOnOutsidePress'>,
): boolean => props.dismissOnOutsidePress ?? !isAlertDialog(props)

/** True when focus should be trapped inside this Dialog (defaults to `isModal`). */
export const isTrappingFocusOf = (
  props: Pick<Props, 'isModal' | 'trapFocus'>,
): boolean => props.trapFocus ?? isModalOf(props)

/** True when Tab traversal wraps around edges (defaults to `isTrappingFocusOf`). */
export const isLoopingFocusOf = (
  props: Pick<Props, 'isModal' | 'trapFocus' | 'loopFocus'>,
): boolean => props.loopFocus ?? isTrappingFocusOf(props)

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

/** True when the dialog surface should remain rendered (open, or finishing a leave transition). */
export const isVisible = (
  input: Readonly<{ isOpen: boolean; isLeaving: boolean }>,
): boolean => input.isOpen || input.isLeaving

/** True when an open request represents an actual closed-to-open transition. */
export const canOpen = (isCurrentlyOpen: boolean): boolean => !isCurrentlyOpen

/**
 * Decides how a close request should be handled by a thin painter:
 * - `'Ignore'` when a leave animation is already running.
 * - `'NoOp'` when the dialog is already closed.
 * - `'Close'` when the dialog is open and not leaving.
 */
export const closeDecision = (
  input: Readonly<{ isOpen: boolean; isLeaving: boolean }>,
): CloseDecision => {
  if (input.isLeaving) {
    return 'Ignore'
  } else if (input.isOpen) {
    return 'Close'
  } else {
    return 'NoOp'
  }
}

/** True when an unmount backstop must release dialog resources (scroll lock, trap, stack entry). */
export const shouldReleaseOnUnmount = (
  input: Readonly<{ isOpen: boolean; isTransitionIdle: boolean }>,
): boolean => input.isOpen || !input.isTransitionIdle

/** Resolves the CSS focus selector on open: explicit `maybeFocusSelector`, else `fallbackSelector`. */
export const initialFocusSelectorOf = (
  maybeFocusSelector: Option.Option<string>,
  fallbackSelector: string,
): string => Option.getOrElse(maybeFocusSelector, () => fallbackSelector)

/** Builds the {@link Layers.Layer} entry representing this Dialog. */
export const layerOf = (
  props: Pick<
    Props,
    'id' | 'role' | 'isModal' | 'dismissOnEscape' | 'dismissOnOutsidePress'
  >,
): Layers.Layer =>
  Layers.layer(props.id, {
    isModal: isModalOf(props),
    dismissesOnEscape: dismissesOnEscapeOf(props),
    dismissesOnOutsidePress: dismissesOnOutsidePressOf(props),
  })

/** The active dismissable layer stack containing this Dialog. */
export const layersOf = (props: Props): Layers.Stack =>
  props.layers ?? [layerOf(props)]

/** Builds the {@link FocusScope.Scope} entry representing this Dialog when open, or none while closed. */
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

/** True when this Dialog's focus scope is mounted in `props.focusScopes` but paused beneath a nested scope. */
export const isFocusScopePaused = (state: State, props: Props): boolean =>
  state._tag === 'Open' &&
  FocusScope.isPaused(focusScopesOf(state, props), props.id)

/** True when page scrolling should be locked for this Dialog in its current state. */
export const shouldLockScroll = (state: State, props: Props): boolean =>
  state._tag === 'Open' && shouldPreventScrollOf(props)

/** True when background content outside this Dialog should be marked inert. */
export const shouldInertOutside = (state: State, props: Props): boolean =>
  state._tag === 'Open' && shouldInertOthersOf(props)

/** True when pointer interaction outside the Dialog layer stack is blocked. */
export const isOutsidePointerBlocked = (state: State, props: Props): boolean =>
  state._tag === 'Open' && Layers.isOutsidePointerBlocked(layersOf(props))

/** Pure summary of active overlay hygiene declarations for a painter. */
export const hygieneOf = (state: State, props: Props): Hygiene => ({
  shouldLockScroll: shouldLockScroll(state, props),
  shouldInertOthers: shouldInertOutside(state, props),
  isOutsidePointerBlocked: isOutsidePointerBlocked(state, props),
  isTrappingFocus: state._tag === 'Open' && isTrappingFocusOf(props),
  isFocusPaused: isFocusScopePaused(state, props),
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

const preferredInitialFocusOf = (props: Props): Option.Option<string> =>
  Option.orElse(props.maybeInitialFocusId ?? Option.none(), () =>
    isAlertDialog(props) ? Option.some(closeButtonId(props.id)) : Option.none(),
  )

const openWith = (
  props: Props,
  maybeTriggerValue: Option.Option<string>,
  maybePreviouslyFocusedId: Option.Option<string>,
): Open =>
  Open({
    maybeTriggerValue,
    maybePreviouslyFocusedId: Option.orElse(maybePreviouslyFocusedId, () =>
      Option.some(triggerId(props.id)),
    ),
    maybeFocusedId: FocusScope.resolveInitialFocus({
      containerId: panelId(props.id),
      focusableIds: props.focusableIds ?? [],
      maybeInitialFocusId: preferredInitialFocusOf(props),
    }),
  })

const closeWith = (
  state: Open,
  props: Props,
  restoreFocusOverride?: boolean,
): Closed =>
  Closed({
    maybeReturnFocusId: FocusScope.resolveReturnFocus({
      restoreFocus: restoreFocusOverride ?? shouldRestoreFocusOf(props),
      maybeReturnFocusId: props.maybeReturnFocusId ?? Option.none(),
      maybePreviouslyFocusedId: state.maybePreviouslyFocusedId,
      maybeFallbackId: Option.some(triggerId(props.id)),
    }),
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
 * The Dialog Machine chart: open/close/toggle transitions, layer-aware Escape
 * and outside-press dismissal, alertdialog outside-press protection, Tab /
 * Shift+Tab focus trapping and wrapping, outside-focus reclamation, and
 * return-focus target resolution.
 */
export const chart = define({ state: State, message: Message, context: Props })(
  {
    initial,
    states: {
      Closed: {
        on: {
          OpenDialog: to('Open', ({ context }) =>
            openWith(context, Option.none(), Option.none()),
          ),
          ToggleDialog: to('Open', ({ context }) =>
            openWith(context, Option.none(), Option.none()),
          ),
          OpenedDialog: to('Open', ({ message, context }) =>
            openWith(
              context,
              message.maybeTriggerValue,
              message.maybePreviouslyFocusedId,
            ),
          ),
        },
      },
      Open: {
        on: {
          CloseDialog: to('Closed', ({ state, context }) =>
            closeWith(state, context),
          ),
          ToggleDialog: to('Closed', ({ state, context }) =>
            closeWith(state, context),
          ),
          OpenedDialog: to('Open', ({ message, context }) =>
            openWith(
              context,
              message.maybeTriggerValue,
              message.maybePreviouslyFocusedId,
            ),
          ),
          DismissDialog: [
            when(
              (_state, _message, context) => canDismissOutside(context, []),
              'Closed',
              ({ state, context }) => closeWith(state, context),
            ),
            ignore(),
          ],
          PressedOutsideDialog: [
            when(
              (_state, message, context) =>
                canDismissOutside(context, message.insideIds),
              'Closed',
              ({ state, message, context }) =>
                closeWith(state, context, message.shouldRestoreFocus),
            ),
            ignore(),
          ],
          PressedDialogKey: [
            when(
              (_state, message, context) =>
                message.key === 'Escape' && canDismissEscape(context),
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
          FocusedDialogElement: [
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
          UnmountedDialog: to('Closed', ({ state, message, context }) =>
            closeWith(state, context, message.restoreFocus),
          ),
        },
      },
    },
  },
)

// SYNC

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  OpenDialog: pace,
  CloseDialog: pace,
  ToggleDialog: pace,
  DismissDialog: pace,
  OpenedDialog: pace,
  PressedDialogKey: pace,
  PressedOutsideDialog: pace,
  FocusedDialogElement: pace,
  UnmountedDialog: pace,
})

/** Default synchronization: every Dialog Message syncs. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a Dialog kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/** The six painted slots of a Dialog Part. */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Trigger: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ToggleDialog' }],
  },
  Backdrop: {
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'DismissDialog' }],
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
    gestures: [{ gesture: 'Pressed', becomes: 'CloseDialog' }],
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
      id: triggerId(props.id),
      isExpanded: state._tag === 'Open',
      controls: panelId(props.id),
      hasPopup: 'dialog',
    }
  } else if (slot === 'Backdrop') {
    return {
      id: backdropId(props.id),
    }
  } else if (slot === 'Panel') {
    const panelRole: Slot.Role = isAlertDialog(props) ? 'AlertDialog' : 'Dialog'
    return {
      role: panelRole,
      id: panelId(props.id),
      isModal: isModalOf(props),
      ...(props.label === undefined
        ? { labelledBy: titleId(props.id) }
        : { label: props.label }),
      describedBy: descriptionId(props.id),
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

/** What a restart opens a Dialog on: closed with no pending return focus. */
export const atRest = (_state: State): State => initial

// PART FACTORY

/** Options for customizing a Dialog Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'`) to keep this Dialog device-only. */
  sync?: 'Synced' | DeviceReason
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Dialog {@link Part.Part}. Synced by default (`category: 'Navigation'`);
 * pass `sync: 'OwnView'` (or use {@link deviceOnly}) to keep a Program's
 * Dialog local to one device.
 *
 * @example
 * ```typescript
 * const ConfirmDialog = Dialog.make({ name: 'ConfirmDialog' })
 * const LocalDialog = Dialog.make({ name: 'LocalDialog', sync: 'OwnView' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> =>
  Part.define<State, Message, Props>({
    name: options.name ?? 'Dialog',
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
 * Shorthand for a Dialog Part whose state stays on the device and is omitted
 * from the synced log and encoded Model.
 *
 * @example
 * ```typescript
 * const LocalDialog = Dialog.deviceOnly({ name: 'LocalDialog' })
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

/** The default synced Dialog Part (`name: 'Dialog'`, `category: 'Navigation'`). */
export const part: Part.Part<State, Message, Props> = make()

// READINGS & SCREEN HELPERS

/** True when the Dialog is open. */
export const isOpen = (state: State): boolean => state._tag === 'Open'

/** The currently focused element ID inside the Dialog when open, or none. */
export const focusedIdOf = (state: State): Option.Option<string> =>
  state._tag === 'Open' ? state.maybeFocusedId : Option.none()

/** The element ID that should receive return focus after closing, or none. */
export const returnFocusIdOf = (state: State): Option.Option<string> =>
  state._tag === 'Closed' ? state.maybeReturnFocusId : Option.none()

/** The element ID that had focus before the Dialog opened, or none while closed. */
export const previouslyFocusedIdOf = (state: State): Option.Option<string> =>
  state._tag === 'Open' ? state.maybePreviouslyFocusedId : Option.none()

/** The trigger value that opened the Dialog, or none. */
export const triggerValueOf = (state: State): Option.Option<string> =>
  state._tag === 'Open' ? state.maybeTriggerValue : Option.none()

/**
 * Projects an open Dialog into the `BoxLayer` field a `Box` node reads on
 * HTML, React, and React Native, or `{}` while closed.
 *
 * @example
 * ```typescript
 * Box({ padding: 2, ...Dialog.boxLayerOf(views.Dialog, props) }, content)
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
          kind: 'Dialog',
          label: props.label ?? props.id,
          ...(dismissesOnOutsidePressOf(props)
            ? { dismissToken: DismissDialog.tag }
            : {}),
        },
      }),
    }),
  )
