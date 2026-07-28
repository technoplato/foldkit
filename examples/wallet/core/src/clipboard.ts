import { Context, Data, Effect, Layer, Schema as S } from 'effect'

/** One renderer-neutral request to copy public text to the host clipboard. */
export const ClipboardCopyRequest = S.Struct({
  copyId: S.String,
  value: S.String,
  description: S.String,
})
/** One renderer-neutral request to copy public text to the host clipboard. */
export type ClipboardCopyRequest = typeof ClipboardCopyRequest.Type

/** Clipboard copying has not been requested. */
export const IdleClipboardCopy = S.TaggedStruct('IdleClipboardCopy', {})
/** One public value is being copied by the host. */
export const CopyingToClipboard = S.TaggedStruct('CopyingToClipboard', {
  request: ClipboardCopyRequest,
})
/** The host copied one public value. */
export const CopiedToClipboard = S.TaggedStruct('CopiedToClipboard', {
  request: ClipboardCopyRequest,
})
/** The host could not copy one public value. */
export const FailedClipboardCopy = S.TaggedStruct('FailedClipboardCopy', {
  request: ClipboardCopyRequest,
  code: S.Literals(['Unavailable', 'Denied', 'Failed']),
})
/** Renderer-neutral state of the latest clipboard copy. */
export const ClipboardCopyState = S.Union([
  IdleClipboardCopy,
  CopyingToClipboard,
  CopiedToClipboard,
  FailedClipboardCopy,
])
/** Renderer-neutral state of the latest clipboard copy. */
export type ClipboardCopyState = typeof ClipboardCopyState.Type

/** Creates a stable clipboard request for one public wallet address. */
export const clipboardCopyRequestForAddress = (
  address: string,
  copyId: string = address,
): ClipboardCopyRequest =>
  ClipboardCopyRequest.make({
    copyId: `wallet-address:${copyId}`,
    value: address,
    description: 'wallet address',
  })

/** Reports whether two clipboard requests identify the same public value. */
export const isSameClipboardCopyRequest = (
  left: ClipboardCopyRequest,
  right: ClipboardCopyRequest,
): boolean =>
  left.copyId === right.copyId &&
  left.value === right.value &&
  left.description === right.description

/** A sanitized clipboard failure containing no host cause. */
export class WalletClipboardError extends Data.TaggedError(
  'WalletClipboardError',
)<{
  readonly code: 'Unavailable' | 'Denied' | 'Failed'
}> {}

/** Clipboard writing implemented by one renderer host. */
export type WalletClipboardService = Readonly<{
  writeText: (value: string) => Effect.Effect<void, WalletClipboardError>
}>

/** An injected clipboard writer with no renderer or platform assumptions. */
export class WalletClipboard extends Context.Service<
  WalletClipboard,
  WalletClipboardService
>()('Wallet/WalletClipboard') {}

/** A clipboard Layer for hosts that do not expose clipboard writing. */
export const WalletClipboardUnavailable = Layer.succeed(
  WalletClipboard,
  WalletClipboard.of({
    writeText: () =>
      Effect.fail(new WalletClipboardError({ code: 'Unavailable' })),
  }),
)
