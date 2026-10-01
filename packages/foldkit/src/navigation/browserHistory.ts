import { Array, Match as M, Option, Schema as S } from 'effect'

import {
  type CarrierDriver,
  type CarrierEntry,
  type CarrierMove,
  type CarrierPlan,
  type CarrierSnapshot,
  type Expectation,
} from './carrier.js'
import { History } from './message.js'

// WINDOW

/** The parts of `window` the browser history driver reads and writes. */
export type BrowserWindow = Readonly<{
  location: Readonly<{ pathname: string; search: string }>
  history: Readonly<{
    state: unknown
    pushState: (state: unknown, unused: string, url: string) => void
    replaceState: (state: unknown, unused: string, url: string) => void
    go: (delta: number) => void
  }>
  addEventListener: (type: 'popstate', listener: () => void) => void
  removeEventListener: (type: 'popstate', listener: () => void) => void
}>

/**
 * The URI a window shows: its path and its search.
 *
 * @example
 * ```typescript
 * windowUri(window) // '/counter/menu?q=re'
 * ```
 */
export const windowUri = (window: BrowserWindow): string =>
  `${window.location.pathname}${window.location.search}`

// ENTRY STATE

const EntryState = S.Struct({
  foldkitNavigation: S.Struct({
    keys: S.Array(S.String),
    position: S.Number,
  }),
})

const decodeEntryState = S.decodeUnknownOption(EntryState)

const entryState = (
  keys: ReadonlyArray<string>,
  position: number,
): typeof EntryState.Type => ({
  foldkitNavigation: { keys, position },
})

// DRIVER

const keysUpTo = <Destination>(
  plan: CarrierPlan<Destination>,
  count: number,
): ReadonlyArray<string> =>
  Array.map(Array.take(plan.entries, count), entry => entry.key)

const isSingleSwap = (
  popCount: number,
  entries: ReadonlyArray<unknown>,
): boolean => popCount === 1 && entries.length === 1

/**
 * A carrier driver for browser history. Each history entry records the
 * plan keys it shows and its position, so Back and Forward are classified
 * by identity and a Program pop walks back through real entries instead
 * of leaving a duplicate behind.
 *
 * - A push writes one history entry per new stack entry.
 * - A pop goes back when the entries beneath are ours, else it replaces.
 * - A cold deep link is seeded: the root replaces the landing entry and
 *   the rest are pushed, so Back from `/counter/session` reaches `/counter`.
 * - While following someone (`history: 'Replace'`), every move replaces.
 *
 * @example
 * ```typescript
 * runCarrier(bound, browserHistoryDriver(window), {
 *   launchUri: Option.some(windowUri(window)),
 * })
 * ```
 */
export const browserHistoryDriver = <Destination>(
  window: BrowserWindow,
): CarrierDriver<Destination> => {
  const read = (): CarrierSnapshot => {
    const uri = windowUri(window)
    return Option.match(decodeEntryState(window.history.state), {
      onNone: () => ({ keys: [], uri, maybePosition: Option.none() }),
      onSome: ({ foldkitNavigation: { keys, position } }) => ({
        keys,
        uri,
        maybePosition: Option.some(position),
      }),
    })
  }

  const pushEntry = (
    uri: string,
    keys: ReadonlyArray<string>,
    position: number,
  ): void => {
    window.history.pushState(entryState(keys, position), '', uri)
  }

  const replaceEntry = (
    uri: string,
    keys: ReadonlyArray<string>,
    position: number,
  ): void => {
    window.history.replaceState(entryState(keys, position), '', uri)
  }

  const perform = (
    move: CarrierMove<Destination>,
    plan: CarrierPlan<Destination>,
    snapshot: CarrierSnapshot,
  ): Option.Option<Expectation> => {
    const position = Option.getOrElse(snapshot.maybePosition, () => 0)

    const replaceWithPlan = (): Option.Option<Expectation> => {
      replaceEntry(plan.uri, keysUpTo(plan, plan.entries.length), position)
      return Option.none()
    }

    const pushFrom = (
      depth: number,
      entries: ReadonlyArray<CarrierEntry<Destination>>,
      startPosition: number,
    ): Option.Option<Expectation> => {
      Array.forEach(entries, (entry, offset) => {
        pushEntry(
          entry.uri,
          keysUpTo(plan, depth + offset + 1),
          startPosition + offset + 1,
        )
      })
      return Option.none()
    }

    const goBackOrReplace = (count: number): Option.Option<Expectation> => {
      const canGoBack = Option.exists(
        snapshot.maybePosition,
        current => current >= count,
      )
      if (canGoBack) {
        window.history.go(-count)
        return Option.some({
          label: `go(-${count})`,
          isMetBy: landed =>
            Option.contains(landed.maybePosition, position - count),
        })
      } else {
        return replaceWithPlan()
      }
    }

    const seedOrReplace = (): Option.Option<Expectation> => {
      const isFreshEntry = Array.isReadonlyArrayEmpty(snapshot.keys)
      const rootEntry = Array.headNonEmpty(plan.entries)
      const aboveRoot = Array.tailNonEmpty(plan.entries)
      if (isFreshEntry && Array.isReadonlyArrayNonEmpty(aboveRoot)) {
        replaceEntry(rootEntry.uri, [rootEntry.key], position)
        return pushFrom(1, aboveRoot, position)
      } else {
        return replaceWithPlan()
      }
    }

    if (plan.history === 'Replace') {
      return move._tag === 'Unchanged' ? Option.none() : replaceWithPlan()
    }
    return M.value(move).pipe(
      M.withReturnType<Option.Option<Expectation>>(),
      M.tagsExhaustive({
        Unchanged: () => Option.none(),
        Reconfigure: replaceWithPlan,
        Push: ({ entries }) =>
          pushFrom(plan.entries.length - entries.length, entries, position),
        Pop: ({ count }) => goBackOrReplace(count),
        Replace: ({ popCount, entries }) =>
          isSingleSwap(popCount, entries)
            ? replaceWithPlan()
            : goBackOrReplace(popCount),
        Reset: seedOrReplace,
      }),
    )
  }

  return {
    name: 'browser-history',
    read,
    perform,
    subscribe: listener => {
      const onPopState = (): void => {
        listener({ snapshot: read(), via: History() })
      }
      window.addEventListener('popstate', onPopState)
      return () => {
        window.removeEventListener('popstate', onPopState)
      }
    },
  }
}
