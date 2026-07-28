import { Array, Match as M, Option } from 'effect'
import * as Crypto from 'expo-crypto'
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  type Model,
  type SendNetworkSelection,
  type TransactionPreview,
  type TransactionState,
  type TransactionSubmission,
  type WalletCreationState,
  type WalletNetworkMode,
  type WalletProfile,
  activeWalletAccounts,
  assetAmountLabel,
  assetAmountLabelForModel,
  availableSendNetworkSelections,
  chainForId,
  clipboardCopyFailureMessage,
  clipboardCopyLabel,
  clipboardCopyRequestForAddress,
  demoTransferAtomicUnitsForSelection,
  isSameClipboardCopyRequest,
  makeWalletTestChallenge,
  networkForId,
  primaryReceivingInstruction,
  primaryWalletAccount,
  primaryWalletAsset,
  primaryWalletBalance,
  primaryWalletNetwork,
  shortenedAddress,
  transferRecipientInput,
} from 'wallet-core-example'
import { makeLocalWalletVault } from 'wallet-local-vault-example'
import {
  type WalletInitialRoute,
  makeWalletReactClient,
} from 'wallet-react-bindings-example'
import { makeSimulatedWalletResources } from 'wallet-simulated-client-example'

import { ReplayControls } from '../replayControls'
import { ExpoWalletClipboard } from './walletClipboard'

const ExpoWalletVault = makeLocalWalletVault(byteCount =>
  Crypto.getRandomBytes(byteCount),
)

const { WalletProvider, useWalletActions, useWalletModel, useWalletReplay } =
  makeWalletReactClient(
    makeSimulatedWalletResources({
      walletClipboard: ExpoWalletClipboard,
      walletVault: ExpoWalletVault,
    }),
  )

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
  route,
}: Readonly<{ route: WalletInitialRoute }>) => (
  <WalletProvider initialRoute={route} fallback={<StartingWallet />}>
    <WalletScreen />
  </WalletProvider>
)

const StartingWallet = () => (
  <View style={styles.card}>
    <Text style={styles.mutedText}>Starting Wallet…</Text>
  </View>
)

const WalletScreen = () => {
  const model = useWalletModel()
  const replay = useWalletReplay()
  return (
    <View style={styles.wallet}>
      <WalletHome model={model} />
      <WalletHero model={model} />
      <SendMoney model={model} />
      <Activity model={model} />
      <AccountTools model={model} />
      <ReplayControls label="Wallet replay" replay={replay} />
    </View>
  )
}

const NetworkModeButton = ({
  model,
  networkMode,
}: Readonly<{ model: Model; networkMode: WalletNetworkMode }>) => {
  const actions = useWalletActions()
  const isSelected = model.walletNetworkMode === networkMode
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      onPress={() => actions.selectedWalletNetworkMode(networkMode)}
      style={[
        styles.networkModeButton,
        isSelected ? styles.selectedNetworkModeButton : undefined,
      ]}
    >
      <Text
        style={
          isSelected ? styles.selectedNetworkModeText : styles.networkModeText
        }
      >
        {networkMode}
      </Text>
    </Pressable>
  )
}

const WalletProfileCard = ({
  model,
  wallet,
}: Readonly<{ model: Model; wallet: WalletProfile }>) => (
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
        activeWalletAccounts(wallet, model.walletNetworkMode),
        account => (
          <View key={account.accountId} style={styles.chainRow}>
            <View style={styles.chainIdentity}>
              <Text style={styles.chainName}>{account.chain}</Text>
              <Text style={styles.mutedText}>{account.networkName}</Text>
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
            <Text style={styles.chainDetail}>{account.detail}</Text>
          </View>
        ),
      )}
    </View>
  </View>
)

const WalletHome = ({ model }: Readonly<{ model: Model }>) => {
  const actions = useWalletActions()
  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.eyebrow}>Session-only custody</Text>
          <Text style={styles.sectionTitle}>Your wallets</Text>
        </View>
        <WalletActionButton
          isDisabled={model.walletCreation._tag === 'CreatingWallet'}
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
        <View style={styles.networkSwitch}>
          <NetworkModeButton model={model} networkMode="Devnet" />
          <NetworkModeButton model={model} networkMode="Testnet" />
        </View>
      </View>
      {model.walletCreation._tag === 'FailedWalletCreation' ? (
        <Text accessibilityRole="alert" style={styles.validationText}>
          Wallet creation failed ({model.walletCreation.code}). No secret key
          entered the Model or replay journal.
        </Text>
      ) : null}
      {Array.match(model.wallets, {
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
                key={wallet.walletId}
                model={model}
                wallet={wallet}
              />
            ))}
          </View>
        ),
      })}
    </View>
  )
}

