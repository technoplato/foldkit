import { Array, Match as M, Option } from 'effect'
import { Image } from 'expo-image'
import { useEffect, useMemo, useRef } from 'react'
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  type Model,
  type PortfolioSnapshot,
  type ReceivingInstruction,
  type TransactionPreview,
  type TransactionState,
  type TransactionSubmission,
  type WalletAccount,
  type WalletCreationState,
  type WalletNetworkMode,
  type WalletProfile,
  activeWalletAccounts,
  assetAmountLabelForModel,
  availableSendNetworkSelections,
  clipboardCopyFailureMessage,
  clipboardCopyLabel,
  clipboardCopyRequestForAddress,
  isPrimaryWalletBalanceUnavailable,
  isSameClipboardCopyRequest,
  isTransferPreviewActionEnabled,
  makeWalletTestChallenge,
  networkForId,
  primaryReceivingInstruction,
  primaryWalletAccount,
  primaryWalletAsset,
  primaryWalletBalance,
  primaryWalletNetwork,
  primaryWalletSuggestedTestTransferAmount,
  primaryWalletSuggestedTestTransferLabel,
  primaryWalletTestFundingMethod,
  sendNetworkSelectionIdentity,
  sendNetworkSelectionLabel,
  shortenedAddress,
  transferAmountInput,
  transferPreviewReadinessLabel,
  transferRecipientInput,
  walletAccountBalanceLabel,
  walletDataSourceDetail,
  walletDataSourceLabel,
  walletFailureLines,
} from 'wallet-core-example'
import {
  type ReceivingQrProjectionInput,
  inspectingWalletRuntimeMode,
  liveWalletRuntimeMode,
  projectReceivingQr,
  receivingQrUnavailableLabel,
} from 'wallet-qr-example'
import {
  type WalletInitialRoute,
  makeWalletReactClient,
} from 'wallet-react-bindings-example'
import { walletDataSourceFromEnvironment } from 'wallet-web-client-example'

import { ReplayControls } from '../replayControls'
import { makeWalletResourcesForPlatform } from './walletResources'

const walletResources = makeWalletResourcesForPlatform(
  Platform.OS,
  walletDataSourceFromEnvironment(
    process.env['EXPO_PUBLIC_WALLET_DATA_SOURCE'],
  ),
  process.env['EXPO_PUBLIC_WALLET_ETHEREUM_ANVIL_HTTP_RPC_URL'],
  process.env['EXPO_PUBLIC_WALLET_ETHEREUM_ANVIL_WS_RPC_URL'],
)

const { WalletProvider, useWalletActions, useWalletModel, useWalletReplay } =
  makeWalletReactClient(walletResources)

const maybePreviewForTransaction = (
  transaction: TransactionState,
): Option.Option<TransactionPreview> =>
  M.value(transaction).pipe(
    M.withReturnType<Option.Option<TransactionPreview>>(),
    M.tagsExhaustive({
      IdleTransaction: () => Option.none(),
      ValidatingTransfer: () => Option.none(),
      InvalidTransfer: () => Option.none(),
      PreviewingTransaction: () => Option.none(),
      PreviewedTransaction: ({ preview }) => Option.some(preview),
      SubmittingTransaction: ({ preview }) => Option.some(preview),
      SubmittedTransaction: ({ preview }) => Option.some(preview),
      FailedTransactionPreview: () => Option.none(),
      FailedTransferValidation: () => Option.none(),
      FailedTransactionSubmission: ({ preview }) => Option.some(preview),
    }),
  )

const transactionStatus = (transaction: TransactionState): string =>
  M.value(transaction).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      IdleTransaction: () => 'Ready',
      ValidatingTransfer: () => 'Validating recipient…',
      InvalidTransfer: () => 'Recipient needs attention',
      PreviewingTransaction: () => 'Preparing preview…',
      PreviewedTransaction: () => 'Check before sending',
      SubmittingTransaction: () => 'Sending…',
      SubmittedTransaction: () => 'Sent',
      FailedTransactionPreview: () => 'Preview failed',
      FailedTransferValidation: () => 'Validation failed',
      FailedTransactionSubmission: () => 'Send failed',
    }),
  )

const transferAmountFailure = (model: Model): Option.Option<string> => {
  if (model.transferAmount._tag !== 'InvalidTransferAmount') {
    return Option.none()
  }
  return Option.some(
    M.value(model.transferAmount.code).pipe(
      M.withReturnType<string>(),
      M.when(
        'AssetUnavailable',
        () => 'Select an asset before entering an amount.',
      ),
      M.when(
        'InvalidFormat',
        () =>
          'Enter a positive decimal amount using digits and one decimal point.',
      ),
      M.when(
        'TooManyDecimalPlaces',
        () =>
          'This amount has more decimal places than the selected asset supports.',
      ),
      M.when('MustBePositive', () => 'The amount must be greater than zero.'),
      M.exhaustive,
    ),
  )
}

const selectedNetworkHasCapability = (
  model: Model,
  capability: 'TestFunding' | 'TransactionHistory',
): boolean => {
  if (
    model.portfolio._tag !== 'LoadedPortfolio' ||
    Option.isNone(model.maybeSendNetworkSelection)
  ) {
    return false
  }
  const maybeNetwork = networkForId(
    model.portfolio.snapshot.networks,
    model.maybeSendNetworkSelection.value.networkId,
  )
  return (
    Option.isSome(maybeNetwork) &&
    Array.contains(maybeNetwork.value.capabilities, capability)
  )
}

const walletNetworkModes: ReadonlyArray<WalletNetworkMode> = [
  'Devnet',
  'Testnet',
  'Live',
]

