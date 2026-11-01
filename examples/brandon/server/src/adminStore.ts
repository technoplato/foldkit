import {
  AwardedPoints,
  ChangedSections,
  type Message,
  MirroredWallets,
  SectionColumn,
  WalletAddress,
} from 'brandon-core-example'
import { Array, Effect, Option, Order, Schema as S } from 'effect'
import { randomUUID } from 'node:crypto'

import { id, init } from '@instantdb/admin'

import type { Account } from './account.js'
import { type FactStamp, logFieldsOf } from './facts.js'
import type { BrandonStore, LinkRow, SectionKind, SectionRow } from './store.js'
import {
  type MirroredWallet,
  mirrorAddress,
  walletRowsFor,
} from './walletMirror.js'

// ADMIN STORE

const formatVersion = 1
const cliProcessor = 'cli-brandon'

const JsonFlags = S.fromJsonString(S.Array(S.String))
const JsonLinks = S.fromJsonString(
  S.Array(S.Struct({ label: S.String, url: S.String })),
)

const AccountRow = S.Struct({
  id: S.String,
  accountKey: S.String,
  displayName: S.String,
  flags: S.String,
})

const SectionRowSchema = S.Struct({
  id: S.String,
  sectionKey: S.String,
  title: S.String,
  kind: S.Literals([
    'Markdown',
    'QrLinks',
    'Scoreboard',
    'Football',
    'Wallets',
  ]),
  column: SectionColumn,
  flag: S.String,
  position: S.Number,
  markdown: S.optionalKey(S.NullOr(S.String)),
  links: S.optionalKey(S.NullOr(S.String)),
})
type SectionRowSchema = typeof SectionRowSchema.Type

const TransactionRow = S.Struct({
  signature: S.String,
  slot: S.Number,
  blockTimeMs: S.optionalKey(S.NullOr(S.Number)),
  didSucceed: S.Boolean,
  changeAtomic: S.optionalKey(S.NullOr(S.String)),
})
type TransactionRow = typeof TransactionRow.Type

const AddressRow = S.Struct({
  id: S.String,
  addressKey: S.String,
  chain: S.Literal('Solana'),
  network: S.Literals(['Devnet', 'Mainnet']),
  address: S.String,
  label: S.String,
  balanceAtomic: S.String,
  mirroredAtMs: S.Number,
  transactions: S.optionalKey(S.Array(TransactionRow)),
})
type AddressRow = typeof AddressRow.Type

const ScoreEvent = S.Struct({ points: S.Number })

const PlayerRow = S.Struct({
  id: S.String,
  displayName: S.String,
  scoreEvents: S.optionalKey(S.Array(ScoreEvent)),
})
type PlayerRow = typeof PlayerRow.Type

const failure = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause))

const nullable = <A>(value: A | null | undefined): Option.Option<A> =>
  Option.fromNullishOr(value)

const sectionRowOf = (row: SectionRowSchema): SectionRow => ({
  sectionKey: row.sectionKey,
  title: row.title,
  kind: row.kind,
  column: row.column,
  flag: row.flag,
  position: row.position,
  maybeMarkdown: nullable(row.markdown),
  maybeLinks: Option.map(nullable(row.links), links =>
    S.decodeUnknownSync(JsonLinks)(links),
  ),
})

const walletTransactionOf = (row: TransactionRow) => ({
  signature: row.signature,
  slot: row.slot,
  maybeBlockTimeMs: nullable(row.blockTimeMs),
  didSucceed: row.didSucceed,
  maybeChangeAtomic: nullable(row.changeAtomic),
})

const newestFirst = Order.mapInput(
  Order.flip(Order.Number),
  (transaction: TransactionRow) => transaction.slot,
)

const walletOf = (row: AddressRow): WalletAddress =>
  WalletAddress.make({
    label: row.label,
    chain: row.chain,
    network: row.network,
    address: row.address,
    balanceAtomic: row.balanceAtomic,
    mirroredAtMs: row.mirroredAtMs,
    transactions: Array.map(
      Array.sort(row.transactions ?? [], newestFirst),
      walletTransactionOf,
    ),
  })

/** Where the admin store reads and writes, and whose rows they are. */
export type AdminConfig = Readonly<{
  appId: string
  adminToken: string
  ownerUserID: string
}>

