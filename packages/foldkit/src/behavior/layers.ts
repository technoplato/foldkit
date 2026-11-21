import { Array, Option, Schema as S, pipe } from 'effect'

// NOTE: this is the one place that decides how stacked dismissable layers
// (menus, dialogs, popovers, drawers, selects) interact with Escape and
// outside pointer presses. It keeps no state: the Program owns which layers
// are open and hands them here in stack order (bottom to top), and these
// pure readings answer which layer handles dismissal and which layers can
// receive pointer input.

// SCHEMA

/**
 * One open dismissable layer on the stack: a menu, a dialog, a popover, or
 * a drawer.
 *
 * - `id` names the layer within the stack (`'title-menu'`, `'confirm-dialog'`).
 * - `isModal` marks a layer that blocks pointer interaction with everything
 *   beneath it.
 * - `dismissesOnEscape` defaults to `true` when omitted.
 * - `dismissesOnOutsidePress` defaults to `true` when omitted.
 *
 * @example
 * ```typescript
 * const menu: Layer = layer('actions-menu')
 * const dialog: Layer = layer('delete-dialog', { isModal: true })
 * ```
 */
export const Layer = S.Struct({
  id: S.String,
  isModal: S.Boolean,
  dismissesOnEscape: S.optionalKey(S.Boolean),
  dismissesOnOutsidePress: S.optionalKey(S.Boolean),
})
/** One open dismissable layer on the stack. */
export type Layer = typeof Layer.Type

/**
 * Open dismissable layers ordered bottom-to-top: the last element is the
 * topmost layer.
 *
 * @example
 * ```typescript
 * const stack: Stack = [
 *   layer('settings-dialog', { isModal: true }),
 *   layer('chapter-menu'),
 * ]
 * ```
 */
export const Stack = S.Array(Layer)
/** Open dismissable layers ordered bottom-to-top. */
export type Stack = typeof Stack.Type

// CONSTRUCTORS

/**
 * Builds a layer with sensible defaults: non-modal, and dismissable by both
 * Escape and an outside press.
 *
 * @example
 * ```typescript
 * layer('actions-menu') // { id: 'actions-menu', isModal: false }
 * layer('confirm-dialog', { isModal: true, dismissesOnOutsidePress: false })
 * ```
 */
export const layer = (
  id: string,
  options: Readonly<{
    isModal?: boolean
    dismissesOnEscape?: boolean
    dismissesOnOutsidePress?: boolean
  }> = {},
): Layer => ({
  id,
  isModal: options.isModal ?? false,
  ...(options.dismissesOnEscape === undefined
    ? {}
    : { dismissesOnEscape: options.dismissesOnEscape }),
  ...(options.dismissesOnOutsidePress === undefined
    ? {}
    : { dismissesOnOutsidePress: options.dismissesOnOutsidePress }),
})

// STACK OPERATIONS

/**
 * Pushes `entry` onto the top of `stack`. If a layer with the same `id` is
 * already present, it moves to the top with the new settings.
 *
 * @example
 * ```typescript
 * pushed([layer('dialog', { isModal: true })], layer('menu'))
 * // [dialog, menu]
 * ```
 */
export const pushed = (stack: Stack, entry: Layer): Stack => [
  ...Array.filter(stack, existing => existing.id !== entry.id),
  entry,
]

/**
 * Removes the layer with `id` from `stack`, leaving every other layer in
 * order.
 *
 * @example
 * ```typescript
 * without([layer('dialog', { isModal: true }), layer('menu')], 'menu')
 * // [dialog]
 * ```
 */
export const without = (stack: Stack, id: string): Stack =>
  Array.filter(stack, existing => existing.id !== id)

/**
 * Removes the topmost layer from `stack`, or returns an empty stack when
 * already empty.
 *
 * @example
 * ```typescript
 * popped([layer('dialog', { isModal: true }), layer('menu')]) // [dialog]
 * ```
 */
export const popped = (stack: Stack): Stack =>
  Array.isReadonlyArrayEmpty(stack) ? stack : Array.dropRight(stack, 1)

// READINGS

const allowsEscape = (entry: Layer): boolean => entry.dismissesOnEscape ?? true

const allowsOutsidePress = (entry: Layer): boolean =>
  entry.dismissesOnOutsidePress ?? true

/**
 * The topmost open layer, or none when the stack is empty.
 *
 * @example
 * ```typescript
 * top([layer('dialog', { isModal: true }), layer('menu')]) // Some(menu)
 * top([]) // None
 * ```
 */
export const top = (stack: Stack): Option.Option<Layer> => Array.last(stack)

/**
 * The index of the layer named `id` in `stack`, or none when it is not
 * open.
 *
 * @example
 * ```typescript
 * indexOf([layer('dialog', { isModal: true }), layer('menu')], 'menu') // Some(1)
 * ```
 */
export const indexOf = (stack: Stack, id: string): Option.Option<number> =>
  Array.findFirstIndex(stack, entry => entry.id === id)

/**
 * True when the layer named `id` is the topmost layer in `stack`.
 *
 * @example
 * ```typescript
 * isTop([layer('dialog', { isModal: true }), layer('menu')], 'menu') // true
 * isTop([layer('dialog', { isModal: true }), layer('menu')], 'dialog') // false
 * ```
 */
export const isTop = (stack: Stack, id: string): boolean =>
  Option.exists(top(stack), entry => entry.id === id)

/**
 * The topmost modal layer in `stack`, or none when every open layer is
 * non-modal.
 *
 * @example
 * ```typescript
 * highestModal([layer('dialog', { isModal: true }), layer('menu')]) // Some(dialog)
 * highestModal([layer('menu')]) // None
 * ```
 */
