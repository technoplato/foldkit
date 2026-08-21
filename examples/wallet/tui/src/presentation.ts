import { Array, Match as M, Option, Schema as S } from 'effect'
import {
  type Model,
  type SendNetworkSelection,
  type WalletNetworkMode,
  WalletProgram,
  assetAmountLabelForModel,
  primaryReceivingInstruction,
  primaryWalletSuggestedTestTransferLabel,
  primaryWalletTestFundingMethod,
  selectedNetworkHasCapability,
  selectedSendNetworkLabel,
  toggledWalletNetworkMode,
  walletDataSourceLabel,
  walletFailureLines,
} from 'wallet-core-example'
import {
  type ReceivingQrProjectionInput,
  projectReceivingQr,
  receivingQrTextLines,
  receivingQrUnavailableLabel,
} from 'wallet-qr-example'

/** The close instruction reserved in every OpenTUI receiving panel. */
export const openTuiReceivingPanelFooter =
  'Press Enter, Escape, or q to close this presenter-local panel.'
const openTuiPanelHorizontalOverhead = 4
const openTuiPanelVerticalOverhead = 6

/** The current OpenTUI viewport used to prove a full QR remains visible. */
export const ReceivingQrViewport = S.Struct({
  columns: S.Int,
  rows: S.Int,
})
/** The current OpenTUI viewport used to prove a full QR remains visible. */
export type ReceivingQrViewport = typeof ReceivingQrViewport.Type

const openTuiReceivingPanelRequirements = (lines: ReadonlyArray<string>) => ({
  columns:
    Array.reduce(
      Array.append(lines, openTuiReceivingPanelFooter),
      0,
      (maximumWidth, line) => Math.max(maximumWidth, line.length),
    ) + openTuiPanelHorizontalOverhead,
  rows: Array.length(lines) + openTuiPanelVerticalOverhead,
})

/** Reports whether a full OpenTUI receiving panel fits without clipping. */
export const doesReceivingQrPanelFitOpenTui = (
  lines: ReadonlyArray<string>,
  viewport: ReceivingQrViewport,
): boolean => {
  const requirements = openTuiReceivingPanelRequirements(lines)
  return (
    viewport.columns >= requirements.columns &&
    viewport.rows >= requirements.rows
  )
}

/** Network modes in the exact order exposed by the OpenTUI selector. */
export const walletNetworkModes: ReadonlyArray<WalletNetworkMode> = [
  'Devnet',
  'Testnet',
  'Live',
]

/** Resolves one OpenTUI network-mode selector index without a sentinel. */
export const walletNetworkModeAtIndex = (
  index: number,
): Option.Option<WalletNetworkMode> => Array.get(walletNetworkModes, index)

/** Resolves one OpenTUI Wallet-and-cryptocurrency selector index. */
export const walletSendNetworkSelectionAtIndex = (
  selections: ReadonlyArray<SendNetworkSelection>,
  index: number,
): Option.Option<SendNetworkSelection> => Array.get(selections, index)

/** Projects the two selectors that bind OpenTUI to the canonical Wallet Model. */
export const walletOpenTuiSelectorLines = (
  model: Model,
): ReadonlyArray<string> => [
  `Network mode: ${model.walletNetworkMode} (Devnet | Testnet | Live)`,
  `Wallet and cryptocurrency: ${Option.isSome(model.maybeSendNetworkSelection) ? selectedSendNetworkLabel(model) : 'unavailable'}`,
]

const selectedFundingMethodLabel = (model: Model): string => {
  const maybeMethod = primaryWalletTestFundingMethod(model)
  if (Option.isNone(maybeMethod)) {
    return 'No funding method for the selected rail'
  }
  return M.value(maybeMethod.value).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      UnavailableTestFundingMethod: () => 'Unavailable on this production rail',
      AdapterTestFundingMethod: () => 'Adapter request available',
      ExternalTestFundingMethod: method =>
        `External ${method.providerName}: ${method.providerUrl}`,
    }),
  )
}

/** Projects test-funding state for a separate OpenTUI panel. */
export const walletOpenTuiFundingPanelLines = (
  model: Model,
): ReadonlyArray<string> => {
  const status = M.value(model.testFunding).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      ReadyToRequestTestFunding: () => 'Ready to request',
      RequestingTestFunding: ({ request }) =>
        `Requesting ${request.atomicUnits} atomic units`,
      ReceivedTestFunding: ({ receipt }) =>
        `Received ${assetAmountLabelForModel(model, receipt.amount)}`,
      UnavailableTestFunding: ({ failure }) =>
        `Unavailable: ${failure.operation}/${failure.code}`,
      FailedTestFunding: ({ failure }) =>
        `Failed: ${failure.operation}/${failure.code}`,
    }),
  )
  return [`Status: ${status}`, `Method: ${selectedFundingMethodLabel(model)}`]
}

