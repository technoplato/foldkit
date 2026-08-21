import { Schema as S } from 'effect'
import {
  AdapterTestFundingMethod,
  AtomicUnits,
  NetworkDescriptor,
  PortfolioSnapshot,
  type TransactionRecord,
  WalletProfile,
} from 'wallet-core-example'

import { ClipPlayback } from './clip.js'

export {
  ClipConversation,
  ClipLine,
  ClipPlayback,
  ClipSpeaker,
  CompleteClipPlayback,
  IdleClipPlayback,
  PlayingClipPlayback,
  clipCompleteMs,
  clipConversation,
  clipHoldMs,
  isClipComplete,
  playbackAtElapsed,
  revealedCountAt,
  revealedLines,
} from './clip.js'

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
/** Listed play price shown on the machine face. */
export const listPriceDisplay = '14.28'
/** Devnet settlement threshold so a 0.001 SOL test can vend. */
export const settleLamports = 1_000_000n
/** Lamports in one SOL. */
export const lamportsPerSol = 1_000_000_000n
/** Decimal SOL shown for the Devnet settle, matching Solana Pay `amount`. */
export const settleSolDisplay = `${Number(settleLamports) / Number(lamportsPerSol)}`
/** Maximum keypad digits retained before Enter. */
export const maximumKeypadLength = 8

/** A single keypad digit. */
export const Digit = S.Literals([
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
])
/** A single keypad digit. */
export type Digit = typeof Digit.Type

/** Digits currently shown on the machine display. */
export const KeypadBuffer = S.String.check(
  S.isLengthBetween(0, maximumKeypadLength),
)
/** Digits currently shown on the machine display. */
export type KeypadBuffer = typeof KeypadBuffer.Type

/** No keypad control has been pressed yet. */
export const IdleControl = S.TaggedStruct('Idle', {})
/** The last press was a digit. */
export const DigitControl = S.TaggedStruct('Digit', { digit: Digit })
/** The last press was Enter. */
export const EnterControl = S.TaggedStruct('Enter', {})
/** The last press was Clear. */
export const ClearControl = S.TaggedStruct('Clear', {})
/** Last keypad control. Hosts light this key. */
export const LastControl = S.Union([
  IdleControl,
  DigitControl,
  EnterControl,
  ClearControl,
])
/** Last keypad control. */
export type LastControl = typeof LastControl.Type

/** Key legend the 3JS host lights from lastControl. */
export const lastControlLabel = (control: LastControl): string | undefined => {
  if (control._tag === 'Digit') {
    return control.digit
  }
  if (control._tag === 'Enter') {
    return 'ENT'
  }
  if (control._tag === 'Clear') {
    return 'CLR'
  }
  return undefined
}

/** One vendible catalog row. */
export const Sku = S.Struct({
  code: S.String,
  name: S.String,
  priceAtomic: AtomicUnits,
  assetId: S.String,
  slot: S.String,
})
/** One vendible catalog row. */
export type Sku = typeof Sku.Type

/** Bounded catalog of SKUs. */
export const Catalog = S.Array(Sku)
/** Bounded catalog of SKUs. */
export type Catalog = typeof Catalog.Type

/** Seeded clip SKU. Listed $14.28 / 14.28 play; Devnet settle is 0.001 SOL. */
export const clipSku: Sku = Sku.make({
  code: '1428',
  name: 'the clip',
  priceAtomic: '1000000',
  assetId: defaultAssetId,
  slot: 'A1',
})

/** Default catalog seeded with the clip. */
export const defaultCatalog: Catalog = [clipSku]

/** No code has been entered. */
export const IdleSelection = S.TaggedStruct('Idle', {})
/** Digits are on the display but not locked. */
export const DialedSelection = S.TaggedStruct('Dialed', { code: S.String })
/** A SKU is locked to a receive address. */
export const LockedSelection = S.TaggedStruct('Locked', {
  sku: Sku,
  address: S.String,
})
/** Finite keypad selection. */
export const Selection = S.Union([
  IdleSelection,
  DialedSelection,
  LockedSelection,
])
/** Finite keypad selection. */
export type Selection = typeof Selection.Type

/** No vend is in flight. */
export const IdleVend = S.TaggedStruct('Idle', {})
/** Waiting for SOL Devnet settlement at or above the threshold. */
export const AwaitingPayment = S.TaggedStruct('AwaitingPayment', {})
/** Payment was observed and is being applied. */
export const ReceivedVend = S.TaggedStruct('Received', {})
/** The machine is dispensing. */
export const VendingVend = S.TaggedStruct('Vending', {})
/** The SKU has been dispensed. */
export const DispensedVend = S.TaggedStruct('Dispensed', {})
/** The host timed out while awaiting payment. */
export const TimedOutVend = S.TaggedStruct('TimedOut', {})
/** Enter was pressed with a code that is not in the catalog. */
export const WrongCodeVend = S.TaggedStruct('WrongCode', {})
/** Finite vend lifecycle. Host animation reads this; it is not 3JS. */
export const VendPhase = S.Union([
  IdleVend,
  AwaitingPayment,
  ReceivedVend,
  VendingVend,
  DispensedVend,
  TimedOutVend,
  WrongCodeVend,
])
/** Finite vend lifecycle. */
export type VendPhase = typeof VendPhase.Type

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
/** Finite wallet lifecycle for the vending machine. */
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

/** Host button label for copying the SOL Devnet receive address. */
export const copyAddressLabel = (clipboard: ClipboardState): string => {
  if (clipboard._tag === 'copied') {
    return 'Copied'
  }
  if (clipboard._tag === 'failed') {
    return 'Try copy again'
  }
  return 'Copy Solana Pay'
}

/** The Vending Program Model. FoldKit core owns vend rules. */
export const Model = S.Struct({
  catalog: Catalog,
  keypadBuffer: KeypadBuffer,
  lastControl: LastControl,
  selection: Selection,
  vendPhase: VendPhase,
  listPriceDisplay: S.String,
  settleLamports: S.BigInt,
  wallet: WalletPhase,
  incoming: S.Array(IncomingSol),
  funding: FundingState,
  clipboard: ClipboardState,
  clipPlayback: ClipPlayback,
})
/** A Vending Model value. */
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

/** Looks up a catalog SKU by keypad code. */
export const skuForCode = (catalog: Catalog, code: string): Sku | undefined =>
  catalog.find(sku => sku.code === code)

/** True when confirmed lamports meet the Devnet settle threshold. */
export const meetsSettleThreshold = (
  lamports: AtomicUnits,
  threshold: bigint,
): boolean => BigInt(lamports) >= threshold

/** Maps a wallet Incoming SOL record onto the vending Incoming ADT. */
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

/** Locked receive address when a SKU is awaiting payment. */
export const lockedReceiveAddress = (model: Model): string | undefined => {
  if (model.selection._tag !== 'Locked') {
    return undefined
  }
  return model.selection.address
}