export const highestModal = (stack: Stack): Option.Option<Layer> =>
  Array.findLast(stack, entry => entry.isModal)

/**
 * True when any open layer in `stack` is modal and therefore blocks pointer
 * events on everything beneath it.
 *
 * @example
 * ```typescript
 * isOutsidePointerBlocked([layer('menu')]) // false
 * isOutsidePointerBlocked([layer('dialog', { isModal: true }), layer('menu')]) // true
 * ```
 */
export const isOutsidePointerBlocked = (stack: Stack): boolean =>
  Option.isSome(highestModal(stack))

/**
 * True when pointer events are enabled for the layer named `id`. When a
 * modal layer is open, only that modal layer and layers stacked above it
 * receive pointer events; everything beneath it — and anything not in the
 * stack — is blocked.
 *
 * @example
 * ```typescript
 * const stack = [layer('popover'), layer('dialog', { isModal: true }), layer('menu')]
 * isPointerEnabled(stack, 'menu') // true
 * isPointerEnabled(stack, 'dialog') // true
 * isPointerEnabled(stack, 'popover') // false
 * ```
 */
export const isPointerEnabled = (stack: Stack, id: string): boolean => {
  const maybeModalIndex = Array.findLastIndex(stack, entry => entry.isModal)
  return Option.match(maybeModalIndex, {
    onNone: () => true,
    onSome: modalIndex =>
      Option.exists(indexOf(stack, id), layerIndex => layerIndex >= modalIndex),
  })
}

/**
 * The layer that handles Escape, or none when the stack is empty or the
 * topmost layer refuses Escape. Only the topmost layer ever handles Escape:
 * pressing Escape with a menu open over a dialog closes the menu, never the
 * dialog beneath it.
 *
 * @example
 * ```typescript
 * escapeTarget([layer('dialog', { isModal: true }), layer('menu')]) // Some(menu)
 * escapeTarget([layer('alert', { isModal: true, dismissesOnEscape: false })]) // None
 * ```
 */
export const escapeTarget = (stack: Stack): Option.Option<Layer> =>
  Option.filter(top(stack), allowsEscape)

/**
 * True when the layer named `id` should dismiss on Escape: it is the
 * topmost layer and allows Escape dismissal.
 *
 * @example
 * ```typescript
 * canDismissOnEscape([layer('dialog', { isModal: true }), layer('menu')], 'menu') // true
 * canDismissOnEscape([layer('dialog', { isModal: true }), layer('menu')], 'dialog') // false
 * ```
 */
export const canDismissOnEscape = (stack: Stack, id: string): boolean =>
  Option.exists(escapeTarget(stack), entry => entry.id === id)

/**
 * The single topmost layer that handles a pointer press outside `insideIds`,
 * or none when the stack is empty, the press landed inside the topmost
 * layer, or the topmost layer refuses outside-press dismissal.
 *
 * @example
 * ```typescript
 * const stack = [layer('dialog', { isModal: true }), layer('menu')]
 * outsidePressTarget(stack, ['dialog']) // Some(menu)
 * outsidePressTarget(stack, ['menu']) // None
 * ```
 */
export const outsidePressTarget = (
  stack: Stack,
  insideIds: ReadonlyArray<string> = [],
): Option.Option<Layer> =>
  pipe(
    top(stack),
    Option.filter(
      entry =>
        !Array.contains(insideIds, entry.id) &&
        allowsOutsidePress(entry) &&
        isPointerEnabled(stack, entry.id),
    ),
  )

/**
 * True when the layer named `id` should dismiss on a pointer press outside
 * `insideIds`: it is the topmost layer, the press is not inside it, it
 * allows outside-press dismissal, and pointer events are enabled for it.
 *
 * @example
 * ```typescript
 * canDismissOnOutsidePress([layer('menu')], 'menu', []) // true
 * canDismissOnOutsidePress([layer('menu')], 'menu', ['menu']) // false
 * ```
 */
export const canDismissOnOutsidePress = (
  stack: Stack,
  id: string,
  insideIds: ReadonlyArray<string> = [],
): boolean =>
  Option.exists(outsidePressTarget(stack, insideIds), entry => entry.id === id)

/**
 * Every layer, from top to bottom, that a pointer press outside `insideIds`
 * would dismiss when cascading through nested non-modal layers. Traversal
 * stops when it hits:
 * - a layer whose `id` is in `insideIds` (excluded),
 * - a layer that refuses outside-press dismissal (excluded), or
 * - a modal layer (included if it allows outside press, then stops because
 *   the modal shields every layer beneath it).
 *
 * @example
 * ```typescript
 * const nested = [layer('root-menu'), layer('sub-menu')]
 * dismissibleAbove(nested, []) // [sub-menu, root-menu]
 * dismissibleAbove(nested, ['root-menu']) // [sub-menu]
 *
 * const modalStack = [layer('page-popover'), layer('dialog', { isModal: true }), layer('menu')]
 * dismissibleAbove(modalStack, []) // [menu, dialog] (stops at modal dialog; page-popover untouched)
 * ```
 */
export const dismissibleAbove = (
  stack: Stack,
  insideIds: ReadonlyArray<string> = [],
): ReadonlyArray<Layer> => {
  const result: Array<Layer> = []
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const entry = stack[index]
    if (entry === undefined) {
      break
    }
    if (Array.contains(insideIds, entry.id) || !allowsOutsidePress(entry)) {
      break
    }
    result.push(entry)
    if (entry.isModal) {
      break
    }
  }
  return result
}
