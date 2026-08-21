import { Match as M, Schema as S } from 'effect'

/** Instant `$users` / entity id. */
export const ShareId = S.String.check(S.isUUID())

/** Instant `$users` / entity id. */
export type ShareId = typeof ShareId.Type

/** A share link that can only read. */
export const Reader = S.TaggedStruct('Reader', {})

/** A share link that can only read. */
export type Reader = typeof Reader.Type

/** A share link that can write. */
export const Writer = S.TaggedStruct('Writer', {})

/** A share link that can write. */
export type Writer = typeof Writer.Type

/** Every Instant share-link role. */
export const ShareRole = S.Union([Reader, Writer])

/** Every Instant share-link role. */
export type ShareRole = typeof ShareRole.Type

/** Instant `noteLinks.role` string stored on the row. */
export const ShareRoleLiteral = S.Literals(['reader', 'writer'])

/** Instant `noteLinks.role` string stored on the row. */
export type ShareRoleLiteral = typeof ShareRoleLiteral.Type

/** Maps a ShareRole ADT onto the Instant `role` string. */
export const shareRoleLiteral = (role: ShareRole): ShareRoleLiteral =>
  M.value(role).pipe(
    M.withReturnType<ShareRoleLiteral>(),
    M.tagsExhaustive({
      Reader: () => 'reader',
      Writer: () => 'writer',
    }),
  )

/** Maps an Instant `role` string onto the ShareRole ADT. */
export const shareRoleFromLiteral = (value: ShareRoleLiteral): ShareRole =>
  value === 'writer' ? Writer.make({}) : Reader.make({})

/**
 * One Instant `noteLinks` row. Private notes may hold links; those secrets
 * still only open for the owner.
 */
export const ShareLink = S.Struct({
  id: ShareId,
  secret: S.String.check(S.isNonEmpty()),
  role: ShareRole,
})

/**
 * One Instant `noteLinks` row. Private notes may hold links; those secrets
 * still only open for the owner.
 */
export type ShareLink = typeof ShareLink.Type

const bytesToUrlSafe = (bytes: Uint8Array): string => {
  const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('')
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

/**
 * Builds a share secret. Prefers `crypto.randomUUID()`. Falls back to 22+
 * url-safe characters when UUID is unavailable.
 */
export const createShareSecret = (): string => {
  const cryptoRef = globalThis.crypto
  if (cryptoRef !== undefined && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID()
  }
  if (
    cryptoRef !== undefined &&
    typeof cryptoRef.getRandomValues === 'function'
  ) {
    return bytesToUrlSafe(cryptoRef.getRandomValues(new Uint8Array(16)))
  } else {
    return bytesToUrlSafe(
      Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256)),
    )
  }
}