/** What the `brandon` command and the origin's mirror timer write. */
export type BrandonAdmin = BrandonStore &
  Readonly<{
    appendFact: (message: Message) => Effect.Effect<void, Error>
    setAccount: (
      accountKey: string,
      account: Account,
    ) => Effect.Effect<void, Error>
    accounts: Effect.Effect<ReadonlyArray<Account>, Error>
    putSection: (row: SectionRow) => Effect.Effect<void, Error>
    addWallet: (wallet: MirroredWallet) => Effect.Effect<void, Error>
    mirrorWallets: (
      fetch: typeof globalThis.fetch,
    ) => Effect.Effect<number, Error>
    scoreTotals: (
      gameKey: string,
    ) => Effect.Effect<ReadonlyMap<string, number>, Error>
    awardPoints: (
      award: Readonly<{
        gameKey: string
        name: string
        points: number
        reason: string
        awardedBy: string
        segmentIndex?: number
        recordingID?: string
      }>,
    ) => Effect.Effect<void, Error>
  }>

/**
 * Brandon dot's rows on Instant, through the admin token. It runs in the
 * origin and in the `brandon` command, never in a browser.
 */
export const makeBrandonAdmin = (config: AdminConfig): BrandonAdmin => {
  const admin = init({ appId: config.appId, adminToken: config.adminToken })
  const { ownerUserID } = config
  const owned = { ownerUserID, formatVersion }

  const attempt = <A>(run: () => Promise<A>): Effect.Effect<A, Error> =>
    Effect.tryPromise({ try: run, catch: failure })

  const stamp = (): FactStamp => ({
    ownerUserID,
    from: cliProcessor,
    atMs: Date.now(),
  })

  const factStep = (message: Message) =>
    admin.tx['programMessage']![id()]!.update(logFieldsOf(message, stamp()))

  const appendFact = (message: Message): Effect.Effect<void, Error> =>
    attempt(() => admin.transact([factStep(message)])).pipe(Effect.asVoid)

  const accountRows = attempt(() => admin.query({ brandonAccounts: {} })).pipe(
    Effect.map(result =>
      S.decodeUnknownSync(S.Array(AccountRow))(result['brandonAccounts']),
    ),
  )

  const account: BrandonStore['account'] = accountKey =>
    attempt(() =>
      admin.query({ brandonAccounts: { $: { where: { accountKey } } } }),
    ).pipe(
      Effect.map(result =>
        Option.map(
          Array.head(
            S.decodeUnknownSync(S.Array(AccountRow))(result['brandonAccounts']),
          ),
          row => ({
            displayName: row.displayName,
            flags: S.decodeUnknownSync(JsonFlags)(row.flags),
          }),
        ),
      ),
    )

  const sections: BrandonStore['sections'] = attempt(() =>
    admin.query({ brandonSections: {} }),
  ).pipe(
    Effect.map(result =>
      Array.map(
        S.decodeUnknownSync(S.Array(SectionRowSchema))(
          result['brandonSections'],
        ),
        sectionRowOf,
      ),
    ),
  )

  const addressRows = attempt(() =>
    admin.query({ walletMirrorAddresses: { transactions: {} } }),
  ).pipe(
    Effect.map(result =>
      S.decodeUnknownSync(S.Array(AddressRow))(result['walletMirrorAddresses']),
    ),
  )

  const wallets: BrandonStore['wallets'] = Effect.map(addressRows, rows =>
    Array.map(rows, walletOf),
  )

  const setAccount: BrandonAdmin['setAccount'] = (accountKey, next) =>
    attempt(() =>
      admin.transact([
        admin.tx['brandonAccounts']!.lookup('accountKey', accountKey).update({
          ...owned,
          displayName: next.displayName,
          flags: JSON.stringify(next.flags),
          updatedAtMs: Date.now(),
        }),
        factStep(ChangedSections({ atMs: Date.now() })),
      ]),
    ).pipe(Effect.asVoid)

  const putSection: BrandonAdmin['putSection'] = row =>
    attempt(() =>
      admin.transact([
        admin.tx['brandonSections']!.lookup(
          'sectionKey',
          row.sectionKey,
        ).update({
          ...owned,
          title: row.title,
          kind: row.kind as SectionKind,
          column: row.column,
          flag: row.flag,
          position: row.position,
          ...Option.match(row.maybeMarkdown, {
            onNone: () => ({}),
            onSome: markdown => ({ markdown }),
          }),
          ...Option.match(row.maybeLinks, {
            onNone: () => ({}),
            onSome: (links: ReadonlyArray<LinkRow>) => ({
              links: JSON.stringify(links),
            }),
          }),
          updatedAtMs: Date.now(),
        }),
        factStep(ChangedSections({ atMs: Date.now() })),
      ]),
    ).pipe(Effect.asVoid)

  const addWallet: BrandonAdmin['addWallet'] = wallet =>
    attempt(() =>
      admin.transact([
        admin.tx['walletMirrorAddresses']!.lookup(
          'addressKey',
          `Solana:${wallet.network}:${wallet.address}`,
        ).update({
          ...owned,
          chain: 'Solana',
          network: wallet.network,
          address: wallet.address,
          label: wallet.label,
          balanceAtomic: '0',
          mirroredAtMs: 0,
        }),
      ]),
    ).pipe(Effect.asVoid)

  const mirrorWallets: BrandonAdmin['mirrorWallets'] = fetch =>
    Effect.gen(function* () {
      const rows = yield* addressRows
      const atMs = Date.now()
      const changes = yield* Effect.forEach(rows, row =>
        Effect.gen(function* () {
          const wallet = {
            network: row.network,
            address: row.address,
            label: row.label,
          }
          const mirrored = yield* mirrorAddress({
            fetch,
            address: row.address,
            network: row.network,
            known: new Set(
              Array.map(row.transactions ?? [], ({ signature }) => signature),
            ),
          })
          const written = walletRowsFor(wallet, mirrored, atMs)
          const steps = [
            admin.tx['walletMirrorAddresses']![row.id]!.update({
              ...owned,
              ...written.address,
            }),
            ...Array.map(written.transactions, transaction =>
              admin.tx['walletMirrorTransactions']!.lookup(
                'transactionKey',
                transaction.transactionKey,
              )
                .update({ ...owned, ...transaction })
                .link({ address: row.id }),
            ),
          ]
          yield* attempt(() => admin.transact(steps))
          return (
            mirrored.balanceAtomic !== row.balanceAtomic ||
            Array.isArrayNonEmpty([...mirrored.transactions])
          )
        }),
      )
      const changedCount = Array.filter(changes, isChanged => isChanged).length
      if (changedCount > 0) {
        yield* appendFact(MirroredWallets({ atMs }))
      }
      return changedCount
    })

  const players = (gameKey: string) =>
    attempt(() =>
      admin.query({
        hotPhonezPlayers: {
          $: { where: { 'game.gameKey': gameKey } },
          scoreEvents: {},
        },
      }),
    ).pipe(
      Effect.map(result =>
        S.decodeUnknownSync(S.Array(PlayerRow))(result['hotPhonezPlayers']),
      ),
    )

  const totalOf = (player: PlayerRow): number =>
    Array.reduce(player.scoreEvents ?? [], 0, (sum, { points }) => sum + points)

  const scoreTotals: BrandonAdmin['scoreTotals'] = gameKey =>
    Effect.map(
      players(gameKey),
      rows =>
        new Map(
          Array.map(rows, row => [row.displayName, totalOf(row)] as const),
        ),
    )

  const awardPoints: BrandonAdmin['awardPoints'] = award =>
    Effect.gen(function* () {
      const known = yield* players(award.gameKey)
      const maybePlayer = Array.findFirst(
        known,
        player => player.displayName.toLowerCase() === award.name.toLowerCase(),
      )
      if (Option.isNone(maybePlayer)) {
        return yield* Effect.fail(
          new Error(`No player named ${award.name} in ${award.gameKey}.`),
        )
      }
      const eventId = randomUUID()
      const awardedAtMs = Date.now()
      yield* attempt(() =>
        admin.transact([
          admin.tx['hotPhonezScoreEvents']![eventId]!.update({
            ...owned,
            points: award.points,
            reason: award.reason,
            awardedBy: award.awardedBy,
            awardedAtMs,
            ...(award.recordingID === undefined
              ? {}
              : { recordingID: award.recordingID }),
            ...(award.segmentIndex === undefined
              ? {}
              : { segmentIndex: award.segmentIndex }),
          }).link({ player: maybePlayer.value.id }),
          factStep(
            AwardedPoints({
              eventId,
              name: maybePlayer.value.displayName,
              points: award.points,
              reason: award.reason,
              awardedBy: award.awardedBy,
            }),
          ),
        ]),
      )
    })

  return {
    account,
    sections,
    wallets,
    appendFact,
    setAccount,
    accounts: Effect.map(accountRows, rows =>
      Array.map(rows, row => ({
        displayName: row.displayName,
        flags: S.decodeUnknownSync(JsonFlags)(row.flags),
      })),
    ),
    putSection,
    addWallet,
    mirrorWallets,
    scoreTotals,
    awardPoints,
  }
}
