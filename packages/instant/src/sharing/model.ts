import { Match as M, Option, Schema as S } from 'effect'

import { Audience, PrivateAudience } from './audience.js'
import { ShareId, ShareLink } from './link.js'

/**
 * Instant sharing state for one note. Private notes may hold links; those
 * secrets still only open for the owner.
 */
export const Share = S.Struct({
  subjectId: ShareId,
  audience: Audience,
  links: S.Array(ShareLink),
})

/**
 * Instant sharing state for one note. Private notes may hold links; those
 * secrets still only open for the owner.
 */
export type Share = typeof Share.Type

/** Instant `notes` fields a share query returns. */
export const SharedNoteRecord = S.Struct({
  id: ShareId,
  body: S.String,
  audience: S.Literals(['private', 'unlisted', 'public']),
})

/** Instant `notes` fields a share query returns. */
export type SharedNoteRecord = typeof SharedNoteRecord.Type

/** An empty private share for a new note. */
export const privateShare = (subjectId: ShareId): Share =>
  Share.make({
    audience: PrivateAudience.make({}),
    links: [],
    subjectId,
  })

/** True when `secret` matches one of the share's Instant `noteLinks` rows. */
export const shareHasSecret = (share: Share, secret: string): boolean =>
  share.links.some(link => link.secret === secret)

/**
 * Instant view access for one share. Owner always sees the note. Private
 * denies everyone else, even with a secret or known id. Unlisted allows a
 * matching secret or a known id. Public is listed.
 */
export const canViewShare = (params: {
  readonly ownerId: string
  readonly secret: Option.Option<string>
  readonly share: Share
  readonly viewerId: Option.Option<string>
}): boolean => {
  if (
    Option.isSome(params.viewerId) &&
    params.viewerId.value === params.ownerId
  ) {
    return true
  }
  return M.value(params.share.audience).pipe(
    M.withReturnType<boolean>(),
    M.tagsExhaustive({
      PrivateAudience: () => false,
      PublicAudience: () => true,
      UnlistedAudience: () =>
        Option.isSome(params.secret)
          ? shareHasSecret(params.share, params.secret.value)
          : true,
    }),
  )
}