const WalletHero = ({ model }: Readonly<{ model: Model }>) => {
  const actions = useWalletActions()
  const maybeAccount = primaryWalletAccount(model)
  const maybeBalance = primaryWalletBalance(model)
  const balanceLabel = Option.match(maybeBalance, {
    onNone: () =>
      model.portfolio._tag === 'LoadingPortfolio' ? 'Loading…' : '—',
    onSome: balance => assetAmountLabelForModel(model, balance.amount),
  })
  const accountLabel = Option.match(maybeAccount, {
    onNone: () => 'Sepolia test wallet',
    onSome: account => {
      const networkName = Option.match(primaryWalletNetwork(model), {
        onNone: () => account.networkId,
        onSome: network => network.displayName,
      })
      return `${networkName} · ${shortenedAddress(account.address)}`
    },
  })
  return (
    <View style={[styles.card, styles.hero]}>
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.eyebrow}>Test money</Text>
          <Text style={styles.title}>Wallet</Text>
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
    </View>
  )
}

const SendNetworkButton = ({
  model,
  selection,
}: Readonly<{ model: Model; selection: SendNetworkSelection }>) => {
  const actions = useWalletActions()
  if (model.portfolio._tag !== 'LoadedPortfolio') {
    return null
  }
  const portfolio = model.portfolio.snapshot
  const chainName = Option.match(
    chainForId(portfolio.chains, selection.chainId),
    {
      onNone: () => selection.chainId,
      onSome: chain => chain.displayName,
    },
  )
  const networkName = Option.match(
    networkForId(portfolio.networks, selection.networkId),
    {
      onNone: () => selection.networkId,
      onSome: network => network.displayName,
    },
  )
  const isSelected = Option.exists(
    model.maybeSendNetworkSelection,
    current =>
      current.networkId === selection.networkId &&
      current.accountId === selection.accountId &&
      current.assetId === selection.assetId,
  )
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      onPress={() => actions.selectedSendNetwork(selection)}
      style={[
        styles.sendNetwork,
        isSelected ? styles.selectedSendNetwork : undefined,
      ]}
    >
      <Text
        numberOfLines={1}
        style={isSelected ? styles.selectedSendNetworkText : styles.chainName}
      >
        {chainName}
      </Text>
      <Text
        numberOfLines={1}
        style={isSelected ? styles.selectedSendNetworkText : styles.mutedText}
      >
        {networkName}
      </Text>
    </Pressable>
  )
}

const SendNetworkPicker = ({ model }: Readonly<{ model: Model }>) => {
  if (model.portfolio._tag !== 'LoadedPortfolio') {
    return null
  }
  return (
    <View
      accessibilityLabel="Send network selection"
      style={styles.sendNetworks}
    >
      {Array.map(
        availableSendNetworkSelections(
          model.portfolio.snapshot,
          model.walletNetworkMode,
        ),
        selection => (
          <SendNetworkButton
            key={selection.networkId}
            model={model}
            selection={selection}
          />
        ),
      )}
    </View>
  )
}

