import { Array, Match as M, Option, Schema as S } from 'effect'
import {
  type Model,
  WalletProgram,
  primaryWalletSuggestedTestTransferLabel,
  primaryWalletTestFundingMethod,
  selectedNetworkHasCapability,
  selectedSendNetworkLabel,
  toggledWalletNetworkMode,
} from 'wallet-core-example'

/** Shows the current Wallet Model without sending a Message. */
export const ShowWallet = S.TaggedStruct('ShowWallet', {
  label: S.String,
})
/** Creates one complete multi-chain Wallet profile. */
export const CreateWallet = S.TaggedStruct('CreateWallet', {
  label: S.String,
})
/** Selects the next global Wallet network mode. */
export const ToggleWalletNetwork = S.TaggedStruct('ToggleWalletNetwork', {
  label: S.String,
})

/** Selects the next sendable chain in the current global network mode. */
export const SelectNextSendNetwork = S.TaggedStruct('SelectNextSendNetwork', {
  label: S.String,
})
/** Fills the amount field with the selected adapter's small test transfer. */
export const UseSuggestedTestTransferAmount = S.TaggedStruct(
  'UseSuggestedTestTransferAmount',
  { label: S.String },
)
/** Shows the default public receiving instruction. */
export const ShowReceivingInstruction = S.TaggedStruct(
  'ShowReceivingInstruction',
  { label: S.String },
)
/** Reloads the first page of transaction history. */
export const ReloadWalletHistory = S.TaggedStruct('ReloadWalletHistory', {
  label: S.String,
})
/** Loads the next available page of transaction history. */
export const NextWalletHistoryPage = S.TaggedStruct('NextWalletHistoryPage', {
  label: S.String,
})
/** Requests test funds for the selected rail and valid amount. */
export const RequestWalletTestFunding = S.TaggedStruct(
  'RequestWalletTestFunding',
  { label: S.String },
)
/** Composes a transaction preview for the selected network. */
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
  CreateWallet,
  ToggleWalletNetwork,
  SelectNextSendNetwork,
  UseSuggestedTestTransferAmount,
  ShowReceivingInstruction,
  ReloadWalletHistory,
  NextWalletHistoryPage,
  RequestWalletTestFunding,
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
  const history = selectedNetworkHasCapability(model, 'TransactionHistory')
    ? [ReloadWalletHistory.make({ label: 'Reload transaction history' })]
    : []
  const nextHistoryPage =
    model.transactionHistory._tag === 'LoadedTransactionHistory' &&
    Option.isSome(model.transactionHistory.maybeNextCursor)
      ? [NextWalletHistoryPage.make({ label: 'Load next history page' })]
      : []
  const adapterTestFunding =
    selectedNetworkHasCapability(model, 'TestFunding') &&
    model.transferAmount._tag === 'ValidTransferAmount'
      ? [RequestWalletTestFunding.make({ label: 'Request test funds' })]
      : []
  const externalTestFunding = Option.match(
    primaryWalletTestFundingMethod(model),
    {
      onNone: () => [],
      onSome: method =>
        method._tag === 'ExternalTestFundingMethod'
          ? [
              RequestWalletTestFunding.make({
                label: `Open ${method.providerName}`,
              }),
            ]
          : [],
    },
  )
  const suggestedTestTransfer = Option.match(
    primaryWalletSuggestedTestTransferLabel(model),
    {
      onNone: () => [],
      onSome: label => [
        UseSuggestedTestTransferAmount.make({
          label: `Use small test amount: ${label}`,
        }),
      ],
    },
  )
  return [
    ShowWallet.make({ label: 'Show public Wallet Model' }),
    CreateWallet.make({
      label: 'Create Bitcoin, Ethereum, Solana, and Sui wallet',
    }),
    ToggleWalletNetwork.make({
      label: `Switch every wallet to ${toggledWalletNetworkMode(model.walletNetworkMode)}`,
    }),
    SelectNextSendNetwork.make({ label: 'Select next send network' }),
    ...suggestedTestTransfer,
    ShowReceivingInstruction.make({ label: 'Show receiving instruction' }),
    ...history,
    ...nextHistoryPage,
    ...adapterTestFunding,
    ...externalTestFunding,
    PreviewWalletTransaction.make({ label: 'Preview transfer' }),
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
      WaitingForWalletProfiles: () => 'Portfolio waiting for wallet profiles',
      LoadingPortfolio: () => 'Portfolio loading',
      FailedPortfolio: ({ failure }) =>
        `Portfolio failed: ${failure.operation}/${failure.code}`,
      LoadedPortfolio: ({ snapshot }) =>
        `${snapshot.accounts.length.toString()} accounts | ${snapshot.balanceSnapshot.balances.length.toString()} balances | ${snapshot.balanceSnapshot.unavailableAccountIds.length.toString()} unavailable`,
    }),
  )
  return Array.join(
    [
      portfolio,
      `${model.wallets.length.toString()} wallets ${model.walletNetworkMode}`,
      `Send ${Option.match(model.maybeSendNetworkSelection, {
        onNone: () => 'unavailable',
        onSome: () => selectedSendNetworkLabel(model),
      })}`,
      `Transaction ${model.transaction._tag}`,
      `Signature ${model.signature._tag}`,
      `History ${model.transactionHistory._tag}`,
      `Observation ${model.transactionObservation._tag}`,
      `Funding ${model.testFunding._tag}`,
      `Transactions ${model.transactions.length.toString()}`,
    ],
    ' | ',
  )
}