/** Projects paginated transaction-history state for a separate OpenTUI panel. */
export const walletOpenTuiHistoryPanelLines = (
  model: Model,
): ReadonlyArray<string> => {
  const status = M.value(model.transactionHistory).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      NotLoadedTransactionHistory: () => 'Not loaded',
      LoadingTransactionHistory: ({ query }) =>
        `Loading ${query.networkId} after ${Option.getOrElse(query.maybeCursor, () => 'start')}`,
      LoadedTransactionHistory: ({ maybeNextCursor }) =>
        Option.isSome(maybeNextCursor)
          ? `Loaded; next cursor ${maybeNextCursor.value}`
          : 'Loaded; final page',
      FailedTransactionHistory: ({ failure }) =>
        `Failed: ${failure.operation}/${failure.code}`,
    }),
  )
  return [
    `Status: ${status}`,
    `Visible normalized records: ${model.transactions.length.toString()}`,
  ]
}

/** Projects live transaction-observation state for a separate OpenTUI panel. */
export const walletOpenTuiObservationPanelLines = (
  model: Model,
): ReadonlyArray<string> => {
  const status = M.value(model.transactionObservation).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      WaitingForAccounts: () => 'Waiting for public accounts',
      ObservingTransactions: ({ accountIds }) => {
        const accountCount = accountIds.length
        return `Live for ${accountCount.toString()} ${accountCount === 1 ? 'account' : 'accounts'}`
      },
      FailedTransactionObservation: ({ failure }) =>
        `Failed: ${failure.operation}/${failure.code}`,
    }),
  )
  const maybeLatest = Array.head(model.transactions)
  return [
    `Status: ${status}`,
    Option.isSome(maybeLatest)
      ? `Latest: ${maybeLatest.value.status} ${maybeLatest.value.transactionId}`
      : 'Latest: no observed transactions',
  ]
}

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

/** Projects the selected receiving instruction for one presenter-local panel. */
export const receivingQrPanelLines = (
  model: Model,
  hostOrigin: ReceivingQrProjectionInput['hostOrigin'],
  runtimeMode: ReceivingQrProjectionInput['runtimeMode'],
  viewport: ReceivingQrViewport,
): ReadonlyArray<string> => {
  const maybeInstruction = primaryReceivingInstruction(model)
  if (Option.isNone(maybeInstruction)) {
    return ['No receiving instruction is available for the selected network.']
  }
  const instruction = maybeInstruction.value
  if (model.portfolio._tag !== 'LoadedPortfolio') {
    return [
      `Receive ${instruction.assetId}: ${instruction.destinationAddress}`,
      'Not a scannable QR. The Wallet portfolio is not loaded.',
      `Payload: ${instruction.portableUri}`,
    ]
  }
  const portfolio = model.portfolio.snapshot
  const maybeAccount = Array.findFirst(
    portfolio.accounts,
    account => account.accountId === instruction.accountId,
  )
  if (Option.isNone(maybeAccount)) {
    return [
      `Receive ${instruction.assetId}: ${instruction.destinationAddress}`,
      'Not a scannable QR. The receiving account is inconsistent.',
      `Payload: ${instruction.portableUri}`,
    ]
  }
  const projection = projectReceivingQr({
    account: maybeAccount.value,
    hostOrigin,
    instruction,
    portfolio,
    runtimeMode,
  })
  if (projection._tag === 'AvailableReceivingQr') {
    const availableLines = [
      `Receive ${instruction.assetId}: ${instruction.destinationAddress}`,
      `QR payload: ${projection.payload}`,
      ...receivingQrTextLines(projection),
    ]
    if (doesReceivingQrPanelFitOpenTui(availableLines, viewport)) {
      return availableLines
    }
    const requirements = openTuiReceivingPanelRequirements(availableLines)
    return [
      `Receive ${instruction.assetId}: ${instruction.destinationAddress}`,
      `Not a scannable QR. Resize OpenTUI to at least ${requirements.columns.toString()} columns by ${requirements.rows.toString()} rows.`,
      `Payload: ${projection.payload}`,
    ]
  }
  return [
    `Receive ${instruction.assetId}: ${instruction.destinationAddress}`,
    receivingQrUnavailableLabel(projection.reason),
    `Payload: ${instruction.portableUri}`,
  ]
}

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
        `${walletDataSourceLabel(snapshot.dataSource)} data | ${snapshot.accounts.length.toString()} accounts | ${snapshot.balanceSnapshot.balances.length.toString()} balances | ${snapshot.balanceSnapshot.unavailableAccountIds.length.toString()} unavailable`,
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
      ...(model.transaction._tag === 'FailedTransferValidation' ||
      model.transaction._tag === 'FailedTransactionPreview' ||
      model.transaction._tag === 'FailedTransactionSubmission'
        ? [Array.join(walletFailureLines(model.transaction.failure), ' | ')]
        : []),
      `Signature ${model.signature._tag}`,
      `History ${model.transactionHistory._tag}`,
      `Observation ${model.transactionObservation._tag}`,
      `Funding ${model.testFunding._tag}`,
      `Transactions ${model.transactions.length.toString()}`,
    ],
    ' | ',
  )
}