const TransactionSubmissionConfirmation = ({
  submission,
}: Readonly<{ submission: TransactionSubmission }>) => {
  const maybeConfirmation = submission.maybeExplorerConfirmation
  if (Option.isNone(maybeConfirmation)) {
    return (
      <View accessibilityLiveRegion="polite" style={styles.confirmation}>
        <Text style={styles.confirmationTitle}>Transaction submitted</Text>
        <Text selectable style={styles.codeText}>
          {submission.transactionId}
        </Text>
      </View>
    )
  }
  const confirmation = maybeConfirmation.value
  return (
    <View accessibilityLiveRegion="polite" style={styles.confirmation}>
      <Text style={styles.confirmationTitle}>Transaction submitted</Text>
      <Text style={styles.mutedText}>Confirm it on {confirmation.label}.</Text>
      <Pressable
        accessibilityRole="link"
        onPress={() => void Linking.openURL(confirmation.url)}
      >
        <Text style={styles.confirmationLink}>
          View on {confirmation.label}
        </Text>
      </Pressable>
      <Text selectable style={styles.codeText}>
        {submission.transactionId}
      </Text>
    </View>
  )
}

const walletCreationLabel = (walletCreation: WalletCreationState): string =>
  M.value(walletCreation).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      ReadyToCreateWallet: () => 'Create wallet',
      CreatingWallet: () => 'Creating…',
      FailedWalletCreation: () => 'Try again',
    }),
  )

const CopyAddressButton = ({
  address,
  copyId,
  model,
}: Readonly<{ address: string; copyId: string; model: Model }>) => {
  const actions = useWalletActions()
  const request = clipboardCopyRequestForAddress(address, copyId)
  const maybeFailure = clipboardCopyFailureMessage(model.clipboardCopy, request)
  const isCopying =
    model.clipboardCopy._tag === 'CopyingToClipboard' &&
    isSameClipboardCopyRequest(model.clipboardCopy.request, request)
  return (
    <View accessibilityLiveRegion="polite" style={styles.copyControl}>
      <Pressable
        accessibilityRole="button"
        disabled={isCopying}
        onPress={() => actions.requestedClipboardCopy(request)}
        style={[
          styles.copyButton,
          isCopying ? styles.disabledButton : undefined,
        ]}
      >
        <Text style={styles.copyButtonText}>
          {clipboardCopyLabel(model.clipboardCopy, request)}
        </Text>
      </Pressable>
      {Option.isSome(maybeFailure) ? (
        <Text accessibilityRole="alert" style={styles.copyError}>
          {maybeFailure.value}
        </Text>
      ) : null}
    </View>
  )
}

/** Runs the shared Wallet React bindings through one React Native presenter. */
export const WalletExample = ({
  hostOrigin,
  outerRuntimeMode,
  route,
}: Readonly<{
  hostOrigin: ReceivingQrProjectionInput['hostOrigin']
  outerRuntimeMode: ReceivingQrProjectionInput['runtimeMode']
  route: WalletInitialRoute
}>) => (
  <WalletProvider initialRoute={route} fallback={<StartingWallet />}>
    <WalletScreen hostOrigin={hostOrigin} outerRuntimeMode={outerRuntimeMode} />
  </WalletProvider>
)

const StartingWallet = () => (
  <View style={styles.card}>
    <Text style={styles.mutedText}>Starting Wallet…</Text>
  </View>
)

const WalletScreen = ({
  hostOrigin,
  outerRuntimeMode,
}: Readonly<{
  hostOrigin: ReceivingQrProjectionInput['hostOrigin']
  outerRuntimeMode: ReceivingQrProjectionInput['runtimeMode']
}>) => {
  const model = useWalletModel()
  const replay = useWalletReplay()
  const runtimeMode =
    replay.mode === 'Inspecting' ||
    outerRuntimeMode._tag === 'InspectingWalletRuntimeMode'
      ? inspectingWalletRuntimeMode
      : liveWalletRuntimeMode
  return (
    <View style={styles.wallet}>
      <WalletHome
        hostOrigin={hostOrigin}
        model={model}
        runtimeMode={runtimeMode}
      />
      <WalletHero model={model} />
      <SendMoney model={model} />
      <Activity model={model} />
      <AccountTools
        hostOrigin={hostOrigin}
        model={model}
        runtimeMode={runtimeMode}
      />
      <ReplayControls label="Wallet replay" replay={replay} />
    </View>
  )
}

