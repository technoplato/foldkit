import { Array, Match as M, Option, Schema as S, String as Str } from 'effect'

import { ts } from '../schema/index.js'

// NOTE: this is the one place that decides focus trapping, nested scope
// pausing/resuming, initial focus resolution, Tab / Shift+Tab wrapping, and
// return-focus restoration for overlays (dialogs, alert dialogs, popovers,
// drawers). It keeps no state and reads no DOM: focusable targets are ordered
// IDs passed in by the Program or painter, and every Client calls these pure
// functions.

// SCHEMA

/**
 * One active focus scope on the stack: a dialog, alert dialog, popover, or
 * drawer.
 *
 * - `id` names the scope within the stack (`'settings-dialog'`, `'confirm-alert'`).
 * - `containerId` names the scope's root container element, used as the
 *   fallback focus target when no focusable descendant exists.
 * - `isTrapped` keeps keyboard and programmatic focus inside the scope while
 *   it is the topmost active scope.
 * - `loop` wraps Tab from last to first and Shift+Tab from first to last;
 *   defaults to `isTrapped` when omitted.
 * - `restoreFocus` restores focus when the scope closes or unmounts; defaults
 *   to `true` when omitted.
 * - `maybePreviouslyFocusedId` records which element had focus before this
 *   scope mounted.
 * - `maybeLastFocusedId` records the most recently focused element inside this
 *   scope, used to reclaim focus if it escapes while trapped.
 * - `branches` lists external element IDs (such as portalled child layers)
 *   that count as inside this scope without being reclaimed.
 *
 * @example
 * ```typescript
 * const dialogScope: Scope = scope('confirm-dialog', {
 *   containerId: 'confirm-dialog-panel',
 *   isTrapped: true,
 *   maybePreviouslyFocusedId: Option.some('delete-button'),
 * })
 * ```
 */
export const Scope = S.Struct({
  id: S.String,
  containerId: S.String,
  isTrapped: S.Boolean,
  loop: S.optionalKey(S.Boolean),
  restoreFocus: S.optionalKey(S.Boolean),
  maybePreviouslyFocusedId: S.Option(S.String),
  maybeLastFocusedId: S.Option(S.String),
  branches: S.optionalKey(S.Array(S.String)),
})
/** One active focus scope on the stack. */
export type Scope = typeof Scope.Type

/**
 * Active focus scopes ordered bottom-to-top: the last element is the single
 * active scope, and every scope beneath it is paused until higher scopes
 * unmount.
 *
 * @example
 * ```typescript
 * const stack: Stack = [
 *   scope('settings-dialog', { isTrapped: true }),
 *   scope('confirm-alert', { isTrapped: true }),
 * ]
 * ```
 */
export const Stack = S.Array(Scope)
/** Active focus scopes ordered bottom-to-top. */
export type Stack = typeof Stack.Type

/** Direction of a Tab traversal: `Forward` (`Tab`) or `Backward` (`Shift+Tab`). */
export const TabDirection = S.Literals(['Forward', 'Backward'])
/** Direction of a Tab traversal. */
export type TabDirection = typeof TabDirection.Type

/** The scope did not intercept Tab (paused, or untrapped without wrapping). */
export const PassThrough = ts('PassThrough')
/** The scope did not intercept Tab. */
export type PassThrough = typeof PassThrough.Type

/**
 * Focus moves to `targetId`.
 *
 * - `didWrap` is true when Tab wrapped from the last focusable to the first
 *   or Shift+Tab wrapped from the first to the last.
 * - `shouldPreventDefault` is true whenever a browser painter must call
 *   `preventDefault()` and move focus explicitly (wrap, outside redirect,
 *   empty-scope container hold, or edge clamp while trapped).
 */
export const MoveFocus = ts('MoveFocus', {
  targetId: S.String,
  didWrap: S.Boolean,
  shouldPreventDefault: S.Boolean,
})
/** Focus moves to `targetId`. */
export type MoveFocus = typeof MoveFocus.Type

/** Outcome of resolving a Tab / Shift+Tab key press inside a focus scope. */
export const TabResolution = S.Union([PassThrough, MoveFocus])
/** Outcome of resolving a Tab / Shift+Tab key press inside a focus scope. */
export type TabResolution = typeof TabResolution.Type

// CONSTRUCTORS

/**
 * Builds a {@link Scope} with sensible defaults: `containerId` defaults to
 * `id`, `isTrapped` defaults to `true`, and previous/last focus targets start
 * as `Option.none()`.
 *
 * @example
 * ```typescript
 * scope('confirm-dialog') // { id: 'confirm-dialog', containerId: 'confirm-dialog', isTrapped: true, ... }
 * scope('popover', { isTrapped: false, loop: true })
 * ```
 */
