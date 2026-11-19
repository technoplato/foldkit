import { Context, Data, type Effect } from 'effect'

/** The system share sheet closed without sharing, or the browser has none. */
export class LinkShareError extends Data.TaggedError('LinkShareError')<{
  readonly cause: unknown
}> {}

/** A link and the title the system share sheet shows with it. */
export type SharedLink = Readonly<{ url: string; title: string }>

/**
 * Hands a link to the system share sheet (Messages, Mail, AirDrop), like
 * Share Link in the iPhone's recording list. Browsers without one fail.
 */
export type LinkSharerService = Readonly<{
  shareLink: (link: SharedLink) => Effect.Effect<void, LinkShareError>
}>

/** Hands a link to the system share sheet, provided by the host. */
export class LinkSharer extends Context.Service<
  LinkSharer,
  LinkSharerService
>()('words-core-example/LinkSharer') {}