const NetworkModePicker = ({ model }: Readonly<{ model: Model }>) => {
  const actions = useWalletActions()
  return (
    <View
      accessibilityLabel="Wallet network mode"
      style={styles.selectionButtons}
    >
      {Array.map(walletNetworkModes, networkMode => {
        const isSelected = model.walletNetworkMode === networkMode
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            key={networkMode}
            onPress={() => actions.selectedWalletNetworkMode(networkMode)}
            style={[
              styles.selectionButton,
              isSelected ? styles.selectedSelectionButton : undefined,
            ]}
          >
            <Text
              style={[
                styles.selectionButtonText,
                isSelected ? styles.selectedSelectionButtonText : undefined,
              ]}
            >
              {networkMode}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const WalletProfileCard = ({
  hostOrigin,
  model,
  runtimeMode,
  wallet,
}: Readonly<{
  hostOrigin: ReceivingQrProjectionInput['hostOrigin']
  model: Model
  runtimeMode: ReceivingQrProjectionInput['runtimeMode']
  wallet: WalletProfile
}>) => {
  const portfolio =
    model.portfolio._tag === 'LoadedPortfolio'
      ? model.portfolio.snapshot
      : undefined
  const networks = portfolio === undefined ? [] : portfolio.networks
  return (
    <View style={styles.walletProfile}>
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.eyebrow}>Multi-chain wallet</Text>
          <Text style={styles.walletProfileTitle}>{wallet.displayName}</Text>
        </View>
        <Text style={styles.networkModePill}>{model.walletNetworkMode}</Text>
      </View>
      <View style={styles.chainList}>
        {Array.map(
          activeWalletAccounts(wallet, networks, model.walletNetworkMode),
          account => (
            <View key={account.accountId} style={styles.chainRow}>
              <View style={styles.chainIdentity}>
                <Text style={styles.chainName}>{account.displayName}</Text>
                <Text style={styles.mutedText}>{account.networkName}</Text>
                <Text style={styles.chainBalance}>
                  {walletAccountBalanceLabel(model, account.accountId)}
                </Text>
              </View>
              <View style={styles.chainAddressLine}>
                <Text selectable style={styles.chainAddress}>
                  {shortenedAddress(account.address)}
                </Text>
                <CopyAddressButton
                  address={account.address}
                  copyId={`profile:${wallet.walletId}:${account.accountId}`}
                  model={model}
                />
              </View>
              <Text style={styles.chainDetail}>{account.chainId}</Text>
              {portfolio === undefined
                ? null
                : Array.map(
                    Array.filter(
                      portfolio.receivingInstructions,
                      instruction =>
                        instruction.accountId === account.accountId,
                    ),
                    instruction => (
                      <ReceivingQr
                        account={account}
                        hostOrigin={hostOrigin}
                        instruction={instruction}
                        key={`${instruction.accountId}:${instruction.assetId}`}
                        portfolio={portfolio}
                        runtimeMode={runtimeMode}
                      />
                    ),
                  )}
            </View>
          ),
        )}
      </View>
    </View>
  )
}

const ReceivingQr = ({
  account,
  hostOrigin,
  instruction,
  portfolio,
  runtimeMode,
}: Readonly<{
  account: WalletAccount
  hostOrigin: ReceivingQrProjectionInput['hostOrigin']
  instruction: ReceivingInstruction
  portfolio: PortfolioSnapshot
  runtimeMode: ReceivingQrProjectionInput['runtimeMode']
}>) => {
  const projection = useMemo(
    () =>
      projectReceivingQr({
        account,
        hostOrigin,
        instruction,
        portfolio,
        runtimeMode,
      }),
    [account, hostOrigin, instruction, portfolio, runtimeMode],
  )
  if (projection._tag === 'AvailableReceivingQr') {
    return (
      <View
        accessibilityLabel={`Scannable receive QR for ${instruction.assetId}`}
        style={styles.receiveQr}
        testID={`wallet-receive-qr:${instruction.accountId}:${instruction.assetId}`}
      >
        <Text style={styles.receiveQrTitle}>Receive {instruction.assetId}</Text>
        <Image
          accessibilityLabel={`Receive ${instruction.assetId} QR code`}
          accessible
          contentFit="contain"
          source={{ uri: projection.dataUrl }}
          style={styles.receiveQrImage}
        />
        <Text selectable style={styles.codeText}>
          {projection.payload}
        </Text>
      </View>
    )
  }
  return (
    <View
      accessibilityLabel={`Receive QR unavailable for ${instruction.assetId}`}
      style={styles.receiveQr}
      testID={`wallet-receive-qr-unavailable:${instruction.accountId}:${instruction.assetId}`}
    >
      <Text style={styles.receiveQrTitle}>Receive {instruction.assetId}</Text>
      <Text style={styles.receiveQrUnavailable}>
        {receivingQrUnavailableLabel(projection.reason)}
      </Text>
      <Text selectable style={styles.codeText}>
        {instruction.portableUri}
      </Text>
    </View>
  )
}

const WalletHome = ({
  hostOrigin,
  model,
  runtimeMode,
}: Readonly<{
  hostOrigin: ReceivingQrProjectionInput['hostOrigin']
  model: Model
  runtimeMode: ReceivingQrProjectionInput['runtimeMode']
}>) => {
  const actions = useWalletActions()
  const profiles = (() => {
    if (model.walletProfileLoading._tag === 'LoadingWalletProfiles') {
      return (
        <View style={styles.walletEmpty}>
          <Text style={styles.chainName}>Restoring secure wallets…</Text>
          <Text style={styles.mutedText}>
            Loading locally protected custody and public addresses.
          </Text>
        </View>
      )
    } else if (
      model.walletProfileLoading._tag === 'FailedWalletProfileLoading'
    ) {
      return (
        <View accessibilityRole="alert" style={styles.walletEmpty}>
          <Text style={styles.chainName}>
            Secure wallet storage is unavailable.
          </Text>
          <Text style={styles.mutedText}>
            No stored key material was loaded ({model.walletProfileLoading.code}
            ).
          </Text>
          <WalletActionButton
            label="Retry secure storage"
            onPress={actions.requestedWalletProfilesReload}
          />
        </View>
      )
    } else {
      return Array.match(model.wallets, {
        onEmpty: () => (
          <View style={styles.walletEmpty}>
            <Text style={styles.chainName}>No wallets yet.</Text>
            <Text style={styles.mutedText}>
              Create one wallet with Bitcoin, Ethereum, Solana, and Sui
              accounts.
            </Text>
          </View>
        ),
        onNonEmpty: wallets => (
          <View style={styles.walletProfileList}>
            {Array.map(wallets, wallet => (
              <WalletProfileCard
                hostOrigin={hostOrigin}
                key={wallet.walletId}
                model={model}
                runtimeMode={runtimeMode}
                wallet={wallet}
              />
            ))}
          </View>
        ),
      })
    }
  })()
  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.eyebrow}>Secure local custody</Text>
          <Text style={styles.sectionTitle}>Your wallets</Text>
        </View>
        <WalletActionButton
          isDisabled={
            model.walletProfileLoading._tag !== 'LoadedWalletProfiles' ||
            model.walletCreation._tag === 'CreatingWallet'
          }
          isPrimary
          label={walletCreationLabel(model.walletCreation)}
          onPress={actions.requestedWalletCreation}
        />
      </View>
      <View style={styles.networkControl}>
        <View style={styles.networkExplanation}>
          <Text style={styles.chainName}>Network mode</Text>
          <Text style={styles.mutedText}>
            Switches every wallet and chain together.
          </Text>
        </View>
        <NetworkModePicker model={model} />
      </View>
      {model.walletCreation._tag === 'FailedWalletCreation' ? (
        <Text accessibilityRole="alert" style={styles.validationText}>
          Wallet creation failed ({model.walletCreation.code}). No secret key
          entered the Model or replay journal.
        </Text>
      ) : null}
      {profiles}
    </View>
  )
}

const WalletHero = ({ model }: Readonly<{ model: Model }>) => {
  const actions = useWalletActions()
  const maybeAccount = primaryWalletAccount(model)
  const maybeBalance = primaryWalletBalance(model)
  const isBalanceUnavailable = isPrimaryWalletBalanceUnavailable(model)
  const balanceLabel = Option.match(maybeBalance, {
    onNone: () => {
      if (model.portfolio._tag === 'LoadingPortfolio') {
        return 'Loading…'
      } else if (isBalanceUnavailable) {
        return 'Unavailable. Refresh to retry.'
      } else {
        return '—'
      }
    },
    onSome: balance => assetAmountLabelForModel(model, balance.amount),
  })
  const accountLabel = Option.match(maybeAccount, {
    onNone: () =>
      model.portfolio._tag === 'LoadingPortfolio'
        ? 'Loading adapter account…'
        : 'No adapter account available',
    onSome: account => {
      const networkName = Option.match(primaryWalletNetwork(model), {
        onNone: () => account.networkId,
        onSome: network => network.displayName,
      })
      return `${networkName} · ${shortenedAddress(account.address)}`
    },
  })
  const dataSourceLabel =
    model.portfolio._tag === 'LoadedPortfolio'
      ? walletDataSourceLabel(model.portfolio.snapshot.dataSource)
      : 'Loading data source'
  const dataSourceDetail =
    model.portfolio._tag === 'LoadedPortfolio'
      ? walletDataSourceDetail(model.portfolio.snapshot.dataSource)
      : 'Waiting for the selected portfolio adapter.'
  return (
    <View style={[styles.card, styles.hero]}>
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.eyebrow}>{dataSourceLabel}</Text>
          <Text style={styles.title}>Portfolio</Text>
        </View>
        <WalletActionButton
          label="Refresh"
          onPress={actions.requestedWalletRefresh}
        />
      </View>
      <View style={styles.balanceBlock}>
        <Text style={styles.mutedText}>Available balance</Text>
        <Text adjustsFontSizeToFit numberOfLines={1} style={styles.balance}>
          {balanceLabel}
        </Text>
        <View style={styles.addressLine}>
          <Text style={styles.mutedText}>{accountLabel}</Text>
          {Option.isSome(maybeAccount) ? (
            <CopyAddressButton
              address={maybeAccount.value.address}
              copyId="primary-account"
              model={model}
            />
          ) : null}
        </View>
      </View>
      <Text style={styles.mutedText}>{dataSourceDetail}</Text>
      {model.portfolio._tag === 'FailedPortfolio' ? (
        <Text accessibilityRole="alert" style={styles.validationText}>
          Portfolio failed: {model.portfolio.failure.operation} ·{' '}
          {model.portfolio.failure.code}
        </Text>
      ) : null}
    </View>
  )
}

const SendNetworkPicker = ({ model }: Readonly<{ model: Model }>) => {
  const actions = useWalletActions()
  if (model.portfolio._tag !== 'LoadedPortfolio') {
    return null
  }
  const portfolio = model.portfolio.snapshot
  const selections = availableSendNetworkSelections(
    portfolio,
    model.walletNetworkMode,
  )
  const selectedValue = Option.match(model.maybeSendNetworkSelection, {
    onNone: () => '',
    onSome: sendNetworkSelectionIdentity,
  })
  return (
    <View style={styles.pickerField}>
      <Text style={styles.recipientLabel}>Cryptocurrency and network</Text>
      <View
        accessibilityLabel="Cryptocurrency and network"
        style={styles.selectionButtons}
      >
        {Array.map(selections, selection => {
          const identity = sendNetworkSelectionIdentity(selection)
          const isSelected = selectedValue === identity
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              key={identity}
              onPress={() => actions.selectedSendNetwork(selection)}
              style={[
                styles.sendSelectionButton,
                isSelected ? styles.selectedSelectionButton : undefined,
              ]}
            >
              <Text
                style={[
                  styles.selectionButtonText,
                  isSelected ? styles.selectedSelectionButtonText : undefined,
                ]}
              >
                {sendNetworkSelectionLabel(portfolio, model.wallets, selection)}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const testFundingButtonLabel = (model: Model): string => {
  if (model.testFunding._tag === 'RequestingTestFunding') {
    return 'Requesting test funds…'
  } else if (model.transferAmount._tag !== 'ValidTransferAmount') {
    return 'Enter amount to request test funds'
  } else {
    return 'Request test funds'
  }
}

const ExternalTestFundingAction = ({
  address,
  accountId,
  model,
  providerName,
  providerUrl,
}: Readonly<{
  address: string
  accountId: string
  model: Model
  providerName: string
  providerUrl: string
}>) => {
  const actions = useWalletActions()
  const isWaitingToOpen = useRef(false)
  const request = clipboardCopyRequestForAddress(
    address,
    `external-test-funding:${accountId}`,
  )
  const isCopying =
    model.clipboardCopy._tag === 'CopyingToClipboard' &&
    isSameClipboardCopyRequest(model.clipboardCopy.request, request)
  const isCopied =
    model.clipboardCopy._tag === 'CopiedToClipboard' &&
    isSameClipboardCopyRequest(model.clipboardCopy.request, request)
  const isFailed =
    model.clipboardCopy._tag === 'FailedClipboardCopy' &&
    isSameClipboardCopyRequest(model.clipboardCopy.request, request)
  const maybeFailure = clipboardCopyFailureMessage(model.clipboardCopy, request)

  useEffect(() => {
    if (!isWaitingToOpen.current) {
      return
    }
    if (isCopied) {
      isWaitingToOpen.current = false
      void Linking.openURL(providerUrl)
    } else if (isFailed) {
      isWaitingToOpen.current = false
    }
  }, [isCopied, isFailed, providerUrl])

  return (
    <View accessibilityLiveRegion="polite" style={styles.fundingRow}>
      <WalletActionButton
        isDisabled={isCopying}
        label={
          isCopying
            ? 'Copying address…'
            : `Copy address and open ${providerName}`
        }
        onPress={() => {
          isWaitingToOpen.current = true
          actions.requestedClipboardCopy(request)
        }}
      />
      <Text style={styles.mutedText}>
        The selected address is copied before the provider page opens.
      </Text>
      {Option.isSome(maybeFailure) ? (
        <Text accessibilityRole="alert" style={styles.copyError}>
          {maybeFailure.value}
        </Text>
      ) : null}
    </View>
  )
}

const SendMoney = ({ model }: Readonly<{ model: Model }>) => {
  const actions = useWalletActions()
  const maybeAccount = primaryWalletAccount(model)
  const maybePreview = maybePreviewForTransaction(model.transaction)
  const networkName = Option.match(primaryWalletNetwork(model), {
    onNone: () => 'selected network',
    onSome: network => network.displayName,
  })
  const maybeAsset = primaryWalletAsset(model)
  const maybeSuggestedTestTransferAmount =
    primaryWalletSuggestedTestTransferAmount(model)
  const maybeSuggestedTestTransferLabel =
    primaryWalletSuggestedTestTransferLabel(model)
  const amountSymbol = Option.match(maybeAsset, {
    onNone: () => 'Amount',
    onSome: asset => `Amount in ${asset.symbol}`,
  })
  const maybeAmountFailure = transferAmountFailure(model)
  const maybeExternalTestFunding = Option.flatMap(
    primaryWalletTestFundingMethod(model),
    method =>
      method._tag === 'ExternalTestFundingMethod'
        ? Option.some(method)
        : Option.none(),
  )
  const canRequestTestFunding = selectedNetworkHasCapability(
    model,
    'TestFunding',
  )
  const isTestFundingDisabled =
    model.testFunding._tag === 'RequestingTestFunding' ||
    model.transferAmount._tag !== 'ValidTransferAmount'
  const isTransferActionEnabled = isTransferPreviewActionEnabled(model)

  const submitPreview = (): void => {
    if (Option.isSome(maybePreview)) {
      actions.requestedSignedTransactionSubmission(maybePreview.value.previewId)
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.eyebrow}>Send</Text>
          <Text style={styles.sectionTitle}>
            {Option.match(maybeAsset, {
              onNone: () => 'Select an asset',
              onSome: asset => asset.symbol,
            })}
          </Text>
        </View>
        <Text style={styles.status}>
          {transactionStatus(model.transaction)}
        </Text>
      </View>
      <SendNetworkPicker model={model} />
      <View style={styles.recipientField}>
        <Text style={styles.recipientLabel}>{amountSymbol}</Text>
        <TextInput
          accessibilityLabel={amountSymbol}
          autoCorrect={false}
          editable={model.transaction._tag !== 'SubmittingTransaction'}
          inputMode="decimal"
          keyboardType="decimal-pad"
          onChangeText={actions.changedTransferAmount}
          placeholder="0.00"
          placeholderTextColor="#9f8560"
          style={styles.recipientInput}
          value={transferAmountInput(model.transferAmount)}
        />
        {Option.isSome(maybeSuggestedTestTransferAmount) &&
        Option.isSome(maybeSuggestedTestTransferLabel) ? (
          <View style={styles.testAmountRow}>
            <WalletActionButton
              isDisabled={model.transaction._tag === 'SubmittingTransaction'}
              label="Use small test amount"
              onPress={() =>
                actions.changedTransferAmount(
                  maybeSuggestedTestTransferAmount.value,
                )
              }
            />
            <Text style={styles.mutedText}>
              {maybeSuggestedTestTransferLabel.value}
            </Text>
          </View>
        ) : null}
        {Option.isSome(maybeAmountFailure) ? (
          <Text accessibilityRole="alert" style={styles.validationText}>
            {maybeAmountFailure.value}
          </Text>
        ) : null}
      </View>
      <View style={styles.recipientField}>
        <Text style={styles.recipientLabel}>Recipient on {networkName}</Text>
        <TextInput
          accessibilityLabel={`Recipient on ${networkName}`}
          autoCapitalize="none"
          autoCorrect={false}
          editable={model.transaction._tag !== 'SubmittingTransaction'}
          onChangeText={actions.changedTransferRecipient}
          placeholder="Recipient address"
          placeholderTextColor="#9f8560"
          style={styles.recipientInput}
          value={transferRecipientInput(model.transferRecipient)}
        />
        {model.transferRecipient._tag === 'InvalidTransferRecipient' ? (
          <View accessibilityRole="alert" style={styles.validationBlock}>
            <Text style={styles.validationText}>
              {model.transferRecipient.guidance.summary}
            </Text>
            {Array.map(model.transferRecipient.guidance.details, detail => (
              <Text key={detail} style={styles.validationText}>
                • {detail}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
      {Option.isSome(maybePreview) ? (
        <View style={styles.preview}>
          <PreviewRow
            copyAddress={maybePreview.value.transfer.recipient.displayAddress}
            copyId="transfer-preview-recipient"
            label="To"
            model={model}
            value={shortenedAddress(
              maybePreview.value.transfer.recipient.displayAddress,
            )}
          />
          <PreviewRow
            label="Network fee"
            value={assetAmountLabelForModel(
              model,
              maybePreview.value.estimatedFee,
            )}
          />
          <PreviewRow
            label="Balance after"
            value={assetAmountLabelForModel(
              model,
              maybePreview.value.resultingBalance,
            )}
          />
        </View>
      ) : (
        <Text style={styles.helpText}>
          Enter an exact amount and recipient. The selected adapter validates a
          network quote before anything is signed.
        </Text>
      )}
      {canRequestTestFunding ? (
        <View style={styles.fundingRow}>
          <WalletActionButton
            isDisabled={isTestFundingDisabled}
            label={testFundingButtonLabel(model)}
            onPress={actions.requestedTestFunding}
          />
          {model.testFunding._tag === 'ReceivedTestFunding' ? (
            <Text accessibilityLiveRegion="polite" style={styles.mutedText}>
              Received{' '}
              {assetAmountLabelForModel(
                model,
                model.testFunding.receipt.amount,
              )}
            </Text>
          ) : null}
        </View>
      ) : null}
      {Option.isSome(maybeExternalTestFunding) &&
      Option.isSome(maybeAccount) ? (
        <ExternalTestFundingAction
          accountId={maybeAccount.value.accountId}
          address={maybeAccount.value.address}
          model={model}
          providerName={maybeExternalTestFunding.value.providerName}
          providerUrl={maybeExternalTestFunding.value.providerUrl}
        />
      ) : null}
      {model.testFunding._tag === 'FailedTestFunding' ||
      model.testFunding._tag === 'UnavailableTestFunding' ? (
        <Text accessibilityRole="alert" style={styles.validationText}>
          Test funding failed: {model.testFunding.failure.operation} ·{' '}
          {model.testFunding.failure.code}
        </Text>
      ) : null}
      {model.transaction._tag === 'FailedTransferValidation' ||
      model.transaction._tag === 'FailedTransactionPreview' ||
      model.transaction._tag === 'FailedTransactionSubmission' ? (
        <View accessibilityRole="alert" style={styles.validationBlock}>
          {Array.map(walletFailureLines(model.transaction.failure), line => (
            <Text key={line} style={styles.validationText}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
      {model.transaction._tag === 'SubmittedTransaction' ? (
        <TransactionSubmissionConfirmation
          submission={model.transaction.submission}
        />
      ) : null}
      <Text
        accessibilityLiveRegion="polite"
        style={
          isTransferActionEnabled
            ? styles.readinessReady
            : styles.readinessBlocked
        }
      >
        {transferPreviewReadinessLabel(model)}
      </Text>
      <WalletActionButton
        isDisabled={!isTransferActionEnabled}
        isPrimary
        label={
          model.transaction._tag === 'PreviewedTransaction'
            ? 'Confirm send'
            : 'Preview send'
        }
        onPress={
          model.transaction._tag === 'PreviewedTransaction'
            ? submitPreview
            : actions.requestedTransferPreview
        }
      />
    </View>
  )
}

const PreviewRow = ({
  copyAddress,
  copyId,
  label,
  model,
  value,
}: Readonly<{
  copyAddress?: string
  copyId?: string
  label: string
  model?: Model
  value: string
}>) => (
  <View style={styles.previewRow}>
    <Text style={styles.mutedText}>{label}</Text>
    <View style={styles.previewValueBlock}>
      <Text style={styles.previewValue}>{value}</Text>
      {copyAddress !== undefined &&
      copyId !== undefined &&
      model !== undefined ? (
        <CopyAddressButton
          address={copyAddress}
          copyId={copyId}
          model={model}
        />
      ) : null}
    </View>
  </View>
)

const Activity = ({ model }: Readonly<{ model: Model }>) => {
  const actions = useWalletActions()
  const canLoadHistory = selectedNetworkHasCapability(
    model,
    'TransactionHistory',
  )
  const hasNextPage =
    model.transactionHistory._tag === 'LoadedTransactionHistory' &&
    Option.isSome(model.transactionHistory.maybeNextCursor)
  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.eyebrow}>Recent activity</Text>
          <Text style={styles.mutedText}>
            {model.transactionObservation._tag}
          </Text>
        </View>
        {canLoadHistory ? (
          <WalletActionButton
            isDisabled={
              model.transactionHistory._tag === 'LoadingTransactionHistory'
            }
            label="Reload history"
            onPress={actions.requestedTransactionHistoryReload}
          />
        ) : null}
      </View>
      {model.transactionObservation._tag === 'FailedTransactionObservation' ? (
        <View accessibilityRole="alert" style={styles.validationBlock}>
          <Text style={styles.validationText}>
            Live observation failed: {model.transactionObservation.failure.code}
          </Text>
          <WalletActionButton
            label="Retry live observation"
            onPress={actions.resumedTransactionObservation}
          />
        </View>
      ) : null}
      {model.transactionHistory._tag === 'FailedTransactionHistory' ? (
        <Text accessibilityRole="alert" style={styles.validationText}>
          History failed: {model.transactionHistory.failure.operation} ·{' '}
          {model.transactionHistory.failure.code}
        </Text>
      ) : null}
      {Array.match(model.transactions, {
        onEmpty: () => (
          <Text style={styles.helpText}>No transactions found.</Text>
        ),
        onNonEmpty: transactions => (
          <View style={styles.list}>
            {Array.map(transactions, transaction => (
              <View key={transaction.recordId} style={styles.activityRow}>
                <View>
                  <Text style={styles.activityStatus}>
                    {transaction.direction} · {transaction.status}
                  </Text>
                  <Text style={styles.mutedText}>
                    {shortenedAddress(transaction.transactionId)}
                  </Text>
                </View>
                <Text style={styles.activityValue}>
                  {assetAmountLabelForModel(model, transaction.amount)}
                </Text>
              </View>
            ))}
          </View>
        ),
      })}
      {canLoadHistory ? (
        <WalletActionButton
          isDisabled={!hasNextPage}
          label={hasNextPage ? 'Load next page' : 'No more history'}
          onPress={actions.requestedNextTransactionHistoryPage}
        />
      ) : (
        <Text style={styles.helpText}>
          Transaction history is unavailable for the selected network.
        </Text>
      )}
    </View>
  )
}

const AccountTools = ({
  hostOrigin,
  model,
  runtimeMode,
}: Readonly<{
  hostOrigin: ReceivingQrProjectionInput['hostOrigin']
  model: Model
  runtimeMode: ReceivingQrProjectionInput['runtimeMode']
}>) => {
  const actions = useWalletActions()
  const maybeAccount = primaryWalletAccount(model)
  const maybeReceiving = primaryReceivingInstruction(model)
  const signChallenge = (): void => {
    if (Option.isSome(maybeAccount)) {
      actions.requestedChallengeSignature(
        makeWalletTestChallenge(
          'expo-wallet-challenge',
          maybeAccount.value.accountId,
        ),
      )
    }
  }
  return (
    <View style={[styles.card, styles.secondaryCard]}>
      <Text style={styles.eyebrow}>Account and proof</Text>
      {Option.isSome(maybeAccount) ? (
        <View style={styles.addressLine}>
          <Text selectable style={styles.codeText}>
            {maybeAccount.value.address}
          </Text>
          <CopyAddressButton
            address={maybeAccount.value.address}
            copyId="account-details"
            model={model}
          />
        </View>
      ) : (
        <Text style={styles.mutedText}>Account data is not loaded.</Text>
      )}
      {Option.isSome(maybeReceiving) ? (
        <View style={styles.receiveBlock}>
          <Text style={styles.mutedText}>Receive</Text>
          <View style={styles.addressLine}>
            <Text selectable style={styles.codeText}>
              {maybeReceiving.value.destinationAddress}
            </Text>
            <CopyAddressButton
              address={maybeReceiving.value.destinationAddress}
              copyId="receiving-address"
              model={model}
            />
          </View>
          {Option.isSome(maybeAccount) &&
          model.portfolio._tag === 'LoadedPortfolio' ? (
            <ReceivingQr
              account={maybeAccount.value}
              hostOrigin={hostOrigin}
              instruction={maybeReceiving.value}
              portfolio={model.portfolio.snapshot}
              runtimeMode={runtimeMode}
            />
          ) : null}
        </View>
      ) : null}
      <Text style={styles.mutedText}>Proof: {model.signature._tag}</Text>
      <WalletActionButton
        isDisabled={Option.isNone(maybeAccount)}
        label="Sign test challenge"
        onPress={signChallenge}
      />
    </View>
  )
}

const WalletActionButton = ({
  isDisabled = false,
  isPrimary = false,
  label,
  onPress,
}: Readonly<{
  isDisabled?: boolean
  isPrimary?: boolean
  label: string
  onPress: () => void
}>) => (
  <Pressable
    accessibilityRole="button"
    disabled={isDisabled}
    onPress={onPress}
    style={[
      styles.button,
      isPrimary ? styles.primaryButton : styles.secondaryButton,
      isDisabled ? styles.disabledButton : undefined,
    ]}
  >
    <Text
      style={isPrimary ? styles.primaryButtonText : styles.secondaryButtonText}
    >
      {label}
    </Text>
  </Pressable>
)

const styles = StyleSheet.create({
  wallet: { gap: 16 },
  card: {
    backgroundColor: '#251d13',
    borderColor: '#665237',
    borderRadius: 24,
    borderWidth: 2,
    gap: 16,
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { height: 7, width: 0 },
    shadowOpacity: 0.42,
    shadowRadius: 9,
  },
  hero: { minHeight: 300 },
  secondaryCard: { opacity: 0.84 },
  headingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  networkControl: {
    backgroundColor: '#171109',
    borderColor: '#665237',
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  networkExplanation: { gap: 3 },
  pickerField: { gap: 8 },
  selectionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectionButton: {
    backgroundColor: '#100d09',
    borderColor: '#665237',
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  sendSelectionButton: {
    backgroundColor: '#100d09',
    borderColor: '#665237',
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectedSelectionButton: {
    backgroundColor: '#f2b85f',
    borderColor: '#f2b85f',
  },
  selectionButtonText: {
    color: '#f7dca5',
    fontSize: 13,
    fontWeight: '800',
  },
  selectedSelectionButtonText: { color: '#17130d' },
  walletEmpty: {
    alignItems: 'center',
    backgroundColor: '#171109',
    borderColor: '#665237',
    borderRadius: 16,
    borderStyle: 'dashed',
    borderWidth: 2,
    gap: 5,
    padding: 24,
  },
  walletProfileList: { gap: 12 },
  walletProfile: {
    backgroundColor: '#171109',
    borderColor: '#665237',
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  walletProfileTitle: {
    color: '#f7dca5',
    fontSize: 24,
    fontWeight: '900',
  },
  networkModePill: {
    borderColor: '#665237',
    borderRadius: 999,
    borderWidth: 1,
    color: '#d3a861',
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  chainList: { gap: 8 },
  chainRow: {
    alignItems: 'center',
    backgroundColor: '#100d09',
    borderRadius: 13,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
    padding: 12,
  },
  chainIdentity: { flexGrow: 1, gap: 2 },
  chainName: { color: '#f7dca5', fontSize: 14, fontWeight: '900' },
  chainBalance: { color: '#f2b85f', fontSize: 15, fontWeight: '900' },
  chainAddress: {
    color: '#f7dca5',
    fontFamily: 'monospace',
    fontSize: 11,
  },
  chainAddressLine: {
    alignItems: 'flex-end',
    flexShrink: 1,
    gap: 6,
  },
  chainDetail: {
    color: '#d3a861',
    flexBasis: '100%',
    fontSize: 11,
  },
  eyebrow: {
    color: '#d3a861',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  title: {
    color: '#f7dca5',
    fontSize: 52,
    fontWeight: '900',
    lineHeight: 56,
  },
  balanceBlock: { gap: 5, marginTop: 50 },
  addressLine: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  receiveBlock: { gap: 10 },
  receiveQr: {
    alignItems: 'center',
    backgroundColor: '#100d09',
    borderColor: '#665237',
    borderRadius: 16,
    borderWidth: 1,
    flexBasis: '100%',
    gap: 8,
    padding: 14,
    width: '100%',
  },
  receiveQrImage: { height: 220, width: 220 },
  receiveQrTitle: { color: '#f7dca5', fontSize: 14, fontWeight: '900' },
  receiveQrUnavailable: {
    color: '#e8aa4a',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  balance: {
    color: '#f7dca5',
    fontSize: 64,
    fontWeight: '900',
    lineHeight: 70,
  },
  sectionTitle: {
    color: '#f7dca5',
    fontSize: 38,
    fontWeight: '900',
    lineHeight: 42,
  },
  status: {
    borderColor: '#665237',
    borderRadius: 999,
    borderWidth: 1,
    color: '#d3a861',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  recipientField: { gap: 8 },
  recipientLabel: {
    color: '#d8bd8c',
    fontSize: 15,
    fontWeight: '800',
  },
  recipientInput: {
    backgroundColor: '#171109',
    borderColor: '#665237',
    borderRadius: 16,
    borderWidth: 2,
    color: '#f7dca5',
    fontFamily: 'monospace',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  validationText: {
    color: '#e8aa4a',
    fontSize: 14,
    lineHeight: 20,
  },
  validationBlock: { gap: 5 },
  mutedText: { color: '#d3a861', fontSize: 13, lineHeight: 19 },
  helpText: { color: '#d3a861', fontSize: 16, lineHeight: 23 },
  testAmountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  readinessReady: {
    color: '#9bd9a9',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  readinessBlocked: {
    color: '#d3a861',
    fontSize: 14,
    lineHeight: 20,
  },
  fundingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  preview: { gap: 8 },
  previewRow: {
    alignItems: 'center',
    backgroundColor: '#100d09',
    borderRadius: 13,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 13,
  },
  previewValue: {
    color: '#f7dca5',
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
  },
  previewValueBlock: { alignItems: 'flex-end', flexShrink: 1, gap: 6 },
  confirmation: {
    backgroundColor: '#100d09',
    borderColor: '#f2b85f',
    borderRadius: 16,
    borderWidth: 2,
    gap: 8,
    padding: 14,
  },
  confirmationTitle: { color: '#f7dca5', fontSize: 17, fontWeight: '900' },
  confirmationLink: {
    color: '#f2b85f',
    fontSize: 15,
    fontWeight: '900',
    textDecorationLine: 'underline',
  },
  list: { gap: 8 },
  activityRow: {
    alignItems: 'center',
    backgroundColor: '#100d09',
    borderRadius: 13,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 13,
  },
  activityStatus: { color: '#f7dca5', fontSize: 14, fontWeight: '800' },
  activityValue: { color: '#f2b85f', fontSize: 16, fontWeight: '900' },
  codeText: {
    color: '#d3a861',
    flexShrink: 1,
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 17,
  },
  button: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 2,
    minHeight: 48,
    paddingHorizontal: 17,
    paddingVertical: 12,
  },
  primaryButton: { backgroundColor: '#f2b85f', borderColor: '#f2b85f' },
  secondaryButton: { backgroundColor: 'transparent', borderColor: '#665237' },
  disabledButton: { opacity: 0.38 },
  primaryButtonText: { color: '#17130d', fontSize: 14, fontWeight: '900' },
  secondaryButtonText: { color: '#f7dca5', fontSize: 14, fontWeight: '900' },
  copyControl: { alignItems: 'flex-start', flexShrink: 1, gap: 5 },
  copyButton: {
    borderColor: '#665237',
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 32,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  copyButtonText: { color: '#f7dca5', fontSize: 11, fontWeight: '900' },
  copyError: {
    color: '#e8aa4a',
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 16,
    maxWidth: 280,
  },
})
