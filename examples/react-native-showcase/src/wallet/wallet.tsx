import { Array, Match as M, Option } from 'effect'
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
  type TransactionPreview,
  type TransactionState,
  type TransactionSubmission,
  currencyValueLabel,
  invalidNetworkAddressMessage,
  makeWalletTestChallenge,
  networkAddressRuleMessages,
  networkLabel,
  primaryReceivingInstruction,
  primaryWalletAccount,
  primaryWalletBalance,
  shortenedAddress,
  transferRecipientFormat,
  transferRecipientInput,
} from 'wallet-core-example'
import {
  type WalletInitialRoute,
  makeWalletReactClient,
} from 'wallet-react-bindings-example'
import {
  makeRemoteWalletResources,
  publicTestnetWalletEndpoint,
} from 'wallet-remote-example'

import { ReplayControls } from '../replayControls'

const { WalletProvider, useWalletActions, useWalletModel, useWalletReplay } =
  makeWalletReactClient(makeRemoteWalletResources(publicTestnetWalletEndpoint))

const maybePreviewForTransaction = (
  transaction: TransactionState,
): Option.Option<TransactionPreview> =>
  M.value(transaction).pipe(
    M.withReturnType<Option.Option<TransactionPreview>>(),
    M.tagsExhaustive({
      IdleTransaction: () => Option.none(),
      PreviewingTransaction: () => Option.none(),
      PreviewedTransaction: ({ preview }) => Option.some(preview),
      SubmittingTransaction: ({ preview }) => Option.some(preview),
      SubmittedTransaction: ({ preview }) => Option.some(preview),
      FailedTransactionPreview: () => Option.none(),
      FailedTransactionSubmission: ({ preview }) => Option.some(preview),
    }),
  )

const transactionStatus = (transaction: TransactionState): string =>
  M.value(transaction).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      IdleTransaction: () => 'Ready',
      PreviewingTransaction: () => 'Preparing preview…',
      PreviewedTransaction: () => 'Check before sending',
      SubmittingTransaction: () => 'Sending…',
      SubmittedTransaction: () => 'Sent',
      FailedTransactionPreview: () => 'Preview failed',
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
      <Text style={styles.mutedText}>
        Confirm it on {confirmation.explorer}.
      </Text>
      <Pressable
        accessibilityRole="link"
        onPress={() => void Linking.openURL(confirmation.transactionUri)}
      >
        <Text style={styles.confirmationLink}>
          View on {confirmation.explorer}
        </Text>
      </Pressable>
      <Text selectable style={styles.codeText}>
        {submission.transactionId}
      </Text>
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
      <WalletHero model={model} />
      <SendMoney model={model} />
      <Activity model={model} />
      <AccountTools model={model} />
      <ReplayControls label="Wallet replay" replay={replay} />
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
    onSome: balance => currencyValueLabel(balance.value),
  })
  const accountLabel = Option.match(maybeAccount, {
    onNone: () => 'Sepolia test wallet',
    onSome: account =>
      `${networkLabel(account.network)} · ${shortenedAddress(account.address)}`,
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
        <Text style={styles.mutedText}>{accountLabel}</Text>
      </View>
    </View>
  )
}

const SendMoney = ({ model }: Readonly<{ model: Model }>) => {
  const actions = useWalletActions()
  const maybeBalance = primaryWalletBalance(model)
  const maybePreview = maybePreviewForTransaction(model.transaction)
  const recipientFormat = transferRecipientFormat(model.transferRecipient)

  const submitPreview = (): void => {
    if (Option.isSome(maybePreview)) {
      actions.requestedSignedTransactionSubmission(maybePreview.value.previewId)
    }
  }

  const isBusy =
    model.transaction._tag === 'PreviewingTransaction' ||
    model.transaction._tag === 'SubmittingTransaction'
  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.eyebrow}>Send</Text>
          <Text style={styles.sectionTitle}>0.00001 ETH</Text>
        </View>
        <Text style={styles.status}>
          {transactionStatus(model.transaction)}
        </Text>
      </View>
      <View style={styles.recipientField}>
        <Text style={styles.recipientLabel}>
          Recipient on {recipientFormat.networkName}
        </Text>
        <TextInput
          accessibilityLabel={`Recipient on ${recipientFormat.networkName}`}
          autoCapitalize="none"
          autoCorrect={false}
          editable={model.transaction._tag !== 'SubmittingTransaction'}
          onChangeText={actions.changedTransferRecipient}
          placeholder={recipientFormat.exampleAddress}
          placeholderTextColor="#9f8560"
          style={styles.recipientInput}
          value={transferRecipientInput(model.transferRecipient)}
        />
        {model.transferRecipient._tag === 'InvalidTransferRecipient' ? (
          <View accessibilityRole="alert" style={styles.validationBlock}>
            <Text style={styles.validationText}>
              {invalidNetworkAddressMessage(model.transferRecipient.validation)}
            </Text>
            {Array.map(
              networkAddressRuleMessages(
                model.transferRecipient.validation.format,
              ),
              rule => (
                <Text key={rule} style={styles.validationText}>
                  • {rule}
                </Text>
              ),
            )}
          </View>
        ) : null}
      </View>
      {Option.isSome(maybePreview) ? (
        <View style={styles.preview}>
          <PreviewRow
            label="To"
            value={shortenedAddress(
              maybePreview.value.draft.destinationAddress,
            )}
          />
          <PreviewRow
            label="Network fee"
            value={currencyValueLabel(maybePreview.value.estimatedFee)}
          />
          <PreviewRow
            label="Balance after"
            value={currencyValueLabel(maybePreview.value.resultingBalance)}
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
          model.transferRecipient._tag !== 'ValidTransferRecipient' ||
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
  label,
  value,
}: Readonly<{ label: string; value: string }>) => (
  <View style={styles.previewRow}>
    <Text style={styles.mutedText}>{label}</Text>
    <Text style={styles.previewValue}>{value}</Text>
  </View>
)

const Activity = ({ model }: Readonly<{ model: Model }>) => (
  <View style={styles.card}>
    <Text style={styles.eyebrow}>Recent activity</Text>
    {Array.match(model.observedTransactions, {
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
                {currencyValueLabel(transaction.value)}
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
        <Text selectable style={styles.codeText}>
          {maybeAccount.value.address}
        </Text>
      ) : (
        <Text style={styles.mutedText}>Account data is not loaded.</Text>
      )}
      {Option.isSome(maybeReceiving) ? (
        <Text selectable style={styles.codeText}>
          Receive: {maybeReceiving.value.portableUri}
        </Text>
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
})
