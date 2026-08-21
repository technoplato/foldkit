import { Match as M, Schema as S } from 'effect'

/** A note only the owner can view, even when a share link exists. */
export const PrivateAudience = S.TaggedStruct('PrivateAudience', {})

/** A note only the owner can view, even when a share link exists. */
export type PrivateAudience = typeof PrivateAudience.Type

/** A note anyone with the id or a share secret can view. */
export const UnlistedAudience = S.TaggedStruct('UnlistedAudience', {})

/** A note anyone with the id or a share secret can view. */
export type UnlistedAudience = typeof UnlistedAudience.Type

/** A listed note anyone can view. */
export const PublicAudience = S.TaggedStruct('PublicAudience', {})

/** A listed note anyone can view. */
export type PublicAudience = typeof PublicAudience.Type

/** Every Instant note visibility. */
export const Audience = S.Union([
  PrivateAudience,
  UnlistedAudience,
  PublicAudience,
])

/** Every Instant note visibility. */
export type Audience = typeof Audience.Type

/** Instant `notes.audience` string stored on the row. */
export const AudienceLiteral = S.Literals(['private', 'unlisted', 'public'])

/** Instant `notes.audience` string stored on the row. */
export type AudienceLiteral = typeof AudienceLiteral.Type

/** Maps an Audience ADT onto the Instant `audience` string. */
export const audienceLiteral = (audience: Audience): AudienceLiteral =>
  M.value(audience).pipe(
    M.withReturnType<AudienceLiteral>(),
    M.tagsExhaustive({
      PrivateAudience: () => 'private',
      PublicAudience: () => 'public',
      UnlistedAudience: () => 'unlisted',
    }),
  )

/** Maps an Instant `audience` string onto the Audience ADT. */
export const audienceFromLiteral = (value: AudienceLiteral): Audience => {
  if (value === 'public') {
    return PublicAudience.make({})
  }
  if (value === 'unlisted') {
    return UnlistedAudience.make({})
  } else {
    return PrivateAudience.make({})
  }
}