const SendMoney = ({ model }: Readonly<{ model: Model }>) => {
  const actions = useWalletActions()
  const maybeBalance = primaryWalletBalance(model)
  const maybePreview = maybePreviewForTransaction(model.transaction)
  const networkName = Option.match(primaryWalletNetwork(model), {
    onNone: () => 'selected network',
    onSome: network => network.displayName,
  })
  const exampleAddress = Option.match(primaryWalletAccount(model), {
    onNone: () => 'Recipient address',
    onSome: account => account.address,
  })
  const transferAmount = Option.match(model.maybeSendNetworkSelection, {
    onNone: () => 'Select a network',
    onSome: selection =>
      Option.match(primaryWalletAsset(model), {
        onNone: () => demoTransferAtomicUnitsForSelection(selection),
        onSome: asset =>
          assetAmountLabel(
            {
              assetId: asset.assetId,
              atomicUnits: demoTransferAtomicUnitsForSelection(selection),
              observedAt: 0,
            },
            asset,
          ),
      }),
  })

  const submitPreview = (): void => {
    if (Option.isSome(maybePreview)) {
      actions.requestedSignedTransactionSubmission(maybePreview.value.previewId)
    }
  }

  const isBusy =
    model.transaction._tag === 'ValidatingTransfer' ||
    model.transaction._tag === 'PreviewingTransaction' ||
    model.transaction._tag === 'SubmittingTransaction'
  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.eyebrow}>Send</Text>
          <Text style={styles.sectionTitle}>{transferAmount}</Text>
        </View>
        <Text style={styles.status}>
          {transactionStatus(model.transaction)}
        </Text>
      </View>
      <SendNetworkPicker model={model} />
      <View style={styles.recipientField}>
        <Text style={styles.recipientLabel}>Recipient on {networkName}</Text>
        <TextInput
          accessibilityLabel={`Recipient on ${networkName}`}
          autoCapitalize="none"
          autoCorrect={false}
          editable={model.transaction._tag !== 'SubmittingTransaction'}
          onChangeText={actions.changedTransferRecipient}
          placeholder={exampleAddress}
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
          Preview a fixed test transfer before anything is signed.
        </Text>
      )}
      {model.transaction._tag === 'SubmittedTransaction' ? (
        <TransactionSubmissionConfirmation
          submission={model.transaction.submission}
        />
      ) : null}
      <WalletActionButton
        isDisabled={
          Option.isNone(maybeBalance) ||
          model.transferRecipient._tag === 'EmptyTransferRecipient' ||
          isBusy
        }
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

const Activity = ({ model }: Readonly<{ model: Model }>) => (
  <View style={styles.card}>
    <Text style={styles.eyebrow}>Recent activity</Text>
    {Array.match(model.transactions, {
      onEmpty: () => <Text style={styles.helpText}>Nothing sent yet.</Text>,
      onNonEmpty: transactions => (
        <View style={styles.list}>
          {Array.map(transactions, transaction => (
            <View key={transaction.transactionId} style={styles.activityRow}>
              <View>
                <Text style={styles.activityStatus}>{transaction.status}</Text>
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
  </View>
)

const AccountTools = ({ model }: Readonly<{ model: Model }>) => {
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
          <Text selectable style={styles.codeText}>
            {maybeReceiving.value.portableUri}
          </Text>
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
  networkSwitch: {
    backgroundColor: '#100d09',
    borderRadius: 13,
    flexDirection: 'row',
    padding: 4,
  },
  networkModeButton: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectedNetworkModeButton: { backgroundColor: '#f2b85f' },
  networkModeText: { color: '#d3a861', fontSize: 13, fontWeight: '900' },
  selectedNetworkModeText: {
    color: '#17130d',
    fontSize: 13,
    fontWeight: '900',
  },
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
    fontFamily: 'serif',
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
    textShadowColor: '#000000',
    textShadowOffset: { height: 2, width: 0 },
    textShadowRadius: 3,
    textTransform: 'uppercase',
  },
  title: {
    color: '#f7dca5',
    fontFamily: 'serif',
    fontSize: 52,
    fontWeight: '900',
    lineHeight: 56,
    textShadowColor: '#7b481e',
    textShadowOffset: { height: 4, width: 0 },
    textShadowRadius: 5,
  },
  balanceBlock: { gap: 5, marginTop: 50 },
  addressLine: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  receiveBlock: { gap: 8 },
  balance: {
    color: '#f7dca5',
    fontFamily: 'serif',
    fontSize: 64,
    fontWeight: '900',
    lineHeight: 70,
    textShadowColor: '#7b481e',
    textShadowOffset: { height: 4, width: 0 },
    textShadowRadius: 5,
  },
  sectionTitle: {
    color: '#f7dca5',
    fontFamily: 'serif',
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
  sendNetworks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sendNetwork: {
    backgroundColor: '#171109',
    borderColor: '#665237',
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    gap: 2,
    minWidth: 0,
    padding: 10,
  },
  selectedSendNetwork: {
    backgroundColor: '#f2b85f',
    borderColor: '#f2b85f',
  },
  selectedSendNetworkText: {
    color: '#17130d',
    fontSize: 13,
    fontWeight: '900',
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
