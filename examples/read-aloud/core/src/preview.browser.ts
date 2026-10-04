import { Effect, Layer } from 'effect'

import type { Isbn13 } from './ids.js'
import {
  PreviewSource,
  PreviewSourceError,
  dynamicLinksUrl,
  previewOfDynamicLinks,
} from './preview.js'

// PREVIEW

const answerTimeoutMs = 10_000

const callbackIdLength = 12

const unreachable = 'Google Books could not be reached'

const answerOf = (isbn13: Isbn13): Effect.Effect<unknown, PreviewSourceError> =>
  Effect.callback<unknown, PreviewSourceError>(resume => {
    const callback = `readAloudPreview${globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, callbackIdLength)}`
    const script = document.createElement('script')
    const release = (): void => {
      Reflect.deleteProperty(globalThis, callback)
      script.remove()
    }
    Reflect.set(globalThis, callback, (answer: unknown) => {
      release()
      resume(Effect.succeed(answer))
    })
    script.addEventListener('error', () => {
      release()
      resume(Effect.fail(new PreviewSourceError({ reason: unreachable })))
    })
    script.src = dynamicLinksUrl(isbn13, callback)
    document.head.append(script)
    return Effect.sync(release)
  })

/**
 * A preview source that asks Google Books' Dynamic Links through a script
 * tag, the way Google offers it to pages: the answer calls back with the
 * preview the publisher allows. It gives up after 10 seconds.
 *
 * @example
 * ```typescript
 * Layer.mergeAll(endpointReadingSource(), scriptPreviewSource)
 * ```
 */
export const scriptPreviewSource: Layer.Layer<PreviewSource> = Layer.succeed(
  PreviewSource,
  {
    previewOf: isbn13 =>
      answerOf(isbn13).pipe(
        Effect.timeoutOrElse({
          duration: answerTimeoutMs,
          orElse: () =>
            Effect.fail(
              new PreviewSourceError({
                reason: 'Google Books did not answer in time',
              }),
            ),
        }),
        Effect.map(answer => previewOfDynamicLinks(answer, isbn13)),
      ),
  },
)
