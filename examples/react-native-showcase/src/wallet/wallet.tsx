import { Array, Match as M, Option } from 'effect'
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  CurrencyValue,
  DomainSeparatedDigest,
  type Model,
  SigningChallenge,
  type TransactionPreview,
  type TransactionState,
} from 'wallet-core-example'
import {
  type WalletInitialRoute,
  WalletProvider,
  WalletTransferComposition,
  useWalletActions,
  useWalletModel,
  useWalletReplay,
} from 'wallet-react-bindings-example'

import { ReplayControls } from '../replayControls'

const presetTransferAtomicUnits = '100000000000000000'
const presetDestinationAddress = '0x2222222222222222222222222222222222222222'

const valueLabel = (value: CurrencyValue): string =>
  `${value.atomicUnits} ${value.currency._tag} atomic units · ${value.decimalPlaces.toString()} decimals`

const previewForTransaction = (
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

/** Runs the shared Wallet React bindings through one React Native presenter. */
export const WalletExample = ({
  route,
}: Readonly<{ route: WalletInitialRoute }>) => (
  <WalletProvider initialRoute={route} fallback={<StartingWallet />}>
    <WalletScreen />
  </WalletProvider>
)

const StartingWallet = () => (
  <View style={styles.statusCard}>
    <Text style={styles.mutedText}>Starting simulated Wallet Layers…</Text>
  </View>
)

const WalletScreen = () => {
  const model = useWalletModel()
  const replay = useWalletReplay()

  return (
    <View style={styles.wallet}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Shared public Model · React Native</Text>
        <Text style={styles.title}>Portable Wallet</Text>
        <Text style={styles.heroBody}>
          The same Wallet Program, domain hooks, and simulated Effect Layers run
          on Expo Web, iOS, and Android.
        </Text>
      </View>
      <Portfolio model={model} />
      <Transaction model={model} />
      <Signature model={model} />
      <Activity model={model} />
      <ReplayControls label="Wallet replay" replay={replay} />
    </View>
  )
}

const Portfolio = ({ model }: Readonly<{ model: Model }>) => {
  const actions = useWalletActions()

  return (
    <View style={styles.card}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeadingCopy}>
          <Text style={styles.sectionLabel}>Portfolio</Text>
          <Text style={styles.sectionTitle}>{model.portfolio._tag}</Text>
        </View>
        <WalletActionButton
          label="Refresh"
          onPress={actions.requestedWalletRefresh}
        />
      </View>
      {M.value(model.portfolio).pipe(
        M.withReturnType<ReactNode>(),
        M.tagsExhaustive({
          LoadingPortfolio: () => (
            <Text style={styles.mutedText}>Loading public accounts…</Text>
          ),
          FailedPortfolio: ({ failure }) => (
            <Text style={styles.failureText}>
              {failure.operation} failed with {failure.code}.
            </Text>
          ),
          LoadedPortfolio: ({ snapshot }) => (
            <View style={styles.cardList}>
              {Array.map(snapshot.accounts, account => {
                const balances = Array.filter(
                  snapshot.balanceSnapshot.balances,
                  balance => balance.accountId === account.accountId,
                )
                const receivingInstructions = Array.filter(
                  snapshot.receivingInstructions,
                  instruction => instruction.accountId === account.accountId,
                )
                return (
                  <View key={account.accountId} style={styles.accountCard}>
                    <Text style={styles.accountNetwork}>
                      {account.network._tag}
                    </Text>
                    <Text style={styles.accountName}>
                      {account.displayName}
                    </Text>
                    <Text selectable style={styles.monospaceText}>
                      {account.address}
                    </Text>
                    <View style={styles.compactList}>
                      {Array.map(balances, balance => (
                        <Text
                          key={`${balance.accountId}:${balance.value.currency._tag}`}
                          style={styles.balanceText}
                        >
                          {valueLabel(balance.value)}
                        </Text>
                      ))}
                    </View>
                    <View style={styles.compactList}>
                      {Array.map(receivingInstructions, instruction => (
                        <View
                          key={`${instruction.accountId}:${instruction.currency._tag}`}
                          style={styles.receiveCard}
                        >
                          <Text style={styles.receiveTitle}>
                            Receive {instruction.currency._tag}
                          </Text>
                          <Text selectable style={styles.receivePayload}>
                            {instruction.portableUri}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )
              })}
            </View>
          ),
        }),
      )}
    </View>
  )
}

const Transaction = ({ model }: Readonly<{ model: Model }>) => {
  const actions = useWalletActions()
  const maybeAccount =
    model.portfolio._tag === 'LoadedPortfolio'
      ? Array.findFirst(
          model.portfolio.snapshot.accounts,
          account => account.network._tag === 'EthereumSepolia',
        )
      : Option.none()
  const maybeBalance = Option.flatMap(maybeAccount, account =>
    model.portfolio._tag === 'LoadedPortfolio'
      ? Array.findFirst(
          model.portfolio.snapshot.balanceSnapshot.balances,
          balance =>
            balance.accountId === account.accountId &&
            balance.value.currency._tag === 'Eth',
        )
      : Option.none(),
  )
  const maybePreview = previewForTransaction(model.transaction)

  const composeTransfer = (): void => {
    if (Option.isSome(maybeAccount) && Option.isSome(maybeBalance)) {
      const balance = maybeBalance.value
      actions.composedTransfer(
        WalletTransferComposition.make({
          transferId: 'expo-wallet-transfer',
          accountId: maybeAccount.value.accountId,
          network: maybeAccount.value.network,
          destinationAddress: presetDestinationAddress,
          value: CurrencyValue.make({
            currency: balance.value.currency,
            atomicUnits: presetTransferAtomicUnits,
            decimalPlaces: balance.value.decimalPlaces,
            observedAt: balance.value.observedAt,
          }),
          message: 'Shared Expo Wallet transfer',
        }),
      )
    }
  }

  const submitPreview = (): void => {
    if (Option.isSome(maybePreview)) {
      actions.requestedSignedTransactionSubmission(maybePreview.value.previewId)
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.sectionHeadingCopy}>
        <Text style={styles.sectionLabel}>Transaction</Text>
        <Text style={styles.sectionTitle}>{model.transaction._tag}</Text>
      </View>
      <View style={styles.buttonRow}>
        <WalletActionButton
          isDisabled={Option.isNone(maybeBalance)}
          label="Compose preset"
          onPress={composeTransfer}
        />
        <WalletActionButton
          isDisabled={model.transaction._tag !== 'PreviewedTransaction'}
          isPrimary
          label="Sign and submit"
          onPress={submitPreview}
        />
      </View>
      {Option.isSome(maybePreview) ? (
        <View style={styles.previewCard}>
          <Text selectable style={styles.previewDestination}>
            {maybePreview.value.draft.destinationAddress}
          </Text>
          <Text style={styles.previewText}>
            Transfer: {valueLabel(maybePreview.value.draft.value)}
          </Text>
          <Text style={styles.previewText}>
            Fee: {valueLabel(maybePreview.value.estimatedFee)}
          </Text>
          <Text style={styles.previewText}>
            Result: {valueLabel(maybePreview.value.resultingBalance)}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

const Signature = ({ model }: Readonly<{ model: Model }>) => {
  const actions = useWalletActions()
  const maybeAccount =
    model.portfolio._tag === 'LoadedPortfolio'
      ? Array.findFirst(
          model.portfolio.snapshot.accounts,
          account => account.network._tag === 'EthereumSepolia',
        )
      : Option.none()

  const signChallenge = (): void => {
    if (Option.isSome(maybeAccount)) {
      actions.requestedChallengeSignature(
        SigningChallenge.make({
          challengeId: 'expo-wallet-challenge',
          accountId: maybeAccount.value.accountId,
          digest: DomainSeparatedDigest.make({
            algorithm: 'Keccak256',
            domain: 'foldkit.example.wallet',
            digestHex: '0x666f6c646b6974',
          }),
        }),
      )
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeadingCopy}>
          <Text style={styles.sectionLabel}>Challenge signing</Text>
          <Text style={styles.sectionTitle}>{model.signature._tag}</Text>
        </View>
        <WalletActionButton
          isDisabled={Option.isNone(maybeAccount)}
          label="Sign challenge"
          onPress={signChallenge}
        />
      </View>
      {model.signature._tag === 'SignedChallenge' ? (
        <Text selectable style={styles.successText}>
          Verified {model.signature.proof._tag} for{' '}
          {model.signature.proof.challengeId}
        </Text>
      ) : null}
    </View>
  )
}

const Activity = ({ model }: Readonly<{ model: Model }>) => (
  <View style={styles.card}>
    <View style={styles.sectionHeadingCopy}>
      <Text style={styles.sectionLabel}>Observed transaction stream</Text>
      <Text style={styles.sectionTitle}>
        {model.transactionObservation._tag}
      </Text>
    </View>
    {Array.match(model.observedTransactions, {
      onEmpty: () => (
        <Text style={styles.mutedText}>
          Submit the preset transfer to emit a simulated observation.
        </Text>
      ),
      onNonEmpty: transactions => (
        <View style={styles.compactList}>
          {Array.map(transactions, transaction => (
            <View key={transaction.transactionId} style={styles.activityCard}>
              <Text selectable style={styles.monospaceText}>
                {transaction.transactionId}
              </Text>
              <Text style={styles.activityText}>
                {transaction.direction} · {transaction.status} ·{' '}
                {valueLabel(transaction.value)}
              </Text>
            </View>
          ))}
        </View>
      ),
    })}
  </View>
)

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
  wallet: { gap: 18 },
  hero: {
    backgroundColor: '#083344',
    borderColor: '#155e75',
    borderRadius: 24,
    borderWidth: 1,
    gap: 8,
    padding: 24,
  },
  eyebrow: {
    color: '#67e8f9',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  title: { color: '#ecfeff', fontSize: 34, fontWeight: '800' },
  heroBody: { color: '#a5f3fc', fontSize: 14, lineHeight: 21 },
  card: {
    backgroundColor: '#18181b',
    borderColor: '#3f3f46',
    borderRadius: 18,
    borderWidth: 1,
    gap: 16,
    padding: 18,
  },
  statusCard: {
    alignItems: 'center',
    backgroundColor: '#18181b',
    borderRadius: 18,
    padding: 24,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  sectionHeadingCopy: { flex: 1, gap: 4, minWidth: 0 },
  sectionLabel: {
    color: '#22d3ee',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  sectionTitle: { color: '#fafafa', fontSize: 21, fontWeight: '700' },
  mutedText: { color: '#a1a1aa', fontSize: 13, lineHeight: 19 },
  failureText: { color: '#fda4af', fontSize: 13, lineHeight: 19 },
  cardList: { gap: 12 },
  compactList: { gap: 8 },
  accountCard: {
    backgroundColor: '#27272a',
    borderRadius: 14,
    gap: 8,
    padding: 15,
  },
  accountNetwork: {
    color: '#67e8f9',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  accountName: { color: '#fafafa', fontSize: 18, fontWeight: '700' },
  monospaceText: {
    color: '#a1a1aa',
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 17,
  },
  balanceText: {
    backgroundColor: '#18181b',
    borderRadius: 9,
    color: '#d4d4d8',
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 17,
    padding: 10,
  },
  receiveCard: {
    backgroundColor: '#164e63',
    borderRadius: 10,
    gap: 4,
    padding: 10,
  },
  receiveTitle: { color: '#cffafe', fontSize: 12, fontWeight: '700' },
  receivePayload: {
    color: '#a5f3fc',
    fontFamily: 'monospace',
    fontSize: 11,
  },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  primaryButton: {
    backgroundColor: '#22d3ee',
    borderRadius: 11,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  secondaryButton: {
    backgroundColor: '#3f3f46',
    borderRadius: 11,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  disabledButton: { opacity: 0.4 },
  primaryButtonText: { color: '#083344', fontSize: 13, fontWeight: '800' },
  secondaryButtonText: { color: '#fafafa', fontSize: 13, fontWeight: '700' },
  previewCard: {
    backgroundColor: '#09090b',
    borderRadius: 13,
    gap: 8,
    padding: 14,
  },
  previewDestination: {
    color: '#67e8f9',
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 17,
  },
  previewText: { color: '#d4d4d8', fontSize: 12, lineHeight: 18 },
  successText: {
    backgroundColor: '#052e16',
    borderRadius: 12,
    color: '#86efac',
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 17,
    padding: 13,
  },
  activityCard: {
    backgroundColor: '#27272a',
    borderRadius: 12,
    gap: 7,
    padding: 13,
  },
  activityText: { color: '#d4d4d8', fontSize: 12, lineHeight: 18 },
})
