import { Schema as S } from 'effect'
import {
  AdapterTestFundingMethod,
  AtomicUnits,
  NetworkDescriptor,
  PortfolioSnapshot,
  type TransactionRecord,
  WalletProfile,
} from 'wallet-core-example'

/** Wallet catalog chain id for Solana. */
export const defaultChainId = 'solana'
/** Wallet catalog network id for Solana Devnet. */
export const defaultNetworkId = 'solana:devnet'
/** Wallet catalog asset id for native SOL on Devnet. */
export const defaultAssetId = 'solana:devnet:sol'
/** Wallet UI network mode for Devnet rails. */
export const defaultWalletNetworkMode = 'Devnet' as const
/** Tiny Devnet airdrop in lamports (0.01 SOL). */
export const tinyAirdropLamports = '10000000'

/** A blockchain family in the Deposit ADT. */
export const Chain = S.Literals(['sol', 'sui', 'eth', 'btc'])
/** A blockchain family in the Deposit ADT. */
export type Chain = typeof Chain.Type

/** A network environment in the Deposit ADT. */
export const Network = S.Literals(['devnet', 'testnet', 'mainnet'])
/** A network environment in the Deposit ADT. */
export type Network = typeof Network.Type

/** ISO-4217 currencies accepted as fiat ADT members. */
export const IsoCurrency = S.Literals(['USD', 'EUR', 'GBP'])
/** ISO-4217 currencies accepted as fiat ADT members. */
export type IsoCurrency = typeof IsoCurrency.Type

/** Fiat rails named in the Deposit ADT. */
export const FiatMethod = S.Literals([
  'stripe',
  'venmo',
  'ach',
  'card',
  'wire',
])
/** Fiat rails named in the Deposit ADT. */
export type FiatMethod = typeof FiatMethod.Type

/** Exact integer minor units (cents). */
export const MinorUnits = S.TemplateLiteral([S.BigInt])
/** Exact integer minor units (cents). */
export type MinorUnits = typeof MinorUnits.Type

/** A settled or requested crypto deposit. */
export const CryptoDeposit = S.TaggedStruct('crypto', {
  chain: Chain,
  network: Network,
  amount: AtomicUnits,
  asset: S.String,
})
/** A settled or requested crypto deposit. */
export type CryptoDeposit = typeof CryptoDeposit.Type

/** A settled or requested fiat deposit. */
export const FiatDeposit = S.TaggedStruct('fiat', {
  currency: IsoCurrency,
  amount: MinorUnits,
  method: FiatMethod,
})
/** A settled or requested fiat deposit. */
export type FiatDeposit = typeof FiatDeposit.Type

/** Fully normalized Deposit ADT. */
export const Deposit = S.Union([CryptoDeposit, FiatDeposit])
/** A Deposit value. */
export type Deposit = typeof Deposit.Type

/** Tags that exist on Deposit. */
export const DEPOSIT_TAGS: ReadonlyArray<Deposit['_tag']> = ['crypto', 'fiat']

/** The only live crypto rail in v1. */
export const SolDevnetRail = S.TaggedStruct('sol-devnet', {})
/** A crypto rail that exists in the ADT but has no live effect. */
export const UnsupportedRail = S.TaggedStruct('unsupported', {
  chain: Chain,
  network: Network,
})
/** Crypto rails. Unsupported members have no live command. */
export const CryptoRail = S.Union([SolDevnetRail, UnsupportedRail])
/** A crypto rail value. */
export type CryptoRail = typeof CryptoRail.Type

/** Fiat is not wired. */
export const AbsentFiatRail = S.TaggedStruct('absent', {})
/** Stripe is named in FiatMethod but not configured. */
export const StripeUnconfiguredFiatRail = S.TaggedStruct(
  'stripe-unconfigured',
  {},
)
/** Fiat rails. There is no configured or live-charge member. */
export const FiatRail = S.Union([AbsentFiatRail, StripeUnconfiguredFiatRail])
/** A fiat rail value. */
export type FiatRail = typeof FiatRail.Type

/** Tags that exist on FiatRail. `stripe-configured` is intentionally absent. */
export const FIAT_RAIL_TAGS: ReadonlyArray<FiatRail['_tag']> = [
  'absent',
  'stripe-unconfigured',
]

/** Type-level proof that a live Stripe charge rail cannot be constructed. */
export type LiveStripeChargeIsRepresentable = Extract<
  FiatRail,
  { readonly _tag: 'stripe-configured' }
