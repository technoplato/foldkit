import { Schema as S } from 'effect'
import { ts } from 'foldkit/schema'
import { AtomicUnits } from 'wallet-core-example'

import { MarkdownDocument } from '@foldkit/markdown'

// PAGE

/** A section's stable name, and its anchor: `the-riddle`. */
export const SectionKey = S.String.check(
  S.isPattern(/^[a-z0-9][a-z0-9-]{0,63}$/),
).pipe(S.brand('SectionKey'))
/** A section's stable name, and its anchor. */
export type SectionKey = typeof SectionKey.Type

/** Where a wide screen puts a section. A phone stacks Top, Side, then Main. */
export const SectionColumn = S.Literals(['Top', 'Main', 'Side'])
/** Where a wide screen puts a section. */
export type SectionColumn = typeof SectionColumn.Type

/** A link with its QR code as one SVG path, drawn on a `qrSize` square. */
export const QrLink = S.Struct({
  label: S.String,
  url: S.String,
  qrPath: S.String,
  qrSize: S.Number,
})
/** A link with its QR code. */
export type QrLink = typeof QrLink.Type

const sectionFields = {
  key: SectionKey,
  title: S.String,
  column: SectionColumn,
}

/** Words the origin parsed from Markdown. */
export const MarkdownSection = ts('MarkdownSection', {
  ...sectionFields,
  document: MarkdownDocument,
})
/** Words with QR codes under them. */
export const QrLinksSection = ts('QrLinksSection', {
  ...sectionFields,
  document: MarkdownDocument,
  links: S.Array(QrLink),
})
/** The live scoreboard, painted from the log. */
export const ScoreboardSection = ts('ScoreboardSection', sectionFields)
/** College football, painted from the origin's shared cache. */
export const FootballSection = ts('FootballSection', sectionFields)
/** The read-only wallet mirror. */
export const WalletsSection = ts('WalletsSection', sectionFields)
/**
 * This person's own wallet: Foldkit's example wallet, with its keys made
 * and kept on this device.
 */
export const PersonalWalletSection = ts('PersonalWalletSection', sectionFields)

/** One section the origin decided this person may see. */
export const Section = S.Union([
  MarkdownSection,
  QrLinksSection,
  ScoreboardSection,
  FootballSection,
  WalletsSection,
  PersonalWalletSection,
])
/** One section the origin decided this person may see. */
export type Section = typeof Section.Type

/** Only what this signed-in person's flags allow: `GET /api/page`. */
export const Page = S.Struct({
  displayName: S.String,
  sections: S.Array(Section),
})
/** Only what this signed-in person's flags allow. */
export type Page = typeof Page.Type

// FOOTBALL

/** Where a game stands. */
export const GameState = S.Literals(['Scheduled', 'Live', 'Final'])
/** Where a game stands. */
export type GameState = typeof GameState.Type

/** One side of a game. */
export const GameTeam = S.Struct({
  name: S.String,
  score: S.String,
  maybeRank: S.OptionFromOptionalKey(S.Int),
})
/** One side of a game. */
export type GameTeam = typeof GameTeam.Type

/** One game: `GET /api/football`. */
export const Game = S.Struct({
  id: S.String,
  state: GameState,
  detail: S.String,
  teams: S.Array(GameTeam),
})
/** One game. */
export type Game = typeof Game.Type

/** The games, most interesting first. */
export const Games = S.Array(Game)

// WALLETS

/** One public transaction of a mirrored address. */
export const WalletTransaction = S.Struct({
  signature: S.String,
  slot: S.Int,
  maybeBlockTimeMs: S.OptionFromOptionalKey(S.Number),
  didSucceed: S.Boolean,
  maybeChangeAtomic: S.OptionFromOptionalKey(S.String),
})
/** One public transaction of a mirrored address. */
export type WalletTransaction = typeof WalletTransaction.Type

/** One mirrored public address: `GET /api/wallets`. */
export const WalletAddress = S.Struct({
  label: S.String,
  chain: S.Literals(['Solana']),
  network: S.Literals(['Devnet', 'Mainnet']),
  address: S.String,
  balanceAtomic: S.String,
  mirroredAtMs: S.Number,
  transactions: S.Array(WalletTransaction),
})
/** One mirrored public address. */
export type WalletAddress = typeof WalletAddress.Type

/** Every mirrored address this person may see. */
export const WalletAddresses = S.Array(WalletAddress)

// WALLET ACTIVITY

/**
 * The four networks a person's wallet is followed on, in the order its
 * pickers list them, kept apart so a test send is never filed under a
 * real account.
 */
export const WatchedNetworkId = S.Literals([
  'solana:devnet',
  'ethereum:sepolia',
  'solana:mainnet-beta',
  'ethereum:mainnet',
])
/** The four networks a person's wallet is followed on. */
export type WatchedNetworkId = typeof WatchedNetworkId.Type

