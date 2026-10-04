import { Effect, Layer } from 'effect'

import { LinkSharing, LinkSharingError, type SharedHow } from './share.js'

// SHARE

const isCancelled = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError'

/**
 * The browser's link sharing: the platform share sheet where there is one,
 * such as on a phone, else the clipboard. A person closing the share sheet
 * is not a failure.
 */
export const browserLinkSharing = Layer.succeed(LinkSharing, {
  share: link => {
    const url = new URL(link.path, window.location.origin).toString()
    return typeof navigator.share === 'function'
      ? Effect.tryPromise({
          try: (): Promise<SharedHow> =>
            navigator.share({ title: link.title, url }).then(() => 'Shared'),
          catch: error => error,
        }).pipe(
          Effect.catch(error =>
            isCancelled(error)
              ? Effect.succeed<SharedHow>('Cancelled')
              : Effect.fail(
                  new LinkSharingError({
                    reason: 'the link could not be shared',
                  }),
                ),
          ),
        )
      : Effect.tryPromise({
          try: (): Promise<SharedHow> =>
            navigator.clipboard.writeText(url).then(() => 'Copied'),
          catch: () =>
            new LinkSharingError({ reason: 'the link could not be copied' }),
        })
  },
})
