import { Effect, Layer } from 'effect'
import { WalletClipboard, WalletClipboardError } from 'wallet-core-example'

import * as BrowserClipboard from '@effect/platform-browser/Clipboard'

const isNamedError = (cause: unknown, name: string): boolean =>
  typeof cause === 'object' &&
  cause !== null &&
  'name' in cause &&
  cause.name === name

const isClipboardUnavailable = (): boolean =>
  globalThis.isSecureContext === false ||
  typeof navigator === 'undefined' ||
  navigator.clipboard === undefined

const toWalletClipboardError = (
  error: BrowserClipboard.ClipboardError,
): WalletClipboardError => {
  if (isNamedError(error.cause, 'NotAllowedError')) {
    return new WalletClipboardError({ code: 'Denied' })
  } else if (isClipboardUnavailable()) {
    return new WalletClipboardError({ code: 'Unavailable' })
  } else {
    return new WalletClipboardError({ code: 'Failed' })
  }
}

const WalletWebClipboardService = Layer.effect(
  WalletClipboard,
  BrowserClipboard.Clipboard.pipe(
    Effect.map(clipboard =>
      WalletClipboard.of({
        writeText: value =>
          clipboard
            .writeString(value)
            .pipe(Effect.mapError(toWalletClipboardError)),
      }),
    ),
  ),
)

/** Browser clipboard writing adapted to the renderer-neutral Wallet service. */
export const WalletWebClipboard = WalletWebClipboardService.pipe(
  Layer.provide(BrowserClipboard.layer),
)