export const scope = (
  id: string,
  options: Readonly<{
    containerId?: string
    isTrapped?: boolean
    loop?: boolean
    restoreFocus?: boolean
    maybePreviouslyFocusedId?: Option.Option<string>
    maybeLastFocusedId?: Option.Option<string>
    branches?: ReadonlyArray<string>
  }> = {},
): Scope => ({
  id,
  containerId: options.containerId ?? id,
  isTrapped: options.isTrapped ?? true,
  ...(options.loop === undefined ? {} : { loop: options.loop }),
  ...(options.restoreFocus === undefined
    ? {}
    : { restoreFocus: options.restoreFocus }),
  maybePreviouslyFocusedId: options.maybePreviouslyFocusedId ?? Option.none(),
  maybeLastFocusedId: options.maybeLastFocusedId ?? Option.none(),
  ...(options.branches === undefined ? {} : { branches: options.branches }),
})

// STACK OPERATIONS

/**
 * Pushes `entry` onto the top of `stack`, making it the active scope and
 * pausing any scope beneath it. If a scope with the same `id` is already
 * present, it moves to the top with the new settings.
 *
 * @example
 * ```typescript
 * pushed([scope('parent')], scope('child')) // [parent (paused), child (active)]
 * ```
 */
export const pushed = (stack: Stack, entry: Scope): Stack => [
  ...Array.filter(stack, existing => existing.id !== entry.id),
  entry,
]

/**
 * Removes the scope named `id` from `stack`, resuming whichever scope is now
 * on top.
 *
 * @example
 * ```typescript
 * without([scope('parent'), scope('child')], 'child') // [parent (active)]
 * ```
 */
export const without = (stack: Stack, id: string): Stack =>
  Array.filter(stack, existing => existing.id !== id)

/**
 * Removes the topmost scope from `stack`, resuming the scope beneath it, or
 * returns an empty stack when already empty.
 *
 * @example
 * ```typescript
 * popped([scope('parent'), scope('child')]) // [parent (active)]
 * ```
 */
export const popped = (stack: Stack): Stack =>
  Array.isReadonlyArrayEmpty(stack) ? stack : Array.dropRight(stack, 1)

/**
 * Updates the scope named `id` in `stack` via `transform`, leaving every
 * other scope and stack order untouched.
 *
 * @example
 * ```typescript
 * updateScope([scope('dialog')], 'dialog', current => ({
 *   ...current,
 *   maybeLastFocusedId: Option.some('confirm-btn'),
 * }))
 * ```
 */
export const updateScope = (
  stack: Stack,
  id: string,
  transform: (current: Scope) => Scope,
): Stack =>
  Array.map(stack, entry => (entry.id === id ? transform(entry) : entry))

// STACK READINGS

/**
 * The single active (topmost) focus scope in `stack`, or none when empty.
 *
 * @example
 * ```typescript
 * active([scope('parent'), scope('child')]) // Some(child)
 * active([]) // None
 * ```
 */
export const active = (stack: Stack): Option.Option<Scope> => Array.last(stack)

/**
 * The index of the scope named `id` in `stack`, or none when not mounted.
 *
 * @example
 * ```typescript
 * indexOf([scope('parent'), scope('child')], 'parent') // Some(0)
 * ```
 */
export const indexOf = (stack: Stack, id: string): Option.Option<number> =>
  Array.findFirstIndex(stack, entry => entry.id === id)

/**
 * True when the scope named `id` is present anywhere in `stack`.
 *
 * @example
 * ```typescript
 * isMember([scope('parent'), scope('child')], 'parent') // true
 * ```
 */
export const isMember = (stack: Stack, id: string): boolean =>
  Option.isSome(indexOf(stack, id))

/**
 * True when the scope named `id` is the topmost active scope in `stack`.
 *
 * @example
 * ```typescript
 * isActive([scope('parent'), scope('child')], 'child') // true
 * isActive([scope('parent'), scope('child')], 'parent') // false
 * ```
 */
export const isActive = (stack: Stack, id: string): boolean =>
  Option.exists(active(stack), entry => entry.id === id)

/**
 * True when the scope named `id` is mounted in `stack` but paused because
 * another scope is stacked above it.
 *
 * @example
 * ```typescript
 * isPaused([scope('parent'), scope('child')], 'parent') // true
 * isPaused([scope('parent'), scope('child')], 'child') // false
 * isPaused([scope('parent')], 'parent') // false
 * ```
 */
