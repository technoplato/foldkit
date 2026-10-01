import { Schema as S } from 'effect'

import { m, ts } from '../schema/index.js'

// MESSAGE

/**
 * How a URI reached the Program. Analytics, except `Following`, which says
 * the move came from the person this Processor follows.
 */
export const UriVia = S.Union([
  ts('Launch'),
  ts('Link'),
  ts('DeepLink'),
  ts('History'),
  ts('Cli'),
  ts('Agent'),
  ts('Following', { processorId: S.String }),
])
/** How a URI reached the Program. */
export type UriVia = typeof UriVia.Type

/** A URI reached the Program at launch. */
export const Launch = (): UriVia => ({ _tag: 'Launch' })
/** A person followed a link inside the app. */
export const Link = (): UriVia => ({ _tag: 'Link' })
/** The operating system opened a deep link while the app ran. */
export const DeepLink = (): UriVia => ({ _tag: 'DeepLink' })
/** A person moved through the carrier's history, such as browser Forward. */
export const History = (): UriVia => ({ _tag: 'History' })
/** A person ran `open` in the CLI. */
export const Cli = (): UriVia => ({ _tag: 'Cli' })
/** An agent opened the URI, for example through the DevTools MCP server. */
export const Agent = (): UriVia => ({ _tag: 'Agent' })
/** The person this Processor follows moved, and this Processor followed. */
export const Following = (processorId: string): UriVia => ({
  _tag: 'Following',
  processorId,
})

/**
 * Someone opened a URI: launch, link, deep link, history jump, CLI `open`,
 * or following someone.
 *
 * @example
 * ```typescript
 * OpenedUri({ uri: '/counter/session', via: Link() })
 * ```
 */
export const OpenedUri = m('OpenedUri', { uri: S.String, via: UriVia })

/**
 * A person went back to the entry printed as `uri`: browser Back, a swipe,
 * a hardware back button, a modal dismissal, Escape, or CLI `back`. The URI
 * names the entry they returned to, so a remote push landing mid-swipe
 * never pops the wrong entry.
 *
 * @example
 * ```typescript
 * NavigatedBack({ uri: '/counter' })
 * ```
 */
export const NavigatedBack = m('NavigatedBack', { uri: S.String })

/** Every carrier navigation Message. All of them are Navigation. */
export const Message = S.Union([OpenedUri, NavigatedBack])
/** A carrier navigation Message. */
export type Message = typeof Message.Type

/** True for the carrier navigation Messages. */
export const isMessage = S.is(Message)
