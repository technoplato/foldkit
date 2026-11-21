import {
  Array,
  Match as M,
  Option,
  Schema as S,
  String as Str,
  pipe,
} from 'effect'

import * as Command from '../command/index.js'
import { define, ignore, to, when } from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import type { Block } from './block.js'
import { Device, type Sync } from './pace.js'
import { wrapIndex } from './rovingFocus.js'

// NOTE: this is the one place that decides typeahead search over a list of
// items (menus, listboxes, selects, comboboxes, trees). Match resolution is
// pure, and the accumulated query with its debounced reset is a Machine
// whose wait is a Command (`Command.answerAfter`), so no painter keeps a
// timer or a search buffer.

// CONSTANTS

/** How long after the last typed character before the search query resets. */
export const resetMs = 350

// PURE MATCHING

/**
 * Whether a keyboard event key is a single printable character (not a named
 * key such as `'Enter'` or `'ArrowDown'`).
 *
 * @example
 * ```typescript
 * isPrintableKey('a') // true
 * isPrintableKey(' ') // true
 * isPrintableKey('ArrowDown') // false
 * ```
 */
export const isPrintableKey = (key: string): boolean => key.length === 1

/**
 * Whether a keyboard event key continues or starts a typeahead search.
 * Space starts nothing on a fresh search (so Space can still select the
 * active item), but continues an active search so multi-word labels such as
 * `'Danger Zone'` can be typed.
 *
 * @example
 * ```typescript
 * isSearchKey('d', false) // true
 * isSearchKey(' ', false) // false
 * isSearchKey(' ', true) // true
 * isSearchKey('Enter', true) // false
 * ```
 */
export const isSearchKey = (key: string, isSearching: boolean): boolean =>
  isPrintableKey(key) && (key !== ' ' || isSearching)

/**
 * Finds the first enabled item whose search text starts with `query`
 * (case-insensitive), searching forward from `maybeActiveIndex` and
 * wrapping around.
 *
 * - On a fresh search (`isRefinement: false`), starts *after* the active
 *   item so repeatedly typing `'d'` cycles through `'Duplicate'` and
 *   `'Delete'`.
 * - On a refinement (`isRefinement: true`), includes the active item so
 *   typing `'de'` stays on `'Delete'`.
 * - Skips disabled items and supports spaces in `query`.
 *
 * @example
 * ```typescript
 * match({
 *   items: ['Edit', 'Duplicate', 'Delete'],
 *   query: 'd',
 *   maybeActiveIndex: Option.some(1),
 *   textOf: item => item,
 *   isRefinement: false,
 * }) // Some(2)
 * ```
 */
export const match = <Item>(
  input: Readonly<{
    items: ReadonlyArray<Item>
    query: string
    maybeActiveIndex: Option.Option<number>
    isDisabled?: (index: number) => boolean
    textOf: (item: Item, index: number) => string
    isRefinement: boolean
  }>,
): Option.Option<number> => {
  const { items, query, maybeActiveIndex, textOf, isRefinement } = input
  const isDisabled = input.isDisabled ?? (() => false)
  if (Array.isReadonlyArrayEmpty(items) || Str.isEmpty(query)) {
    return Option.none()
  }

  const lowerQuery = Str.toLowerCase(query)
  const offset = isRefinement ? 0 : 1
  const startIndex = Option.match(maybeActiveIndex, {
    onNone: () => 0,
    onSome: index => index + offset,
  })

  const isEnabledMatch = (index: number): boolean =>
    !isDisabled(index) &&
    pipe(
      items,
      Array.get(index),
      Option.exists(item =>
        pipe(textOf(item, index), Str.toLowerCase, Str.startsWith(lowerQuery)),
      ),
    )

  return pipe(
    items,
    Array.length,
    Array.makeBy(step => wrapIndex(startIndex + step, items.length)),
    Array.findFirst(isEnabledMatch),
  )
}

// STATE

/** No typeahead query is active. `version` rises monotonically so stale waits are ignored. */
export const Idle = ts('Idle', { version: S.Number })

/** A typeahead query is accumulating characters. */
export const Searching = ts('Searching', {
  query: S.String,
  version: S.Number,
})

/**
 * Where a typeahead search stands. JSON-serializable, with no sentinel
 * values.
 *
 * @example
 * ```typescript
 * const state: Typeahead.State = Typeahead.initial
 * ```
 */