> extends never
  ? false
  : true

/** Runtime proof that a live Stripe charge rail cannot be constructed. */
export const liveStripeChargeIsRepresentable: LiveStripeChargeIsRepresentable =
  false

/** Publish a public catalog entry. No money movement. */
export const CatalogPublish = S.TaggedStruct('catalog-publish', {})
/** Submit a public leaderboard row. No money movement. */
export const LeaderboardSubmit = S.TaggedStruct('leaderboard-submit', {})
/** Claim a public clip. No money movement. */
export const ClipClaim = S.TaggedStruct('clip-claim', {})
/** File a public ideas note. No money movement. */
export const IdeasNote = S.TaggedStruct('ideas-note', {})
/** Unlock books listening. No money movement. */
export const BooksListen = S.TaggedStruct('books-listen', {})
/** Unlock a transcribe session. No money movement. */
export const TranscribeSession = S.TaggedStruct('transcribe-session', {})
/** Capabilities unlocked by a settled Deposit. */
export const Capability = S.Union([
  CatalogPublish,
  LeaderboardSubmit,
  ClipClaim,
  IdeasNote,
  BooksListen,
  TranscribeSession,
])
/** A capability value. */
export type Capability = typeof Capability.Type

/** Tags that exist on Capability. */
export const CAPABILITY_TAGS: ReadonlyArray<Capability['_tag']> = [
  'catalog-publish',
  'leaderboard-submit',
  'clip-claim',
  'ideas-note',
  'books-listen',
  'transcribe-session',
]

/** Stable sender identity. */
export const SenderId = S.String.pipe(S.brand('SenderId'))
/** Stable sender identity. */
export type SenderId = typeof SenderId.Type

/** The sending party, deposits, and unlocked capabilities. */
export const Sender = S.Struct({
  id: SenderId,
  deposits: S.Array(Deposit),
  unlocked: S.Array(Capability),
})
/** A sender value. */
export type Sender = typeof Sender.Type

/** Successful update. */
export const OkEffect = S.TaggedStruct('ok', { line: S.String })
/** Refusal. Danger is data. There is no live Stripe charge effect. */
export const RefuseEffect = S.TaggedStruct('refuse', { why: S.String })
/** Outcome of one update. */
export const Outcome = S.Union([OkEffect, RefuseEffect])
/** An outcome value. */
export type Outcome = typeof Outcome.Type

/** Restoring public wallet profiles. */
export const LoadingProfiles = S.TaggedStruct('loading-profiles', {})
/** Creating a Devnet SOL receive wallet. */
export const CreatingWallet = S.TaggedStruct('creating-wallet', {})
/** Loading a public portfolio snapshot. */
export const LoadingPortfolio = S.TaggedStruct('loading-portfolio', {
  wallets: S.Array(WalletProfile),
})
/** SOL Devnet receive is ready. */
export const ReadyReceive = S.TaggedStruct('ready', {
  wallets: S.Array(WalletProfile),
  portfolio: PortfolioSnapshot,
  accountId: S.String,
  address: S.String,
})
/** Wallet restore or create failed. */
export const FailedWallet = S.TaggedStruct('failed', { code: S.String })
/** Finite wallet lifecycle for the deposit page. */
export const WalletPhase = S.Union([
  LoadingProfiles,
  CreatingWallet,
  LoadingPortfolio,
  ReadyReceive,
  FailedWallet,
])
/** A wallet phase value. */
export type WalletPhase = typeof WalletPhase.Type

/** One observed incoming SOL transfer. */
export const IncomingSol = S.Struct({
  transactionId: S.String,
  lamports: AtomicUnits,
  observedAt: S.Number,
  status: S.Literals(['Pending', 'Confirmed', 'Failed']),
})
/** An incoming SOL value. */
export type IncomingSol = typeof IncomingSol.Type

/** No test-funding request is in flight. */
export const IdleFunding = S.TaggedStruct('idle', {})
/** A Devnet airdrop is in flight. */
export const RequestingFunding = S.TaggedStruct('requesting', {
  requestId: S.String,
})
/** A Devnet airdrop was accepted. */
export const ReceivedFunding = S.TaggedStruct('received', {
  requestId: S.String,
  fundingId: S.String,
  lamports: AtomicUnits,
})
/** A Devnet airdrop failed. */
export const FailedFunding = S.TaggedStruct('failed', {
  requestId: S.String,
  code: S.String,
})
/** Finite test-funding lifecycle. */
export const FundingState = S.Union([
  IdleFunding,
  RequestingFunding,
  ReceivedFunding,
  FailedFunding,
])
/** A funding state value. */
export type FundingState = typeof FundingState.Type

