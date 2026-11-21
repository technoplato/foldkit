import { Array, Match as M, Option, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import * as Command from '../command/index.js'
import { define, ignore, to, when } from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'
import * as Part from './part.js'
import * as Presence from './presence.js'
import type { LivePoliteness, SlotProps } from './slot.js'
import * as TimedHint from './timedHint.js'

// NOTE: this is the core Toast Part (Widget #10 of 54, Scribe #2625).
// It composes `TimedHint` and `Presence` in one framework-free Machine and
// Part declaration covering packages/ui Toast, Zag toast, and Radix toast.
// Its state (`Empty` | `Showing`) lives in the Model, synced by default
// (`Navigation` category, `Pace.Synced`) with a device-only option, and
// projects reference-stable SlotBindings (`Region`, `Entry`, `Title`,
// `Description`, `DismissButton`) rendered by HTML, React, and React Native
// generic hosts with zero Toast-specific painter logic.

// CONSTANTS

/** Default auto-dismiss duration in milliseconds (`4000`, matching `@foldkit/ui` Toast). */
export const defaultDurationMs = 4000

/** Default accessible label for the toast region landmark. */
export const defaultLabel = 'Notifications'

/** Default accessible label for a toast entry's dismiss button. */
export const defaultDismissLabel = 'Dismiss notification'

// SCHEMAS

/**
 * Semantic category of a toast. Drives the ARIA role and live politeness:
 * `'Status'` / `'Polite'` for `'Info'` and `'Success'`, `'Alert'` /
 * `'Assertive'` for `'Warning'` and `'Error'`.
 */
export const Variant = S.Literals(['Info', 'Success', 'Warning', 'Error'])
/** Semantic category of a toast. */
export type Variant = typeof Variant.Type

/** Default toast variant when omitted on {@link ShowToast}. */
export const defaultVariant: Variant = 'Info'

/** Where the toast viewport is anchored on the screen and how entries stack. */
export const Position = S.Literals([
  'TopLeft',
  'TopCenter',
  'TopRight',
  'BottomLeft',
  'BottomCenter',
  'BottomRight',
])
/** Where the toast viewport is anchored on the screen. */
export type Position = typeof Position.Type

/** Default viewport anchor position. */
export const defaultPosition: Position = 'BottomRight'

/**
 * Read-only configuration supplied to the Toast chart and projection from
 * the Program's Model.
 */
export const Props = S.Struct({
  id: S.String,
  position: S.optionalKey(Position),
  defaultDurationMs: S.optionalKey(S.Number),
  isAnimated: S.optionalKey(S.Boolean),
  maxVisible: S.optionalKey(S.Number),
  label: S.optionalKey(S.String),
  dismissLabel: S.optionalKey(S.String),
  pauseOnHover: S.optionalKey(S.Boolean),
})
/** Read-only configuration supplied to the Toast chart and projection. */
export type Props = typeof Props.Type

/** One toast notification entry in the stack, as plain JSON-serializable data. */
export const Entry = S.Struct({
  id: S.String,
  variant: Variant,
  title: S.String,
  maybeDescription: S.Option(S.String),
  presence: Presence.State,
  hint: TimedHint.State,
})
/** One toast notification entry in the stack. */
export type Entry = typeof Entry.Type

// STATE

/** No toast entries are currently mounted. `nextEntryKey` rises monotonically so IDs never collide. */
export const Empty = ts('Empty', {
  nextEntryKey: S.Number,
})
/** No toast entries are currently mounted. */
export type Empty = typeof Empty.Type

/** One or more toast entries are mounted (entering, open, or animating out). */
export const Showing = ts('Showing', {
  entries: S.Array(Entry),
  nextEntryKey: S.Number,
})
/** One or more toast entries are mounted. */
export type Showing = typeof Showing.Type

/** Where a Toast Part stands: `Empty` or `Showing`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Empty, Showing])
/** Where a Toast Part stands. */
export type State = typeof State.Type

/** Initial Toast state: empty stack with `nextEntryKey: 0`. */
export const initial: State = Empty({ nextEntryKey: 0 })

// ACTIONS (Catalog Actions — what a person or agent does on purpose)

const chooseEntry: Readonly<{
  field: 'entryId'
  noun: string
  prompt: string
  token: typeof S.String
  choicesOf: () => ReadonlyArray<never>
  accepts: () => ReturnType<typeof Catalog.Enabled>
  nothingToChoose: string
}> = {
  field: 'entryId',
  noun: 'notification',
  prompt: 'Which notification?',
  token: S.String,
  choicesOf: () => [],
  accepts: () => Catalog.Enabled(),
  nothingToChoose: 'No notification is active',
}

/** Appends a new toast notification to the stack. */
export const ShowToast = Catalog.action('ShowToast', {
  fields: {
    title: S.String,
    description: S.optionalKey(S.String),
    variant: S.optionalKey(Variant),
    durationMs: S.optionalKey(S.Number),
    isSticky: S.optionalKey(S.Boolean),
  },
  what: 'Adds a notification to the stack',
  why: 'To inform the user of an outcome or status update',
  meta: { label: 'Show notification', keys: [] },
})

/** Dismisses one active toast notification by its entry id. */
export const DismissToast = Catalog.action('DismissToast', {
  fields: { entryId: S.String },
  choose: chooseEntry,
  what: 'Removes the chosen notification from view',
  why: 'To clear an announcement after reading it',
  meta: { label: 'Dismiss notification', keys: [] },
})

/** Dismisses every currently visible toast notification at once. */
export const DismissAllToasts = Catalog.action('DismissAllToasts', {
  what: 'Clears every active notification from the stack',
  why: 'To remove all announcements at once',
  meta: { label: 'Dismiss all notifications', keys: [] },
})

/** The Catalog Actions a Toast Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  ShowToast,
  DismissToast,
  DismissAllToasts,
]

// MESSAGES (Facts in addition to the Actions above)

/** Pointer or focus entered a toast entry, pausing its auto-dismiss countdown. */
export const HoverToast = m('HoverToast', { entryId: S.String })

/** Pointer or focus left a toast entry, resuming its auto-dismiss countdown. */
export const LeaveToast = m('LeaveToast', { entryId: S.String })

/** Double-rAF completed for an animated toast entry (`EnterStart` -> `EnterAnimating` or `LeaveStart` -> `LeaveAnimating`). */
export const AdvanceToastFrame = m('AdvanceToastFrame', { entryId: S.String })

/** CSS or native animation settled for an animated toast entry (`EnterAnimating` -> `Open` or `LeaveAnimating` -> removed). */
export const EndToastAnimation = m('EndToastAnimation', { entryId: S.String })

/** The auto-dismiss wait for `entryId` at `version` elapsed. */
export const ElapsedToast = m('ElapsedToast', {
  entryId: S.String,
  version: S.Number,
})

/** Every Message the Toast chart handles. */
export const Message = S.Union([
  ShowToast,
  DismissToast,
  DismissAllToasts,
  HoverToast,
  LeaveToast,
  AdvanceToastFrame,
  EndToastAnimation,
  ElapsedToast,
])
/** Every Message the Toast chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Toast Part. */
export const isMessage = S.is(Message)

// COMMAND

/** Waits `afterMs` milliseconds and answers `ElapsedToast({ entryId, version })`. */
export const WaitForToastElapsed = Command.define(
  'WaitForToastElapsed',
  { entryId: S.String, version: S.Number, afterMs: S.Number },
  ElapsedToast,
)(({ entryId, version, afterMs }) =>
  Command.answerAfter(afterMs, ElapsedToast({ entryId, version })),
)

// ELEMENT IDS

/** Derives the toast viewport region element id from a Toast's base `id`. */
export const regionId = (id: string): string => `${id}-region`

/**
 * Derives one toast entry element id from a Toast's base `id` and monotonic
 * `key` (`${id}-entry-${key}`, matching `@foldkit/ui` Toast).
 */
export const entryId = (id: string, key: number): string => `${id}-entry-${key}`

/** Derives the title element id for a toast entry. */
export const titleId = (entryIdValue: string): string => `${entryIdValue}-title`

/** Derives the description element id for a toast entry. */
export const descriptionId = (entryIdValue: string): string =>
  `${entryIdValue}-description`

/** Derives the dismiss button element id for a toast entry. */
export const dismissButtonId = (entryIdValue: string): string =>
  `${entryIdValue}-dismiss`

// PURE RULES & READINGS

/**
 * Maps a {@link Variant} to its `Slot.Role`: `'Status'` for `'Info'` /
 * `'Success'`, `'Alert'` for `'Warning'` / `'Error'`.
 *
 * @example
 * ```typescript
 * variantRoleOf('Info') // 'Status'
 * variantRoleOf('Error') // 'Alert'
 * ```
 */
export const variantRoleOf = (variant: Variant): 'Status' | 'Alert' =>
  M.value(variant).pipe(
    M.withReturnType<'Status' | 'Alert'>(),
    M.when('Info', () => 'Status'),
    M.when('Success', () => 'Status'),
    M.when('Warning', () => 'Alert'),
    M.when('Error', () => 'Alert'),
    M.exhaustive,
  )

/**
 * Maps a {@link Variant} to its lowercase ARIA role string (`'status'` or
 * `'alert'`), shared with thin HTML painters such as `@foldkit/ui` Toast.
 */
export const variantAriaRoleOf = (variant: Variant): 'status' | 'alert' =>
  variantRoleOf(variant) === 'Status' ? 'status' : 'alert'

/**
 * Maps a {@link Variant} to its ARIA live-region politeness: `'Polite'` for
 * `'Info'` / `'Success'`, `'Assertive'` for `'Warning'` / `'Error'`.
 */
export const variantLiveOf = (variant: Variant): LivePoliteness =>
  variantRoleOf(variant) === 'Status' ? 'Polite' : 'Assertive'

/** Resolved viewport anchor position (defaults to `'BottomRight'`). */
export const positionOf = (props: Pick<Props, 'position'>): Position =>
  props.position ?? defaultPosition

/** Resolved default auto-dismiss duration in ms (defaults to `4000`). */
export const defaultDurationMsOf = (
  props: Pick<Props, 'defaultDurationMs'>,
): number => props.defaultDurationMs ?? defaultDurationMs

/** Resolved `isAnimated` flag (defaults to `false`). */
export const isAnimatedOf = (props: Pick<Props, 'isAnimated'>): boolean =>
  props.isAnimated === true

/** Optional cap on simultaneously visible (non-leaving) toast entries. */
export const maxVisibleOf = (
  props: Pick<Props, 'maxVisible'>,
): Option.Option<number> =>
  Option.filter(Option.fromNullishOr(props.maxVisible), max => max >= 1)

/** Resolved accessible label for the toast region (defaults to `'Notifications'`). */
export const labelOf = (props: Pick<Props, 'label'>): string =>
  props.label ?? defaultLabel

/** Resolved accessible label for a toast entry's dismiss button. */
export const dismissLabelOf = (props: Pick<Props, 'dismissLabel'>): string =>
  props.dismissLabel ?? defaultDismissLabel

/** True when pointer hover / focus pauses auto-dismiss timers (`true` by default). */
export const pauseOnHoverOf = (props: Pick<Props, 'pauseOnHover'>): boolean =>
  props.pauseOnHover ?? true

/** True when `key` dismisses a focused toast (`'Escape'`). */
export const isDismissKey = (key: string): boolean => key === 'Escape'

/**
 * Resolves the effective auto-dismiss duration in milliseconds for a new
 * toast entry. `isSticky: true` always wins over an explicit `durationMs`
 * and returns `Option.none()`.
 *
 * @example
 * ```typescript
 * resolveDurationMs({ defaultDurationMs: 4000 }) // Some(4000)
 * resolveDurationMs({ defaultDurationMs: 4000, durationMs: 1500 }) // Some(1500)
 * resolveDurationMs({ defaultDurationMs: 4000, durationMs: 1500, isSticky: true }) // None
 * ```
 */
export const resolveDurationMs = (
  input: Readonly<{
    defaultDurationMs: number
    durationMs?: number
    isSticky?: boolean
  }>,
): Option.Option<number> =>
  input.isSticky === true
    ? Option.none()
    : Option.some(input.durationMs ?? input.defaultDurationMs)

/** All mounted toast entries (including entries currently animating out). */
export const entriesOf = (state: State): ReadonlyArray<Entry> =>
  M.value(state).pipe(
    M.withReturnType<ReadonlyArray<Entry>>(),
    M.tagsExhaustive({
      Empty: () => [],
      Showing: ({ entries }) => entries,
    }),
  )

/** Number of mounted toast entries. */
export const entryCountOf = (state: State): number => entriesOf(state).length

/** True when no toast entries are mounted. */
export const isEmpty = (state: State): boolean => state._tag === 'Empty'

/** Current monotonic entry key counter. */
export const nextEntryKeyOf = (state: State): number => state.nextEntryKey

/** Looks up one mounted toast entry by its `id`. */
export const entryById = (state: State, id: string): Option.Option<Entry> =>
  Array.findFirst(entriesOf(state), entry => entry.id === id)

/** Entries whose visibility intent is still open (not leaving). */
export const visibleEntriesOf = (state: State): ReadonlyArray<Entry> =>
  Array.filter(entriesOf(state), entry => Presence.isShowing(entry.presence))

/** True when the entry with `id` is currently paused (hovered or focused). */
export const isEntryPaused = (state: State, id: string): boolean =>
  Option.exists(entryById(state, id), entry => TimedHint.isPaused(entry.hint))

/** True when the entry with `id` is currently animating out. */
export const isEntryLeaving = (state: State, id: string): boolean =>
  Option.exists(entryById(state, id), entry =>
    Presence.isLeaving(entry.presence),
  )

/** Standard `data-state` (`'open' | 'closed'`) for the entry with `id`. */
export const entryDataStateOf = (
  state: State,
  id: string,
): Presence.DataState =>
  Option.match(entryById(state, id), {
    onNone: () => 'closed',
    onSome: entry => Presence.dataStateOf(entry.presence),
  })

/** Current 5-phase {@link Presence.TransitionPhase} for the entry with `id`. */
export const entryTransitionPhaseOf = (
  state: State,
  id: string,
): Presence.TransitionPhase =>
  Option.match(entryById(state, id), {
    onNone: () => 'Idle',
    onSome: entry => Presence.transitionPhaseOf(entry.presence),
  })

// INTERNAL TRANSITION HELPERS

const waitCommandsFor = (
  id: string,
  hint: TimedHint.State,
  hintCommands: ReadonlyArray<Command.Command<TimedHint.Message>>,
): ReadonlyArray<Command.Command<Message>> =>
  Array.isReadonlyArrayNonEmpty(hintCommands)
    ? Option.match(TimedHint.durationMsOf(hint), {
        onNone: () => [],
        onSome: afterMs => [
          WaitForToastElapsed({
            entryId: id,
            version: TimedHint.versionOf(hint),
            afterMs,
          }),
        ],
      })
    : []

const buildEntry = (
  id: string,
  message: typeof ShowToast.Type,
  props: Props,
): readonly [Entry, ReadonlyArray<Command.Command<Message>>] => {
  const [presence] = Presence.chart.transition(
    Presence.Closed(),
    Presence.Show(),
    { isAnimated: isAnimatedOf(props) },
  )
  const maybeDurationMs = resolveDurationMs({
    defaultDurationMs: defaultDurationMsOf(props),
    ...(message.durationMs === undefined
      ? {}
      : { durationMs: message.durationMs }),
    ...(message.isSticky === undefined ? {} : { isSticky: message.isSticky }),
  })
  const [hint, hintCommands] = TimedHint.chart.transition(
    TimedHint.initial,
    TimedHint.ShowHint({ maybeDurationMs }),
  )
  const entry: Entry = {
    id,
    variant: message.variant ?? defaultVariant,
    title: message.title,
    maybeDescription: Option.fromNullishOr(message.description),
    presence,
    hint,
  }
  return [entry, waitCommandsFor(id, hint, hintCommands)]
}

const dismissEntry = (entry: Entry, props: Props): Option.Option<Entry> => {
  const [nextPresence] = Presence.chart.transition(
    entry.presence,
    Presence.Hide(),
    { isAnimated: isAnimatedOf(props) },
  )
  const [nextHint] = TimedHint.chart.transition(
    entry.hint,
    TimedHint.DismissHint(),
  )
  return Presence.isMounted(nextPresence)
    ? Option.some({ ...entry, presence: nextPresence, hint: nextHint })
    : Option.none()
}

const enforceMaxVisible = (
  entries: ReadonlyArray<Entry>,
  props: Props,
): ReadonlyArray<Entry> =>
  Option.match(maxVisibleOf(props), {
    onNone: () => entries,
    onSome: max => {
      const showingCount = Array.filter(entries, entry =>
        Presence.isShowing(entry.presence),
      ).length
      const excess = showingCount - max
      if (excess <= 0) {
        return entries
      }
      const evictIds = Array.map(
        Array.take(
          Array.filter(entries, entry => Presence.isShowing(entry.presence)),
          excess,
        ),
        entry => entry.id,
      )
      return Array.flatMap(entries, entry =>
        Array.contains(evictIds, entry.id)
          ? Option.toArray(dismissEntry(entry, props))
          : [entry],
      )
    },
  })

const dismissOne = (
  entries: ReadonlyArray<Entry>,
  targetId: string,
  props: Props,
): Option.Option<ReadonlyArray<Entry>> => {
  const maybeTarget = Array.findFirst(entries, entry => entry.id === targetId)
  if (
    Option.isNone(maybeTarget) ||
    Presence.isLeaving(maybeTarget.value.presence)
  ) {
    return Option.none()
  }
  return Option.some(
    Array.flatMap(entries, entry =>
      entry.id === targetId
        ? Option.toArray(dismissEntry(entry, props))
        : [entry],
    ),
  )
}

const dismissAllEntries = (
  entries: ReadonlyArray<Entry>,
  props: Props,
): Option.Option<ReadonlyArray<Entry>> => {
  const hasDismissible = Array.some(entries, entry =>
    Presence.isShowing(entry.presence),
  )
  if (!hasDismissible) {
    return Option.none()
  }
  return Option.some(
    Array.flatMap(entries, entry =>
      Presence.isShowing(entry.presence)
        ? Option.toArray(dismissEntry(entry, props))
        : [entry],
    ),
  )
}

const stepEntryHint = (
  entries: ReadonlyArray<Entry>,
  targetId: string,
  hintMessage: TimedHint.Message,
): Option.Option<
  readonly [ReadonlyArray<Entry>, ReadonlyArray<Command.Command<Message>>]
> => {
  const maybeTarget = Array.findFirst(entries, entry => entry.id === targetId)
  if (
    Option.isNone(maybeTarget) ||
    Presence.isLeaving(maybeTarget.value.presence)
  ) {
    return Option.none()
  }
  const stepped = TimedHint.chart.step(maybeTarget.value.hint, hintMessage)
  if (stepped._tag !== 'Transitioned') {
    return Option.none()
  }
  const nextEntries = Array.map(entries, entry =>
    entry.id === targetId ? { ...entry, hint: stepped.state } : entry,
  )
  return Option.some([
    nextEntries,
    waitCommandsFor(targetId, stepped.state, stepped.commands),
  ])
}

const elapseEntry = (
  entries: ReadonlyArray<Entry>,
  targetId: string,
  version: number,
  props: Props,
): Option.Option<ReadonlyArray<Entry>> => {
  const maybeTarget = Array.findFirst(entries, entry => entry.id === targetId)
  if (
    Option.isNone(maybeTarget) ||
    Presence.isLeaving(maybeTarget.value.presence)
  ) {
    return Option.none()
  }
  const stepped = TimedHint.chart.step(
    maybeTarget.value.hint,
    TimedHint.ElapsedHint({ version }),
  )
  if (stepped._tag !== 'Transitioned') {
    return Option.none()
  }
  return Option.some(
    Array.flatMap(entries, entry => {
      if (entry.id !== targetId) {
        return [entry]
      }
      const [nextPresence] = Presence.chart.transition(
        entry.presence,
        Presence.Hide(),
        { isAnimated: isAnimatedOf(props) },
      )
      return Presence.isMounted(nextPresence)
        ? [{ ...entry, presence: nextPresence, hint: stepped.state }]
        : []
    }),
  )
}

const stepEntryPresence = (
  entries: ReadonlyArray<Entry>,
  targetId: string,
  presenceMessage:
    | typeof Presence.AdvanceFrame.Type
    | typeof Presence.EndAnimation.Type,
  props: Props,
): Option.Option<ReadonlyArray<Entry>> => {
  const maybeTarget = Array.findFirst(entries, entry => entry.id === targetId)
  if (Option.isNone(maybeTarget)) {
    return Option.none()
  }
  const stepped = Presence.chart.step(
    maybeTarget.value.presence,
    presenceMessage,
    { isAnimated: isAnimatedOf(props) },
  )
  if (stepped._tag !== 'Transitioned') {
    return Option.none()
  }
  return Option.some(
    Array.flatMap(entries, entry => {
      if (entry.id !== targetId) {
        return [entry]
      }
      return Presence.isMounted(stepped.state)
        ? [{ ...entry, presence: stepped.state }]
        : []
    }),
  )
}

// CHART

/**
 * The Toast Machine chart: stacks entries with monotonic IDs, composes
 * `TimedHint` for versioned auto-dismiss / pause-on-hover / sticky entries,
 * composes `Presence` for optional animated enter/leave lifecycles, enforces
 * optional `maxVisible`, and transitions cleanly between `Empty` and
 * `Showing`.
 */
export const chart = define({ state: State, message: Message, context: Props })(
  {
    initial,
    states: {
      Empty: {
        on: {
          ShowToast: to('Showing', ({ state, message, context }) => {
            const id = entryId(context.id, state.nextEntryKey)
            const [entry, commands] = buildEntry(id, message, context)
            return {
              model: Showing({
                entries: [entry],
                nextEntryKey: state.nextEntryKey + 1,
              }),
              commands,
            }
          }),
          DismissToast: [ignore()],
          DismissAllToasts: [ignore()],
          HoverToast: [ignore()],
          LeaveToast: [ignore()],
          AdvanceToastFrame: [ignore()],
          EndToastAnimation: [ignore()],
          ElapsedToast: [ignore()],
        },
      },
      Showing: {
        on: {
          ShowToast: to('Showing', ({ state, message, context }) => {
            const id = entryId(context.id, state.nextEntryKey)
            const [entry, commands] = buildEntry(id, message, context)
            const nextEntries = enforceMaxVisible(
              Array.append(state.entries, entry),
              context,
            )
            return {
              model: Showing({
                entries: nextEntries,
                nextEntryKey: state.nextEntryKey + 1,
              }),
              commands,
            }
          }),
          DismissToast: [
            when(
              (state, message, context) =>
                Option.filter(
                  dismissOne(state.entries, message.entryId, context),
                  Array.isReadonlyArrayEmpty,
                ),
              'Empty',
              ({ state }) => Empty({ nextEntryKey: state.nextEntryKey }),
            ),
            when(
              (state, message, context) =>
                Option.filter(
                  dismissOne(state.entries, message.entryId, context),
                  Array.isReadonlyArrayNonEmpty,
                ),
              'Showing',
              ({ state, guardValue }) =>
                Showing({
                  entries: guardValue,
                  nextEntryKey: state.nextEntryKey,
                }),
            ),
            ignore(),
          ],
          DismissAllToasts: [
            when(
              (state, _message, context) =>
                Option.filter(
                  dismissAllEntries(state.entries, context),
                  Array.isReadonlyArrayEmpty,
                ),
              'Empty',
              ({ state }) => Empty({ nextEntryKey: state.nextEntryKey }),
            ),
            when(
              (state, _message, context) =>
                Option.filter(
                  dismissAllEntries(state.entries, context),
                  Array.isReadonlyArrayNonEmpty,
                ),
              'Showing',
              ({ state, guardValue }) =>
                Showing({
                  entries: guardValue,
                  nextEntryKey: state.nextEntryKey,
                }),
            ),
            ignore(),
          ],
          HoverToast: [
            when(
              (state, message, context) =>
                pauseOnHoverOf(context)
                  ? stepEntryHint(
                      state.entries,
                      message.entryId,
                      TimedHint.PauseHint(),
                    )
                  : Option.none(),
              'Showing',
              ({ state, guardValue }) => ({
                model: Showing({
                  entries: guardValue[0],
                  nextEntryKey: state.nextEntryKey,
                }),
                commands: guardValue[1],
              }),
            ),
            ignore(),
          ],
          LeaveToast: [
            when(
              (state, message, context) =>
                pauseOnHoverOf(context)
                  ? stepEntryHint(
                      state.entries,
                      message.entryId,
                      TimedHint.ResumeHint(),
                    )
                  : Option.none(),
              'Showing',
              ({ state, guardValue }) => ({
                model: Showing({
                  entries: guardValue[0],
                  nextEntryKey: state.nextEntryKey,
                }),
                commands: guardValue[1],
              }),
            ),
            ignore(),
          ],
          ElapsedToast: [
            when(
              (state, message, context) =>
                Option.filter(
                  elapseEntry(
                    state.entries,
                    message.entryId,
                    message.version,
                    context,
                  ),
                  Array.isReadonlyArrayEmpty,
                ),
              'Empty',
              ({ state }) => Empty({ nextEntryKey: state.nextEntryKey }),
            ),
            when(
              (state, message, context) =>
                Option.filter(
                  elapseEntry(
                    state.entries,
                    message.entryId,
                    message.version,
                    context,
                  ),
                  Array.isReadonlyArrayNonEmpty,
                ),
              'Showing',
              ({ state, guardValue }) =>
                Showing({
                  entries: guardValue,
                  nextEntryKey: state.nextEntryKey,
                }),
            ),
            ignore(),
          ],
          AdvanceToastFrame: [
            when(
              (state, message, context) =>
                stepEntryPresence(
                  state.entries,
                  message.entryId,
                  Presence.AdvanceFrame(),
                  context,
                ),
              'Showing',
              ({ state, guardValue }) =>
                Showing({
                  entries: guardValue,
                  nextEntryKey: state.nextEntryKey,
                }),
            ),
            ignore(),
          ],
          EndToastAnimation: [
            when(
              (state, message, context) =>
                Option.filter(
                  stepEntryPresence(
                    state.entries,
                    message.entryId,
                    Presence.EndAnimation(),
                    context,
                  ),
                  Array.isReadonlyArrayEmpty,
                ),
              'Empty',
              ({ state }) => Empty({ nextEntryKey: state.nextEntryKey }),
            ),
            when(
              (state, message, context) =>
                Option.filter(
                  stepEntryPresence(
                    state.entries,
                    message.entryId,
                    Presence.EndAnimation(),
                    context,
                  ),
                  Array.isReadonlyArrayNonEmpty,
                ),
              'Showing',
              ({ state, guardValue }) =>
                Showing({
                  entries: guardValue,
                  nextEntryKey: state.nextEntryKey,
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
  ShowToast: pace,
  DismissToast: pace,
  DismissAllToasts: pace,
  HoverToast: pace,
  LeaveToast: pace,
  AdvanceToastFrame: pace,
  EndToastAnimation: pace,
  ElapsedToast: pace,
})

/** Default synchronization: every Toast Message syncs. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a Toast stack kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/**
 * The five painted slots of a Toast Part: `Region`, `Entry`, `Title`,
 * `Description`, and `DismissButton`.
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Region: {
    role: 'Region',
    focus: 'None',
    gestures: [],
  },
  Entry: {
    focus: 'None',
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
  DismissButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'DismissToast' }],
  },
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  maybeChoice: Option.Option<string>,
): SlotProps => {
  if (slot === 'Region') {
    return {
      id: regionId(props.id),
      label: labelOf(props),
      live: 'Polite',
      tabIndex: -1,
    }
  } else if (slot === 'Entry') {
    return Option.match(
      Option.flatMap(maybeChoice, id => entryById(state, id)),
      {
        onNone: () => ({ isHidden: true }),
        onSome: entry => ({
          id: entry.id,
          role: variantRoleOf(entry.variant),
          live: variantLiveOf(entry.variant),
          isAtomic: true,
          labelledBy: titleId(entry.id),
          ...(Option.isSome(entry.maybeDescription)
            ? { describedBy: descriptionId(entry.id) }
            : {}),
          ...(Presence.isMounted(entry.presence) ? {} : { isHidden: true }),
        }),
      },
    )
  } else if (slot === 'Title') {
    return Option.match(
      Option.flatMap(maybeChoice, id => entryById(state, id)),
      {
        onNone: () => ({}),
        onSome: entry => ({ id: titleId(entry.id) }),
      },
    )
  } else if (slot === 'Description') {
    return Option.match(
      Option.flatMap(maybeChoice, id => entryById(state, id)),
      {
        onNone: () => ({}),
        onSome: entry => ({ id: descriptionId(entry.id) }),
      },
    )
  } else if (slot === 'DismissButton') {
    return Option.match(
      Option.flatMap(maybeChoice, id => entryById(state, id)),
      {
        onNone: () => ({}),
        onSome: entry => ({
          id: dismissButtonId(entry.id),
          label: dismissLabelOf(props),
          ...(Presence.isLeaving(entry.presence) ? { isDisabled: true } : {}),
        }),
      },
    )
  } else {
    return {}
  }
}

/** What a restart opens a Toast stack on: clears transient toasts while keeping monotonic `nextEntryKey`. */
export const atRest = (state: State): State =>
  Empty({ nextEntryKey: state.nextEntryKey })

// PART FACTORY

/** Options for customizing a Toast Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'`) to keep this Toast stack device-only. */
  sync?: 'Synced' | DeviceReason
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Toast {@link Part.Part}. Synced by default
 * (`category: 'Navigation'`, `Pace.Synced`); pass `sync: 'OwnView'` (or use
 * {@link deviceOnly}) to keep a Program's Toast stack local to one device.
 *
 * @example
 * ```typescript
 * const AppToast = Toast.make({ name: 'AppToast' })
 * const LocalToast = Toast.make({ name: 'LocalToast', sync: 'OwnView' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> =>
  Part.define<State, Message, Props>({
    name: options.name ?? 'Toast',
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

/** Default synced Toast {@link Part.Part} (`category: 'Navigation'`). */
export const part: Part.Part<State, Message, Props> = make()

/** Creates a device-only Toast {@link Part.Part} (`Device({ because })`, defaulting to `'OwnView'`). */
export const deviceOnly = (
  options: Omit<MakeOptions, 'sync'> &
    Readonly<{ because?: DeviceReason }> = {},
): Part.Part<State, Message, Props> =>
  make({
    ...options,
    sync: options.because ?? 'OwnView',
  })
