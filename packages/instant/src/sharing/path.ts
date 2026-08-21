import { Option, Schema as S } from 'effect'

import { audienceLiteral } from './audience.js'
import { ShareId, type ShareLink } from './link.js'
import { type Share } from './model.js'

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const absoluteCarrierPattern = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//u

/** Parsed `/n/:subjectId` share URI, with an optional `s` secret. */
export const SharePath = S.Struct({
  subjectId: ShareId,
  secret: S.Option(S.String),
})

/** Parsed `/n/:subjectId` share URI, with an optional `s` secret. */
export type SharePath = typeof SharePath.Type

const pathAndSearch = (value: string): { path: string; search: string } => {
  const withoutHash = value.split('#')[0] ?? value
  const carrier = absoluteCarrierPattern.test(withoutHash)
    ? withoutHash
    : `https://share.invalid${withoutHash.startsWith('/') ? withoutHash : `/${withoutHash}`}`
  try {
    const url = new URL(carrier)
    return { path: url.pathname, search: url.search }
  } catch {
    const [path = '', search = ''] = withoutHash.split('?')
    return { path, search }
  }
}

const secretFromSearch = (search: string): Option.Option<string> => {
  const params = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search,
  )
  const secret = params.get('s')
  if (secret === null || secret === '') {
    return Option.none()
  } else {
    return Option.some(secret)
  }
}

const firstLink = (share: Share, link?: ShareLink): ShareLink | undefined =>
  link ?? share.links[0]

/**
 * Prints a portable relative share URI.
 * Private and public print `/n/:subjectId`. Unlisted prints
 * `/n/:subjectId?s=:secret` when a link secret is available.
 */
export const printSharePath = (share: Share, link?: ShareLink): string => {
  const base = `/n/${share.subjectId}`
  if (audienceLiteral(share.audience) !== 'unlisted') {
    return base
  }
  const chosen = firstLink(share, link)
  if (chosen === undefined) {
    return base
  } else {
    return `${base}?s=${encodeURIComponent(chosen.secret)}`
  }
}

/**
 * Parses a relative URI or host carrier into a share subject and optional
 * secret. The secret stays in the query (`s`), not a second path segment.
 */
export const parseSharePath = (
  pathAndQuery: string,
): Option.Option<SharePath> => {
  const { path, search } = pathAndSearch(pathAndQuery)
  const segments = path.split('/').filter(segment => segment !== '')
  if (segments.length !== 2 || segments[0] !== 'n') {
    return Option.none()
  }
  const subjectId = segments[1]
  if (subjectId === undefined || !uuidPattern.test(subjectId)) {
    return Option.none()
  }
  const decoded = S.decodeUnknownOption(ShareId)(subjectId)
  if (Option.isNone(decoded)) {
    return Option.none()
  } else {
    return Option.some(
      SharePath.make({
        secret: secretFromSearch(search),
        subjectId: decoded.value,
      }),
    )
  }
}

/**
 * Instant `useQuery` / `queryOnce` `ruleParams` for a note view.
 * `knownDocId` is the Instant "only people who know the id" param.
 * `secret` is the share-link param (`ruleParams.secret in data.ref(...)`).
 */
export const noteViewRuleParams = (params: {
  readonly secret?: Option.Option<string> | string
  readonly subjectId: string
}): Readonly<{ knownDocId: string; secret: string }> => {
  const secret = params.secret
  if (secret === undefined) {
    return { knownDocId: params.subjectId, secret: '' }
  }
  if (typeof secret === 'string') {
    return { knownDocId: params.subjectId, secret }
  }
  return {
    knownDocId: params.subjectId,
    secret: Option.isSome(secret) ? secret.value : '',
  }
}