export const isPaused = (stack: Stack, id: string): boolean =>
  isMember(stack, id) && !isActive(stack, id)

/**
 * The IDs of all scopes in `stack` that are currently paused beneath the
 * topmost active scope, ordered bottom-to-top.
 *
 * @example
 * ```typescript
 * pausedIds([scope('a'), scope('b'), scope('c')]) // ['a', 'b']
 * pausedIds([scope('a')]) // []
 * ```
 */
export const pausedIds = (stack: Stack): ReadonlyArray<string> =>
  Array.isReadonlyArrayEmpty(stack)
    ? []
    : Array.map(Array.dropRight(stack, 1), entry => entry.id)

/**
 * True when `targetId` belongs to the focus scope: it is the scope's
 * container, one of its focusable targets, or one of its registered branches.
 *
 * @example
 * ```typescript
 * isTargetInScope(
 *   { containerId: 'dialog-panel', focusableIds: ['cancel', 'confirm'], branches: ['popover-panel'] },
 *   'popover-panel',
 * ) // true
 * ```
 */
export const isTargetInScope = (
  input: Readonly<{
    containerId: string
    focusableIds: ReadonlyArray<string>
    branches?: ReadonlyArray<string>
  }>,
  targetId: string,
): boolean =>
  targetId === input.containerId ||
  Array.contains(input.focusableIds, targetId) ||
  Array.contains(input.branches ?? [], targetId)

// FOCUS RESOLUTION

/**
 * Resolves which element should receive focus when a focus scope opens or
 * mounts:
 *
 * 1. Returns `Option.none()` when `autoFocus` is `false`.
 * 2. Uses `maybeInitialFocusId` when it is `Some(id)` and `id` is present in
 *    `focusableIds` or equals `containerId`.
 * 3. Otherwise uses the first ID in `focusableIds`.
 * 4. Otherwise falls back to `containerId` (when non-empty).
 *
 * @example
 * ```typescript
 * resolveInitialFocus({
 *   containerId: 'dialog-panel',
 *   focusableIds: ['name-input', 'save-btn'],
 *   maybeInitialFocusId: Option.some('save-btn'),
 * }) // Some('save-btn')
 *
 * resolveInitialFocus({
 *   containerId: 'dialog-panel',
 *   focusableIds: [],
 * }) // Some('dialog-panel')
 * ```
 */
export const resolveInitialFocus = (
  input: Readonly<{
    containerId: string
    focusableIds: ReadonlyArray<string>
    maybeInitialFocusId?: Option.Option<string>
    autoFocus?: boolean
  }>,
): Option.Option<string> => {
  if (input.autoFocus === false) {
    return Option.none()
  }

  const maybeExplicit = Option.filter(
    input.maybeInitialFocusId ?? Option.none(),
    targetId =>
      !Str.isEmpty(targetId) &&
      (Array.contains(input.focusableIds, targetId) ||
        targetId === input.containerId),
  )
  if (Option.isSome(maybeExplicit)) {
    return maybeExplicit
  }

  const maybeFirst = Array.head(input.focusableIds)
  if (Option.isSome(maybeFirst)) {
    return maybeFirst
  }

  return Str.isEmpty(input.containerId)
    ? Option.none()
    : Option.some(input.containerId)
}

/**
 * Resolves a `Tab` (`Forward`) or `Shift+Tab` (`Backward`) key press inside a
 * focus scope.
 *
 * - Returns `PassThrough()` when the scope is paused or when both `isTrapped`
 *   and `loop` are `false`.
 * - When `focusableIds` is empty: traps focus on `containerId` if `isTrapped`,
 *   otherwise passes through.
 * - When current focus is outside `focusableIds` (or `None`): redirects to the
 *   first focusable on `Forward` or the last on `Backward` if `isTrapped`,
 *   otherwise passes through.
 * - When at the edge (last on `Forward`, first on `Backward`): wraps to the
 *   opposite edge if `loop` is enabled (defaults to `isTrapped`), stays on the
 *   edge with `shouldPreventDefault: true` if trapped without `loop`, or
 *   passes through if untrapped without `loop`.
 * - Otherwise moves linearly to the adjacent focusable target with
 *   `didWrap: false` and `shouldPreventDefault: false`.
 *
 * @example
 * ```typescript
 * stepTab({
 *   containerId: 'dialog-panel',
 *   focusableIds: ['cancel', 'confirm'],
 *   maybeCurrentId: Option.some('confirm'),
 *   direction: 'Forward',
 *   isTrapped: true,
 * }) // MoveFocus({ targetId: 'cancel', didWrap: true, shouldPreventDefault: true })
 * ```
 */
