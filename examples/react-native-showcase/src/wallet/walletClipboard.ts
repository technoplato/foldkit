import { Effect, Layer } from 'effect'
import * as Clipboard from 'expo-clipboard'
import { WalletClipboard, WalletClipboardError } from 'wallet-core-example'

const isNamedError = (cause: unknown, name: string): boolean =>
  typeof cause === 'object' &&
  cause !== null &&
  'name' in cause &&
  cause.name === name

const toWalletClipboardError = (cause: unknown): WalletClipboardError =>
  isNamedError(cause, 'NotAllowedError')
    ? new WalletClipboardError({ code: 'Denied' })
    : new WalletClipboardError({ code: 'Failed' })

/** Expo clipboard writing adapted to the renderer-neutral Wallet service. */
export const ExpoWalletClipboard = Layer.succeed(
  WalletClipboard,
  WalletClipboard.of({
    writeText: value =>
      Effect.tryPromise({
        try: () => Clipboard.setStringAsync(value),
        catch: toWalletClipboardError,
      }).pipe(
        Effect.flatMap(isCopied =>
          isCopied
            ? Effect.succeed(undefined)
            : Effect.fail(new WalletClipboardError({ code: 'Failed' })),
        ),
      ),
  }),
)
