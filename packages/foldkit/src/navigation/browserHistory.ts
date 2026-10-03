import { Array, Match as M, Option, Schema as S } from 'effect'

import { ts } from '../schema/index.js'
import {
  type CarrierDriver,
  type CarrierEntry,
  type CarrierMove,
  type CarrierPlan,
  type CarrierSnapshot,
  type Expectation,
} from './carrier.js'
import { History, Link, type UriVia } from './message.js'

// WINDOW

/**
 * The event a host dispatches on `window` after it writes a browser entry
 * itself, such as a link to an app page outside the Program. The driver
 * reports the new entry as a link.
 */
export const locationChangedEvent = 'foldkit:locationchange'

type WindowEvent = 'popstate' | typeof locationChangedEvent

/** The parts of `window` the browser history driver reads and writes. */
export type BrowserWindow = Readonly<{
  location: Readonly<{ pathname: string; search: string }>
  history: Readonly<{
    state: unknown
    pushState: (state: unknown, unused: string, url: string) => void
    replaceState: (state: unknown, unused: string, url: string) => void
    go: (delta: number) => void
  }>
  addEventListener: (type: WindowEvent, listener: () => void) => void
  removeEventListener: (type: WindowEvent, listener: () => void) => void
  dispatchEvent: (event: Event) => boolean
}>

/**
 * Writes a browser entry for a URI the host shows itself and tells the
 * driver, so a link to an app page like `/about` moves the address bar
 * without reloading the Program.
 *
 * @example
 * ```typescript
 * followHostLink(window, '/about', 'Push') // the carrier parks
 * followHostLink(window, '/counter', 'Push') // the carrier reports OpenedUri
 * ```
 */
export const followHostLink = (
  window: BrowserWindow,
  uri: string,
  mode: 'Push' | 'Replace',
): void => {
  if (mode === 'Push') {
    window.history.pushState(null, '', uri)
  } else {
    window.history.replaceState(null, '', uri)
  }
  window.dispatchEvent(new Event(locationChangedEvent))
}

/**
 * The URI a window shows: its path and its search.
 *
 * @example
 * ```typescript
 * windowUri(window) // '/counter/menu?menu.q=re'
 * ```
 */
export const windowUri = (window: BrowserWindow): string =>
  `${window.location.pathname}${window.location.search}`

// STATE

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

// LINKS

/**
 * Whether a web app shows pages of its own beside the Program's, such as
 * an `/about` page in React Router. With host pages, a link to one of
 * them stays in the app; without them, it loads another document.
 */
export const HostPages = S.Literals(['WithHostPages', 'ProgramOnly'])
/** Whether a web app shows pages of its own beside the Program's. */
export type HostPages = typeof HostPages.Type

/** The link opens in the Program, which decides where to go. */
export const OpenInProgram = ts('OpenInProgram')
/** The link shows one of the host app's own pages without a reload. */
export const ShowHostPage = ts('ShowHostPage')
/** The link loads another document, as a plain link does. */
export const LoadDocument = ts('LoadDocument')

/** Where a followed link goes. */
export const LinkTarget = S.Union([OpenInProgram, ShowHostPage, LoadDocument])
/** Where a followed link goes. */
export type LinkTarget = typeof LinkTarget.Type

const isAppPath = (href: string): boolean =>
  href.startsWith('/') && !href.startsWith('//')

/**
 * Where a link goes, decided once for every adapter: a screen's text
 * link, a React Router `<Link>`, a native link, or a Svelte anchor. A
 * Program URI opens in the Program, unless the app is showing one of its
 * own pages, when the link writes the address bar so the Program's carrier
 * takes it back. Another app path shows a host page when there are host
 * pages. Anything else loads a document.
 *
 * @example
 * ```typescript
 * linkTargetOf('/counter/session', { ownsUri, maybeCurrentUri: Option.some('/counter'), hostPages: 'ProgramOnly' })
 * // OpenInProgram()
 * linkTargetOf('/about', { ownsUri, maybeCurrentUri: Option.some('/counter'), hostPages: 'WithHostPages' })
 * // ShowHostPage()
 * linkTargetOf('https://effect.website', { ownsUri, maybeCurrentUri: Option.none(), hostPages: 'WithHostPages' })
 * // LoadDocument()
 * ```
 */
export const linkTargetOf = (
  href: string,
  context: Readonly<{
    ownsUri: (uri: string) => boolean
    maybeCurrentUri: Option.Option<string>
    hostPages: HostPages
  }>,
): LinkTarget => {
  const hasHostPages = context.hostPages === 'WithHostPages'
  const isOnHostPage = Option.exists(
    context.maybeCurrentUri,
    uri => !context.ownsUri(uri),
  )
  if (context.ownsUri(href) && !(hasHostPages && isOnHostPage)) {
    return OpenInProgram()
  } else if (hasHostPages && isAppPath(href)) {
    return ShowHostPage()
  } else {
    return LoadDocument()
  }
}

const primaryButton = 0

/**
 * True for a click a link should take over: the primary button with no
 * modifier held. A Cmd-click or a middle click keeps the browser's own
 * behavior, such as opening a new tab.
 *
 * @example
 * ```typescript
 * isPlainClick({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }) // true
 * isPlainClick({ button: 0, metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }) // false
 * ```
 */
export const isPlainClick = (
  click: Readonly<{
    button: number
    metaKey: boolean
    ctrlKey: boolean
    shiftKey: boolean
    altKey: boolean
  }>,
): boolean =>
  click.button === primaryButton &&
  !click.metaKey &&
  !click.ctrlKey &&
  !click.shiftKey &&
  !click.altKey

/**
 * Follows a link in a browser by {@link linkTargetOf}: opens it in the
 * Program, writes the address bar for a host page, or leaves it to the
 * browser. True when it handled the link, so an anchor click must not
 * navigate; false when the browser should load it.
 *
 * @example
 * ```typescript
 * if (followLink(window, bound, href, 'ProgramOnly', 'Push')) {
 *   event.preventDefault()
 * }
 * ```
 */
export const followLink = (
  window: BrowserWindow,
  source: Readonly<{
    ownsUri: (uri: string) => boolean
    openUri: (uri: string, via: UriVia) => boolean
  }>,
  href: string,
  hostPages: HostPages,
  mode: 'Push' | 'Replace',
): boolean =>
  M.value(
    linkTargetOf(href, {
      ownsUri: source.ownsUri,
      maybeCurrentUri: Option.some(windowUri(window)),
      hostPages,
    }),
  ).pipe(
    M.withReturnType<boolean>(),
    M.tagsExhaustive({
      OpenInProgram: () => source.openUri(href, Link()),
      ShowHostPage: () => {
        followHostLink(window, href, mode)
        return true
      },
      LoadDocument: () => false,
    }),
  )

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
      const onHostLink = (): void => {
        listener({ snapshot: read(), via: Link() })
      }
      window.addEventListener('popstate', onPopState)
      window.addEventListener(locationChangedEvent, onHostLink)
      return () => {
        window.removeEventListener('popstate', onPopState)
        window.removeEventListener(locationChangedEvent, onHostLink)
      }
    },
  }
}