export const stepTab = (
  input: Readonly<{
    containerId: string
    focusableIds: ReadonlyArray<string>
    maybeCurrentId: Option.Option<string>
    direction: TabDirection
    isTrapped?: boolean
    loop?: boolean
    isPaused?: boolean
  }>,
): TabResolution => {
  const isTrapped = input.isTrapped ?? true
  const loop = input.loop ?? isTrapped
  const isScopePaused = input.isPaused ?? false

  if (isScopePaused || (!isTrapped && !loop)) {
    return PassThrough()
  }

  if (!Array.isReadonlyArrayNonEmpty(input.focusableIds)) {
    return isTrapped && !Str.isEmpty(input.containerId)
      ? MoveFocus({
          targetId: input.containerId,
          didWrap: false,
          shouldPreventDefault: true,
        })
      : PassThrough()
  }

  const first = Array.headNonEmpty(input.focusableIds)
  const last = Array.lastNonEmpty(input.focusableIds)
  const maybeCurrentIndex = Option.flatMap(input.maybeCurrentId, currentId =>
    Array.findFirstIndex(input.focusableIds, id => id === currentId),
  )

  return Option.match(maybeCurrentIndex, {
    onNone: () => {
      if (!isTrapped) {
        return PassThrough()
      }
      const targetId = input.direction === 'Forward' ? first : last
      return MoveFocus({
        targetId,
        didWrap: false,
        shouldPreventDefault: true,
      })
    },
    onSome: currentIndex =>
      M.value(input.direction).pipe(
        M.withReturnType<TabResolution>(),
        M.when('Forward', () => {
          const isAtLast = currentIndex === input.focusableIds.length - 1
          if (isAtLast) {
            if (loop) {
              return MoveFocus({
                targetId: first,
                didWrap: true,
                shouldPreventDefault: true,
              })
            } else if (isTrapped) {
              return MoveFocus({
                targetId: last,
                didWrap: false,
                shouldPreventDefault: true,
              })
            } else {
              return PassThrough()
            }
          }
          return Option.match(Array.get(input.focusableIds, currentIndex + 1), {
            onNone: () => PassThrough(),
            onSome: targetId =>
              MoveFocus({
                targetId,
                didWrap: false,
                shouldPreventDefault: false,
              }),
          })
        }),
        M.when('Backward', () => {
          const isAtFirst = currentIndex === 0
          if (isAtFirst) {
            if (loop) {
              return MoveFocus({
                targetId: last,
                didWrap: true,
                shouldPreventDefault: true,
              })
            } else if (isTrapped) {
              return MoveFocus({
                targetId: first,
                didWrap: false,
                shouldPreventDefault: true,
              })
            } else {
              return PassThrough()
            }
          }
          return Option.match(Array.get(input.focusableIds, currentIndex - 1), {
            onNone: () => PassThrough(),
            onSome: targetId =>
              MoveFocus({
                targetId,
                didWrap: false,
                shouldPreventDefault: false,
              }),
          })
        }),
        M.exhaustive,
      ),
  })
}

/**
 * Resolves a keyboard event key (`'Tab'` with optional `shiftKey`) through
 * {@link stepTab}. Returns `PassThrough()` for any non-Tab key or when
 * modifier keys (`altKey`, `ctrlKey`, `metaKey`) or IME composition are active.
 *
 * @example
 * ```typescript
 * resolveTabKey({
 *   key: 'Tab',
 *   shiftKey: true,
 *   containerId: 'dialog-panel',
 *   focusableIds: ['cancel', 'confirm'],
 *   maybeCurrentId: Option.some('cancel'),
 *   isTrapped: true,
 * }) // MoveFocus({ targetId: 'confirm', didWrap: true, shouldPreventDefault: true })
 * ```
 */
export const resolveTabKey = (
  input: Readonly<{
    key: string
    shiftKey?: boolean
    altKey?: boolean
    ctrlKey?: boolean
    metaKey?: boolean
    isComposing?: boolean
    containerId: string
    focusableIds: ReadonlyArray<string>
    maybeCurrentId: Option.Option<string>
    isTrapped?: boolean
    loop?: boolean
    isPaused?: boolean
  }>,
): TabResolution => {
  if (
    input.key !== 'Tab' ||
    input.altKey === true ||
    input.ctrlKey === true ||
    input.metaKey === true ||
    input.isComposing === true
  ) {
    return PassThrough()
  }

  return stepTab({
    containerId: input.containerId,
    focusableIds: input.focusableIds,
    maybeCurrentId: input.maybeCurrentId,
    direction: input.shiftKey === true ? 'Backward' : 'Forward',
    ...(input.isTrapped === undefined ? {} : { isTrapped: input.isTrapped }),
    ...(input.loop === undefined ? {} : { loop: input.loop }),
    ...(input.isPaused === undefined ? {} : { isPaused: input.isPaused }),
  })
}