/** Idle clipboard. */
export const IdleClipboard = S.TaggedStruct('idle', {})
/** Copied a public receive address. */
export const CopiedAddress = S.TaggedStruct('copied', { address: S.String })
/** Clipboard write failed. */
export const FailedClipboard = S.TaggedStruct('failed', { code: S.String })
/** Clipboard lifecycle. */
export const ClipboardState = S.Union([
  IdleClipboard,
  CopiedAddress,
  FailedClipboard,
])
/** A clipboard state value. */
export type ClipboardState = typeof ClipboardState.Type

/** The Deposit Program Model. */
export const Model = S.Struct({
  sender: Sender,
  selectedChain: Chain,
  selectedNetwork: Network,
  selectedFiatMethod: FiatMethod,
  wallet: WalletPhase,
  incoming: S.Array(IncomingSol),
  funding: FundingState,
  clipboard: ClipboardState,
  lastOutcome: S.Option(Outcome),
})
/** A Deposit Model value. */
export type Model = typeof Model.Type

/** Solana Devnet network descriptor composed from wallet-core types. */
export const solanaDevnetNetwork = NetworkDescriptor.make({
  chainId: defaultChainId,
  networkId: defaultNetworkId,
  displayName: 'Solana Devnet',
  environment: 'Development',
  capabilities: [
    'Transfer',
    'TestFunding',
    'TransactionHistory',
    'TransactionObservation',
    'ChallengeSignature',
  ],
  testFundingMethod: AdapterTestFundingMethod.make({}),
})

/** Selects the crypto rail for one ADT chain and network. */
export const selectCryptoRail = (
  chain: Chain,
  network: Network,
): CryptoRail =>
  chain === 'sol' && network === 'devnet'
    ? SolDevnetRail.make({})
    : UnsupportedRail.make({ chain, network })

/** v1 fiat rail. Stripe is unconfigured; there is no live-charge member. */
export const currentFiatRail = (): FiatRail =>
  StripeUnconfiguredFiatRail.make({})

const allCapabilities = (): ReadonlyArray<Capability> => [
  CatalogPublish.make({}),
  LeaderboardSubmit.make({}),
  ClipClaim.make({}),
  IdeasNote.make({}),
  BooksListen.make({}),
  TranscribeSession.make({}),
]

/** Capabilities unlocked by settled deposits. SOL Devnet unlocks every v1 capability. */
export const capabilitiesUnlockedBy = (
  deposits: ReadonlyArray<Deposit>,
): ReadonlyArray<Capability> => {
  const hasSettledSolDevnet = deposits.some(
    deposit =>
      deposit._tag === 'crypto' &&
      deposit.chain === 'sol' &&
      deposit.network === 'devnet',
  )
  return hasSettledSolDevnet ? allCapabilities() : []
}

/** Local sender used by every client of this example. */
export const localSenderId: SenderId = SenderId.make('sender-local')

/** Maps a wallet Incoming SOL record onto the deposit Incoming ADT. */
export const incomingFromRecord = (
  record: TransactionRecord,
): IncomingSol | undefined => {
  if (
    record.direction !== 'Incoming' ||
    record.networkId !== defaultNetworkId ||
    record.amount.assetId !== defaultAssetId
  ) {
    return undefined
  }
  return IncomingSol.make({
    transactionId: record.transactionId,
    lamports: record.amount.atomicUnits,
    observedAt: record.observedAt,
    status: record.status,
  })
}

/** Deposit produced when one incoming SOL observation settles. */
export const depositFromIncoming = (incoming: IncomingSol): CryptoDeposit =>
  CryptoDeposit.make({
    chain: 'sol',
    network: 'devnet',
    amount: incoming.lamports,
    asset: defaultAssetId,
  })

/** Public SOL Devnet receive facts projected from a wallet portfolio. */
export const solDevnetReceive = (
  portfolio: PortfolioSnapshot,
): { readonly accountId: string; readonly address: string } | undefined => {
  const instruction = portfolio.receivingInstructions.find(
    item => item.assetId === defaultAssetId,
  )
  if (instruction === undefined) {
    return undefined
  }
  return {
    accountId: instruction.accountId,
    address: instruction.destinationAddress,
  }
}
