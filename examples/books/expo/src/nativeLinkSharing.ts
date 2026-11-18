import {
  LinkSharing,
  LinkSharingError,
  type SharedHow,
} from 'books-core-example/browser'
import { Effect, Layer } from 'effect'
import * as Clipboard from 'expo-clipboard'
import { Share } from 'react-native'

// SHARE

/**
 * A phone's link sharing: the platform's share sheet for a share, and the
 * clipboard for a copy, as `Copy link to this word` promises. The link is
 * the address the web and a terminal open, on `origin`. A person closing
 * the share sheet is not a failure.
 *
 * @example
 * ```typescript
 * Layer.mergeAll(resources, nativeLinkSharing(booksOrigin))
 * ```
 */
export const nativeLinkSharing = (origin: string): Layer.Layer<LinkSharing> => {
  const urlOf = (path: string): string => `${origin}${path}`
  return Layer.succeed(LinkSharing, {
    share: link =>
      Effect.tryPromise({
        try: (): Promise<SharedHow> =>
          Share.share({ title: link.title, url: urlOf(link.path) }).then(
            result =>
              result.action === Share.dismissedAction ? 'Cancelled' : 'Shared',
          ),
        catch: () =>
          new LinkSharingError({ reason: 'the link could not be shared' }),
      }),
    copy: link =>
      Effect.tryPromise({
        try: () => Clipboard.setStringAsync(urlOf(link.path)),
        catch: () =>
          new LinkSharingError({ reason: 'the link could not be copied' }),
      }).pipe(Effect.asVoid),
  })
}