export const State = S.Union([Idle, Searching])
/** Where a typeahead search stands. */
export type State = typeof State.Type

/** The initial typeahead state before any character is typed. */
export const initial: State = Idle({ version: 0 })

// MESSAGE

/** A printable character was typed into the typeahead buffer. */
export const Typed = m('Typed', {
  key: S.String,
  afterMs: S.optionalKey(S.Number),
})

/** The typeahead buffer was cleared immediately (for example on menu close). */
export const Cleared = m('Cleared')

/** The debounce wait for `version` elapsed. */
export const ElapsedReset = m('ElapsedReset', { version: S.Number })

/** Everything the typeahead block is told. */
export const Message = S.Union([Typed, Cleared, ElapsedReset])
/** Everything the typeahead block is told. */
export type Message = typeof Message.Type

/** True for a Message of the typeahead block. */
export const isMessage = S.is(Message)

// COMMAND

/** Waits out the typeahead debounce window and answers `ElapsedReset` for `version`. */
export const WaitToClearSearch = Command.define(
  'WaitToClearSearch',
  { version: S.Number, afterMs: S.Number },
  ElapsedReset,
)(({ version, afterMs }) =>
  Command.answerAfter(afterMs, ElapsedReset({ version })),
)

// CHART

/**
 * The typeahead chart: typing enters or refines `Searching` and asks for
 * `WaitToClearSearch`; an `ElapsedReset` with a matching `version` returns
 * to `Idle`, while any stale `version` is explicitly ignored.
 *
 * @example
 * ```typescript
 * const [next, commands] = Typeahead.chart.transition(Typeahead.initial, Typeahead.Typed({ key: 'd' }))
 * // next: Searching({ query: 'd', version: 1 })
 * // commands: [WaitToClearSearch({ version: 1, afterMs: 350 })]
 * ```
 */
export const chart = define({ state: State, message: Message })({
  initial,
  states: {
    Idle: {
      on: {
        Typed: to('Searching', ({ state, message }) => {
          const version = state.version + 1
          return {
            model: Searching({ query: message.key, version }),
            commands: [
              WaitToClearSearch({
                version,
                afterMs: message.afterMs ?? resetMs,
              }),
            ],
          }
        }),
      },
    },
    Searching: {
      on: {
        Typed: to('Searching', ({ state, message }) => {
          const version = state.version + 1
          return {
            model: Searching({ query: state.query + message.key, version }),
            commands: [
              WaitToClearSearch({
                version,
                afterMs: message.afterMs ?? resetMs,
              }),
            ],
          }
        }),
        Cleared: to('Idle', ({ state }) => Idle({ version: state.version })),
        ElapsedReset: [
          when(
            (state, message) => state.version === message.version,
            'Idle',
            ({ state }) => Idle({ version: state.version }),
          ),
          ignore(),
        ],
      },
    },
  },
})

// READINGS

/** The current accumulated search query, or `''` while idle. */
export const queryOf = (state: State): string =>
  M.value(state).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Idle: () => '',
      Searching: ({ query }) => query,
    }),
  )

/** True while a typeahead query is non-empty. */
export const isSearching = (state: State): boolean => state._tag === 'Searching'

/** The current search version counter. */
export const versionOf = (state: State): number => state.version

/**
 * Builds a `Typeahead.State` from a raw `(query, version)` pair, useful for
 * thin painters whose existing Model keeps those two fields flat.
 *
 * @example
 * ```typescript
 * fromFields('', 0) // Idle({ version: 0 })
 * fromFields('de', 2) // Searching({ query: 'de', version: 2 })
 * ```
 */
export const fromFields = (query: string, version: number): State =>
  Str.isEmpty(query) ? Idle({ version }) : Searching({ query, version })

// BLOCK

const inProgress: Sync = Device({ because: 'InputInProgress' })

/** How each typeahead Message syncs when used as a standalone block: device-only input in progress. */
export const sync: Readonly<Record<Message['_tag'], Sync>> = {
  Typed: inProgress,
  Cleared: inProgress,
  ElapsedReset: inProgress,
}

/** What a restart opens typeahead on: idle, preserving the monotonic version counter. */
export const atRest = (state: State): State => Idle({ version: state.version })

/**
 * Typeahead as a reusable {@link Block}: state, Messages, chart, sync, and
 * resting state.
 */
export const block: Block<State, Message> = {
  name: 'Typeahead',
  State,
  Message,
  chart,
  sync,
  atRest,
}
