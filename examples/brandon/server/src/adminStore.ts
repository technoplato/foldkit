import {
  AwardedPoints,
  BrandonProgram,
  ChangedSections,
  ChangedWalletActivity,
  type LogMessage,
  MirroredWallets,
  SectionColumn,
  WalletAddress,
} from 'brandon-core-example'
import { Array, Effect, Option, Order, Schema as S } from 'effect'
import { randomUUID } from 'node:crypto'

import { id, init, lookup } from '@instantdb/admin'

import type { Account } from './account.js'
import {
  activityEntryOf,
  chainIdOfNetwork,
  ownerUserIdOfHolder,
  sentActivityRow,
  accountKeyOf as watchedAccountKeyOf,
} from './activity.js'
import { decodeActivityRows, transactionFieldsOf } from './activityStore.js'
import { type FactStamp, logFieldsOf } from './facts.js'
import {
  type BrandonStore,
  type LinkRow,
  SectionKind,
  type SectionRow,
} from './store.js'
import {
  type MirroredWallet,
  mirrorAddress,
  walletRowsFor,
} from './walletMirror.js'

// ADMIN STORE

const formatVersion = 1
const cliProcessor = 'cli-brandon'

/** The newest rows a page gets of one person's activity. */
const activityRowLimit = 50

const WatchedAccountRow = S.Struct({ accountKey: S.String })

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
  kind: SectionKind,
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

const ScoreEvent = S.Struct({
  id: S.String,
  points: S.Number,
  reason: S.optionalKey(S.NullOr(S.String)),
  awardedBy: S.String,
})

