import { Context, Data, Effect, Layer, Ref, Schema as S } from 'effect'

// SHARE

/** How a link went out: through the platform's share sheet, or copied. */
export const SharedHow = S.Literals(['Shared', 'Copied', 'Cancelled'])
/** How a link went out. */
export type SharedHow = typeof SharedHow.Type

/** A link that went into a clipboard. */
export const copied: SharedHow = 'Copied'

/** A link to share: the path in Books and the words to send with it. */
export type ShareableLink = Readonly<{ path: string; title: string }>

/** The link could not be shared or copied, and why, safe to show. */
export class LinkSharingError extends Data.TaggedError('LinkSharingError')<{
  readonly reason: string
}> {}

/**
 * Where a link to a moment goes out: a phone's share sheet, a computer's
 * clipboard, or a terminal's. The host knows its own address, so it turns
 * the path into the full link.
 */
export class LinkSharing extends Context.Service<
  LinkSharing,
  Readonly<{
    share: (link: ShareableLink) => Effect.Effect<SharedHow, LinkSharingError>
  }>
>()('books/LinkSharing') {}

/**
 * A link sharing that keeps every link in memory, for tests: it says
 * every link was copied.
 *
 * @example
 * ```typescript
 * const sharing = yield* makeTestLinkSharing()
 * ```
 */
export const makeTestLinkSharing = () =>
  Effect.map(Ref.make<ReadonlyArray<ShareableLink>>([]), shared => ({
    shared: Ref.get(shared),
    layer: Layer.succeed(LinkSharing, {
      share: link =>
        Effect.as(
          Ref.update(shared, links => [...links, link]),
          copied,
        ),
    }),
  }))
