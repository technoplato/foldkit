import { Schema as S, SchemaTransformation, String, pipe } from 'effect'

// IDS

const Uuid = S.String.check(S.isUUID())

/**
 * A reminder list's id, the one Instant and Reminders V3 both store:
 * `2b7c1a0e-5d2f-4c1b-9a8e-3f6d7c8b9a01` in
 * `/reminders/lists/2b7c1a0e-5d2f-4c1b-9a8e-3f6d7c8b9a01`. Branded, so a
 * reminder's id can never open a list.
 */
export const ListId = Uuid.pipe(S.brand('ListId'))
/** A reminder list's id. */
export type ListId = typeof ListId.Type

/**
 * A reminder's id, as Instant and Reminders V3 store it, the last segment
 * of `/reminders/lists/2b7c1a0e-…/reminder/7e1f04c2-…`.
 */
export const ReminderId = Uuid.pipe(S.brand('ReminderId'))
/** A reminder's id. */
export type ReminderId = typeof ReminderId.Type

/** A tag's id, as Instant and Reminders V3 store it. */
export const TagId = Uuid.pipe(S.brand('TagId'))
/** A tag's id. */
export type TagId = typeof TagId.Type

/** A signed-in person's id: their Instant `$users` row. */
export const MemberId = Uuid.pipe(S.brand('MemberId'))
/** A signed-in person's id. */
export type MemberId = typeof MemberId.Type

/** A list share's id, a Reminders V3 `v3_shares` row. */
export const ShareId = Uuid.pipe(S.brand('ShareId'))
/** A list share's id. */
export type ShareId = typeof ShareId.Type

/** One person's place in a share, a Reminders V3 `v3_share_memberships` row. */
export const MembershipId = Uuid.pipe(S.brand('MembershipId'))
/** One person's place in a share. */
export type MembershipId = typeof MembershipId.Type

// TEXT

const maxTitleLength = 500

const maxNotesLength = 10_000

const maxTagLength = 64

const maxQueryLength = 200

const maxEmailLength = 320

/**
 * A reminder's title as a person types it: trimmed, never empty. Decoding
 * `'  Buy milk '` gives `'Buy milk'`, so a press of `AddReminder:  Buy milk `
 * adds `Buy milk`.
 */
export const ReminderTitle = S.Trim.check(
  S.isLengthBetween(1, maxTitleLength),
).pipe(S.brand('ReminderTitle'))
/** A reminder's title as a person types it. */
export type ReminderTitle = typeof ReminderTitle.Type

/** A list's title as a person types it: trimmed, never empty, `Groceries`. */
export const ListTitle = S.Trim.check(
  S.isLengthBetween(1, maxTitleLength),
).pipe(S.brand('ListTitle'))
/** A list's title as a person types it. */
export type ListTitle = typeof ListTitle.Type

/** A reminder's notes as a person types them: trimmed, never empty. */
export const NotesText = S.Trim.check(
  S.isLengthBetween(1, maxNotesLength),
).pipe(S.brand('NotesText'))
/** A reminder's notes as a person types them. */
export type NotesText = typeof NotesText.Type

/** What a person searches for: `milk`, or `#errands` for a tag. */
export const SearchQuery = S.Trim.check(
  S.isLengthBetween(1, maxQueryLength),
).pipe(S.brand('SearchQuery'))
/** What a person searches for. */
export type SearchQuery = typeof SearchQuery.Type

/**
 * The address a person shares a list with, as they type it, trimmed and
 * lowercase: `ada@example.com`.
 */
export const EmailAddress = S.String.pipe(
  S.decodeTo(
    S.String.check(
      S.isLengthBetween(3, maxEmailLength),
      S.isPattern(/^[^\s@]+@[^\s@]+$/),
    ),
    SchemaTransformation.transform({
      decode: (typed: string) => typed.trim().toLowerCase(),
      encode: (email: string) => email,
    }),
  ),
  S.brand('EmailAddress'),
)
/** The address a person shares a list with. */
export type EmailAddress = typeof EmailAddress.Type

/**
 * A tag's words, the way Reminders V3 keeps them: trimmed, lowercase, and
 * without the `#`. `errands` is the tag a person types as `#Errands`.
 */
export const TagTitle = S.String.check(
  S.isLengthBetween(1, maxTagLength),
  S.isTrimmed(),
  S.isLowercased(),
  S.isPattern(/^[^#]/),
).pipe(S.brand('TagTitle'))
/** A tag's words. */
export type TagTitle = typeof TagTitle.Type

const leadingHashes = /^#+/

/**
 * Reads typed words as a tag the way Reminders V3 does: `' #Errands '`
 * becomes `errands`.
 *
 * @example
 * ```typescript
 * normalizedTag('#Errands') // 'errands'
 * ```
 */
export const normalizedTag = (typed: string): string =>
  pipe(
    typed,
    String.trim,
    String.replace(leadingHashes, ''),
    String.trim,
    String.toLowerCase,
  )

/**
 * A tag as a person types it, or as another app stored it: decoding
 * `'#Errands'` gives the tag `errands`, and the tag prints as itself, the
 * word in `/reminders/tags/errands` and `reminders open-tag errands`.
 */
export const TagTitleFromText = S.String.pipe(
  S.decodeTo(
    TagTitle,
    SchemaTransformation.transform({
      decode: normalizedTag,
      encode: (title: string) => title,
    }),
  ),
)