const LoggedAward = S.Struct({
  payload: S.Struct({
    eventId: S.String,
    name: S.String,
    points: S.Number,
  }),
})

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
    appendFact: (message: LogMessage) => Effect.Effect<void, Error>
    setAccount: (
      accountKey: string,
      account: Account,
    ) => Effect.Effect<void, Error>
    accounts: Effect.Effect<ReadonlyArray<Account>, Error>
    changeFlags: (
      displayName: string,
      change: (flags: ReadonlyArray<string>) => ReadonlyArray<string>,
    ) => Effect.Effect<Account, Error>
    putSection: (row: SectionRow) => Effect.Effect<void, Error>
    addWallet: (wallet: MirroredWallet) => Effect.Effect<void, Error>
    mirrorWallets: (
      fetch: typeof globalThis.fetch,
    ) => Effect.Effect<number, Error>
    scoreTotals: (
      gameKey: string,
    ) => Effect.Effect<ReadonlyMap<string, number>, Error>
    logTotals: Effect.Effect<ReadonlyMap<string, number>, Error>
    syncScoresToLog: (gameKey: string) => Effect.Effect<number, Error>
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

  const factStep = (message: LogMessage) =>
    admin.tx['programMessage']![id()]!.update(logFieldsOf(message, stamp()))

  const appendFact = (message: LogMessage): Effect.Effect<void, Error> =>
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

  const walletActivity: BrandonStore['walletActivity'] = holder =>
    attempt(() =>
      admin.query({
        walletTransactions: {
          $: {
            where: { 'account.holder': holder },
            order: { observedAtMs: 'desc' },
            limit: activityRowLimit,
          },
        },
      }),
    ).pipe(
      Effect.map(result =>
        Array.map(
          decodeActivityRows(result['walletTransactions']),
          activityEntryOf,
        ),
      ),
    )

  const watchedAccountKeys: BrandonStore['watchedAccountKeys'] = holder =>
    attempt(() =>
      admin.query({ walletAccounts: { $: { where: { holder } } } }),
    ).pipe(
      Effect.map(result =>
        Array.map(
          S.decodeUnknownSync(S.Array(WatchedAccountRow))(
            result['walletAccounts'],
          ),
          ({ accountKey }) => accountKey,
        ),
      ),
    )

  const addWatchedAccount: BrandonStore['addWatchedAccount'] = ({
    holder,
    networkId,
    address,
  }) =>
    attempt(() =>
      admin.transact(
        admin.tx['walletAccounts']!.lookup(
          'accountKey',
          watchedAccountKeyOf({ holder, networkId, address }),
        ).update({
          ...owned,
          holder,
          chainId: chainIdOfNetwork(networkId),
          networkId,
          address,
        }),
      ),
    ).pipe(Effect.asVoid)

  const addSentTransaction: BrandonStore['addSentTransaction'] = (
    holder,
    sent,
  ) =>
    Effect.gen(function* () {
      const accountKey = watchedAccountKeyOf({
        holder,
        networkId: sent.networkId,
        address: sent.senderAddress,
      })
      const atMs = Date.now()
      const row = sentActivityRow(accountKey, sent, atMs)
      const { walletTransactions } = yield* attempt(() =>
        admin.query({
          walletTransactions: {
            $: { where: { transactionKey: row.transactionKey } },
          },
        }),
      )
      if (Array.isReadonlyArrayEmpty(walletTransactions ?? [])) {
        yield* attempt(() =>
          admin.transact([
            admin.tx['walletTransactions']!.lookup(
              'transactionKey',
              row.transactionKey,
            )
              .update(
                transactionFieldsOf(
                  row,
                  ownerUserIdOfHolder(holder, ownerUserID),
                ),
              )
              .link({ account: lookup('accountKey', accountKey) }),
            factStep(ChangedWalletActivity({ atMs })),
          ]),
        )
      }
    })

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

  const changeFlags: BrandonAdmin['changeFlags'] = (displayName, change) =>
    Effect.gen(function* () {
      const named = Array.filter(
        yield* accountRows,
        row => row.displayName === displayName,
      )
      const row = yield* Array.match(named, {
        onEmpty: () =>
          Effect.fail(new Error(`No account is named ${displayName}.`)),
        onNonEmpty: ([only, ...others]) =>
          Array.isArrayNonEmpty(others)
            ? Effect.fail(
                new Error(
                  `${named.length.toString()} accounts are named ${displayName}; change them with account set.`,
                ),
              )
            : Effect.succeed(only),
      })
      const next: Account = {
        displayName,
        flags: change(S.decodeUnknownSync(JsonFlags)(row.flags)),
      }
      yield* setAccount(row.accountKey, next)
      return next
    })

  const putSection: BrandonAdmin['putSection'] = row =>
    attempt(() =>
      admin.transact([
        admin.tx['brandonSections']!.lookup(
          'sectionKey',
          row.sectionKey,
        ).update({
          ...owned,
          title: row.title,
          kind: row.kind,
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

  const loggedAwards = attempt(() =>
    admin.query({
      programMessage: {
        $: { where: { app: BrandonProgram.id, tag: 'AwardedPoints' } },
      },
    }),
  ).pipe(
    Effect.map(result =>
      S.decodeUnknownSync(S.Array(LoggedAward))(result['programMessage']),
    ),
  )

  const logTotals: BrandonAdmin['logTotals'] = Effect.map(
    loggedAwards,
    awards => {
      const counted = new Map(
        Array.map(awards, ({ payload }) => [payload.eventId, payload] as const),
      )
      const totals = new Map<string, number>()
      counted.forEach(({ name, points }) => {
        totals.set(name, (totals.get(name) ?? 0) + points)
      })
      return totals
    },
  )

  const syncScoresToLog: BrandonAdmin['syncScoresToLog'] = gameKey =>
    Effect.gen(function* () {
      const rows = yield* players(gameKey)
      const awards = yield* loggedAwards
      const logged = new Set(
        Array.map(awards, ({ payload }) => payload.eventId),
      )
      const awardsOf = (player: PlayerRow) => {
        const events = player.scoreEvents ?? []
        return Array.isReadonlyArrayEmpty(events)
          ? [
              {
                eventId: `joined-${player.id}`,
                name: player.displayName,
                points: 0,
                reason: 'joined the game',
                awardedBy: 'the seed',
              },
            ]
          : Array.map(events, event => ({
              eventId: event.id,
              name: player.displayName,
              points: event.points,
              reason: event.reason ?? '',
              awardedBy: event.awardedBy,
            }))
      }
      const missing = Array.map(
        Array.filter(
          Array.flatMap(rows, awardsOf),
          ({ eventId }) => !logged.has(eventId),
        ),
        award => factStep(AwardedPoints(award)),
      )
      if (Array.isArrayNonEmpty([...missing])) {
        yield* attempt(() => admin.transact(missing))
      }
      return missing.length
    })

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
    walletActivity,
    watchedAccountKeys,
    addWatchedAccount,
    addSentTransaction,
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
    changeFlags,
    putSection,
    addWallet,
    mirrorWallets,
    scoreTotals,
    logTotals,
    syncScoresToLog,
    awardPoints,
  }
}
