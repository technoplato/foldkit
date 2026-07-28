import { Array, Match as M, Schema as S } from 'effect'
import { type Model, WalletProgram } from 'wallet-core-example'

/** Shows the current Wallet Model without sending a Message. */
export const ShowWallet = S.TaggedStruct('ShowWallet', {
  label: S.String,
})
/** Shows the default public receiving instruction. */
export const ShowReceivingInstruction = S.TaggedStruct(
  'ShowReceivingInstruction',
  { label: S.String },
)
/** Composes the deterministic simulated transaction preview. */
export const PreviewWalletTransaction = S.TaggedStruct(
  'PreviewWalletTransaction',
  { label: S.String },
)
/** Submits the currently previewed transaction. */
export const SendWalletTransaction = S.TaggedStruct('SendWalletTransaction', {
  label: S.String,
})
/** Signs the deterministic domain-separated challenge. */
export const SignWalletChallenge = S.TaggedStruct('SignWalletChallenge', {
  label: S.String,
})
/** Prints the canonical state path in the OpenTUI notice area. */
export const ShowWalletStatePath = S.TaggedStruct('ShowWalletStatePath', {
  label: S.String,
})
/** Prints the canonical replay path in the OpenTUI notice area. */
export const ShowWalletReplayPath = S.TaggedStruct('ShowWalletReplayPath', {
  label: S.String,
})

/** One OpenTUI interaction derived from the current canonical Wallet Model. */
export const WalletOpenTuiInteraction = S.Union([
  ShowWallet,
  ShowReceivingInstruction,
  PreviewWalletTransaction,
  SendWalletTransaction,
  SignWalletChallenge,
  ShowWalletStatePath,
  ShowWalletReplayPath,
])
/** One OpenTUI interaction derived from the current canonical Wallet Model. */
export type WalletOpenTuiInteraction = typeof WalletOpenTuiInteraction.Type

/** The exact Program object consumed by the OpenTUI host. */
export const walletOpenTuiProgram: typeof WalletProgram = WalletProgram

/** Derives the currently valid OpenTUI operations without adding domain state. */
export const interactionsForWalletOpenTui = (
  model: Model,
): ReadonlyArray<WalletOpenTuiInteraction> => {
  const send =
    model.transaction._tag === 'PreviewedTransaction'
      ? [SendWalletTransaction.make({ label: 'Send previewed transaction' })]
      : []
  return [
    ShowWallet.make({ label: 'Show public Wallet Model' }),
    ShowReceivingInstruction.make({ label: 'Show receiving instruction' }),
    PreviewWalletTransaction.make({ label: 'Preview simulated transfer' }),
    ...send,
    SignWalletChallenge.make({ label: 'Sign access challenge' }),
    ShowWalletStatePath.make({ label: 'Show portable state path' }),
    ShowWalletReplayPath.make({ label: 'Show portable replay path' }),
  ]
}

/** Formats the public Wallet Model for tests and OpenTUI rendering. */
export const walletOpenTuiSummary = (model: Model): string => {
  const portfolio = M.value(model.portfolio).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      LoadingPortfolio: () => 'Portfolio loading',
      FailedPortfolio: ({ failure }) =>
        `Portfolio failed: ${failure.operation}/${failure.code}`,
      LoadedPortfolio: ({ snapshot }) =>
        `${snapshot.accounts.length.toString()} accounts | ${snapshot.balanceSnapshot.balances.length.toString()} balances`,
    }),
  )
  return Array.join(
    [
      portfolio,
      `Transaction ${model.transaction._tag}`,
      `Signature ${model.signature._tag}`,
      `Observed ${model.observedTransactions.length.toString()}`,
    ],
    ' | ',
  )
}