/** How settled a transaction is: Solana processed, confirmed, finalized; Ethereum seen, in a block, finalized. */
export const Finality = S.Literals(['Seen', 'Included', 'Final'])
/** How settled a transaction is. */
export type Finality = typeof Finality.Type

/**
 * One public address a person's wallet holds on one network. It is the
 * only thing about a wallet that leaves the page: never a key.
 */
export const WalletPublicAccount = S.Struct({
  networkId: WatchedNetworkId,
  address: S.String,
})
/** One public address a person's wallet holds on one network. */
export type WalletPublicAccount = typeof WalletPublicAccount.Type

/** One transaction of this person's wallets, as the chain reported it. */
export const WalletActivityEntry = S.Struct({
  transactionId: S.String,
  networkId: WatchedNetworkId,
  direction: S.Literals(['Incoming', 'Outgoing']),
  status: S.Literals(['Pending', 'Confirmed', 'Failed']),
  maybeFinality: S.OptionFromOptionalKey(Finality),
  assetId: S.String,
  amountAtomic: AtomicUnits,
  maybeCounterpartyAddress: S.OptionFromOptionalKey(S.String),
  observedAtMs: S.Number,
  maybeFailure: S.OptionFromOptionalKey(S.String),
})
/** One transaction of this person's wallets, as the chain reported it. */
export type WalletActivityEntry = typeof WalletActivityEntry.Type

/**
 * One send this wallet just broadcast, in the facts its chain now shows to
 * anyone: where, from, to, how much, and its signature or hash. The origin
 * files it as a Pending row until the chain says how it ended.
 */
export const SentTransaction = S.Struct({
  networkId: WatchedNetworkId,
  senderAddress: S.String,
  transactionId: S.String,
  recipientAddress: S.String,
  amountAtomic: AtomicUnits,
})
/** One send this wallet just broadcast. */
export type SentTransaction = typeof SentTransaction.Type

/** This person's rows, newest first: `GET /api/wallet/activity`. */
export const WalletActivity = S.Array(WalletActivityEntry)

// HELD FOR YOU

/** Where a move of held money stands: asked for, sent, or failed with nothing sent. */
export const HeldClaimStatus = S.Literals(['Requested', 'Sent', 'Failed'])
/** Where a move of held money stands. */
export type HeldClaimStatus = typeof HeldClaimStatus.Type

/**
 * The newest move a person asked for on a held account: where it goes,
 * when they asked, and how it ended.
 */
export const HeldClaim = S.Struct({
  toAddress: S.String,
  requestedAtMs: S.Number,
  status: HeldClaimStatus,
  maybeAmountAtomic: S.OptionFromOptionalKey(AtomicUnits),
  maybeTransactionId: S.OptionFromOptionalKey(S.String),
  maybeFailure: S.OptionFromOptionalKey(S.String),
})
/** The newest move a person asked for on a held account. */
export type HeldClaim = typeof HeldClaim.Type

/**
 * One account Scribe holds for this person: its key is on Michael's Mac,
 * not in their browser. It carries the balance the chain reported when
 * the origin answered, and the newest move they asked for.
 */
export const HeldAccount = S.Struct({
  networkId: WatchedNetworkId,
  address: S.String,
  maybeBalanceAtomic: S.OptionFromOptionalKey(AtomicUnits),
  maybeClaim: S.OptionFromOptionalKey(HeldClaim),
})
/** One account Scribe holds for this person. */
export type HeldAccount = typeof HeldAccount.Type

/** The accounts Scribe holds for this person: `GET /api/wallet/held`. */
export const HeldAccounts = S.Array(HeldAccount)

/**
 * A move the page asks for: all of a held account's money to an address
 * of this person's own wallet, on the same network.
 */
export const HeldClaimRequest = S.Struct({
  networkId: WatchedNetworkId,
  heldAddress: S.String,
  toAddress: S.String,
})
/** A move the page asks for. */
export type HeldClaimRequest = typeof HeldClaimRequest.Type

const lamportsPerSol = 1_000_000_000n
const solDecimals = 9

/**
 * A Solana amount in SOL, from whole lamports kept as text.
 *
 * @example
 * ```typescript
 * solOfLamports('1500000000') // '1.5'
 * solOfLamports('-5000') // '-0.000005'
 * ```
 */
export const solOfLamports = (lamports: string): string => {
  const isNegative = lamports.startsWith('-')
  const magnitude = BigInt(isNegative ? lamports.slice(1) : lamports)
  const fraction = (magnitude % lamportsPerSol)
    .toString()
    .padStart(solDecimals, '0')
    .replace(/0+$/, '')
  const whole = (magnitude / lamportsPerSol).toString()
  const unsigned = fraction === '' ? whole : `${whole}.${fraction}`
  return isNegative ? `-${unsigned}` : unsigned
}