/**
 * Resolves where focus should be reclaimed when `targetId` receives focus
 * outside a trapped, unpaused focus scope.
 *
 * - Returns `Option.none()` when the scope is paused, not trapped, or
 *   `targetId` is already inside the scope (container, focusables, or
 *   registered branches).
 * - Otherwise reclaims focus to `maybeLastFocusedId` if it is still valid
 *   inside the scope, else the first focusable target, else `containerId`.
 *
 * @example
 * ```typescript
 * resolveOutsideFocus({
 *   containerId: 'dialog-panel',
 *   focusableIds: ['cancel', 'confirm'],
 *   targetId: 'page-header',
 *   maybeLastFocusedId: Option.some('confirm'),
 *   isTrapped: true,
 * }) // Some('confirm')
 * ```
 */
export const resolveOutsideFocus = (
  input: Readonly<{
    containerId: string
    focusableIds: ReadonlyArray<string>
    targetId: string
    maybeLastFocusedId?: Option.Option<string>
    branches?: ReadonlyArray<string>
    isTrapped?: boolean
    isPaused?: boolean
  }>,
): Option.Option<string> => {
  const isTrapped = input.isTrapped ?? true
  const isScopePaused = input.isPaused ?? false

  if (
    isScopePaused ||
    !isTrapped ||
    isTargetInScope(
      {
        containerId: input.containerId,
        focusableIds: input.focusableIds,
        ...(input.branches === undefined ? {} : { branches: input.branches }),
      },
      input.targetId,
    )
  ) {
    return Option.none()
  }

  const maybeLastValid = Option.filter(
    input.maybeLastFocusedId ?? Option.none(),
    lastId =>
      !Str.isEmpty(lastId) &&
      (Array.contains(input.focusableIds, lastId) ||
        lastId === input.containerId),
  )
  if (Option.isSome(maybeLastValid)) {
    return maybeLastValid
  }

  const maybeFirst = Array.head(input.focusableIds)
  if (Option.isSome(maybeFirst)) {
    return maybeFirst
  }

  return Str.isEmpty(input.containerId)
    ? Option.none()
    : Option.some(input.containerId)
}

/**
 * Resolves which element should receive focus when a focus scope closes or
 * unmounts:
 *
 * 1. Returns `Option.none()` when `restoreFocus` is `false`.
 * 2. Uses `maybeReturnFocusId` (an explicit final focus target) when present
 *    and passing `isPresent`.
 * 3. Else uses `maybePreviouslyFocusedId` (the element focused before the
 *    scope mounted) when present and passing `isPresent`.
 * 4. Else uses `maybeFallbackId` (such as the trigger button) when present
 *    and passing `isPresent`.
 * 5. Else returns `Option.none()`.
 *
 * @example
 * ```typescript
 * resolveReturnFocus({
 *   maybePreviouslyFocusedId: Option.some('open-dialog-btn'),
 * }) // Some('open-dialog-btn')
 *
 * resolveReturnFocus({
 *   restoreFocus: false,
 *   maybePreviouslyFocusedId: Option.some('open-dialog-btn'),
 * }) // None
 * ```
 */
export const resolveReturnFocus = (
  input: Readonly<{
    restoreFocus?: boolean
    maybeReturnFocusId?: Option.Option<string>
    maybePreviouslyFocusedId?: Option.Option<string>
    maybeFallbackId?: Option.Option<string>
    isPresent?: (id: string) => boolean
  }>,
): Option.Option<string> => {
  if (input.restoreFocus === false) {
    return Option.none()
  }

  const isPresent = input.isPresent ?? (() => true)
  const isValid = (id: string): boolean => !Str.isEmpty(id) && isPresent(id)

  const candidates: ReadonlyArray<Option.Option<string>> = [
    input.maybeReturnFocusId ?? Option.none(),
    input.maybePreviouslyFocusedId ?? Option.none(),
    input.maybeFallbackId ?? Option.none(),
  ]

  return Option.flatMap(
    Array.findFirst(candidates, candidate => Option.exists(candidate, isValid)),
    found => found,
  )
}
