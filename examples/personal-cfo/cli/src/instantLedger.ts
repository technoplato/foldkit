import { Array, Effect, Layer, Option, Schema as S } from 'effect'
import {
  Access,
  Account,
  AccountKind,
  AppNotification,
  Authenticated,
  CadenceTag,
  ChatMessage,
  ChatRole,
  Currency,
  Finding,
  Ledger,
  LedgerError,
  NotifyChannel,
  NotifyStatus,
  Plan,
  RadarJob,
  RadarStatus,
  Snapshot,
  VaultFile,
  VaultOrigin,
  demoAccounts,
  emptySnapshot,
  groundedReply,
  maybeFinding,
  parseEmail,
  schema,
} from 'personal-cfo-core'

import { id, init } from '@instantdb/admin'

import { clearSession, readSession, writeSession } from './sessionFile.js'

const requireEnv = (
  name: 'INSTANT_APP_ID' | 'INSTANT_APP_ADMIN_TOKEN',
): string => {
  const value = process.env[name]
  if (value === undefined || value.length === 0) {
    throw new LedgerError({
      reason: `${name} is missing. Run examples/personal-cfo/scripts/provision-instant.mjs`,
    })
  }
  return value
}

const database = () =>
  init({
    appId: requireEnv('INSTANT_APP_ID'),
    adminToken: requireEnv('INSTANT_APP_ADMIN_TOKEN'),
    schema,
  })

type AdminDb = ReturnType<typeof database>

const asUser = async (
  db: AdminDb,
  email: string,
): Promise<Readonly<{ id: string; email: string }>> => {
  await db.auth.createToken({ email })
  const user = await db.auth.getUser({ email })
  if (
    typeof user !== 'object' ||
    user === null ||
    !('id' in user) ||
    typeof user.id !== 'string'
  ) {
    throw new LedgerError({ reason: 'Instant did not return a user id.' })
  }
  return { id: user.id, email }
}

const decodeAccount = (row: Record<string, unknown>): Account =>
  Account.make({
    id: String(row['id']),
    name: String(row['name']),
    institution: String(row['institution']),
    kind: S.decodeUnknownSync(AccountKind)(row['kind']),
    currency: S.decodeUnknownSync(Currency)(row['currency']),
    balanceCents: Number(row['balanceCents']),
    access: S.decodeUnknownSync(Access)(row['access']),
  })

const decodeVault = (row: Record<string, unknown>): VaultFile =>
  VaultFile.make({
    id: String(row['id']),
    title: String(row['title']),
    origin: S.decodeUnknownSync(VaultOrigin)(row['origin']),
    createdAtMs: Number(row['createdAtMs']),
  })

const decodeRadar = (row: Record<string, unknown>): RadarJob =>
  RadarJob.make({
    id: String(row['id']),
    question: String(row['question']),
    cadence: S.decodeUnknownSync(CadenceTag)(row['cadence']),
    everyMinutes: Number(row['everyMinutes']),
    status: S.decodeUnknownSync(RadarStatus)(row['status']),
    lastAnswer: String(row['lastAnswer'] ?? ''),
    lastAnswerHash: String(row['lastAnswerHash'] ?? ''),
  })

const decodeChat = (row: Record<string, unknown>): ChatMessage =>
  ChatMessage.make({
    id: String(row['id']),
    role: S.decodeUnknownSync(ChatRole)(row['role']),
    body: String(row['body']),
    createdAtMs: Number(row['createdAtMs']),
    citationAccountIds: JSON.parse(
      String(row['citationsJson'] ?? '[]'),
    ) as ReadonlyArray<string>,
  })

const decodeNotification = (row: Record<string, unknown>): AppNotification =>
  AppNotification.make({
    id: String(row['id']),
    title: String(row['title']),
    body: String(row['body']),
    channel: S.decodeUnknownSync(NotifyChannel)(row['channel']),
    status: S.decodeUnknownSync(NotifyStatus)(row['status']),
    createdAtMs: Number(row['createdAtMs']),
  })

const loadSnapshot = async (
  db: AdminDb,
  session: Readonly<{ email: string; userId: string }>,
): Promise<Snapshot> => {
  const ownerId = session.userId
  const data = await db.query({
    personalCfoAccounts: { $: { where: { ownerId } } },
    personalCfoVaultFiles: { $: { where: { ownerId } } },
    personalCfoRadarJobs: { $: { where: { ownerId } } },
    personalCfoChatMessages: { $: { where: { ownerId } } },
    personalCfoNotifications: { $: { where: { ownerId } } },
  })
  return Snapshot.make({
    session: Authenticated.make({
      userId: session.userId,
      email: session.email,
      plan: S.decodeUnknownSync(Plan)('free'),
    }),
    accounts: Array.map(data.personalCfoAccounts, row =>
      decodeAccount(row as Record<string, unknown>),
    ),
    vault: Array.map(data.personalCfoVaultFiles, row =>
      decodeVault(row as Record<string, unknown>),
    ),
    radar: Array.map(data.personalCfoRadarJobs, row =>
      decodeRadar(row as Record<string, unknown>),
    ),
    chat: Array.map(data.personalCfoChatMessages, row =>
      decodeChat(row as Record<string, unknown>),
    ),
    notifications: Array.map(data.personalCfoNotifications, row =>
      decodeNotification(row as Record<string, unknown>),
    ),
  })
}

const tryPromise = <A>(run: () => Promise<A>): Effect.Effect<A, LedgerError> =>
  Effect.tryPromise({
    try: run,
    catch: cause =>
      cause instanceof LedgerError
        ? cause
        : new LedgerError({
            reason: cause instanceof Error ? cause.message : 'Instant failed.',
          }),
  })

const requireTx = <Row>(row: Row | undefined): Row => {
  if (row === undefined) {
    throw new LedgerError({ reason: 'Instant transaction row is missing.' })
  }
  return row
}

/** Instant admin Ledger. Secrets stay in the process environment. */
export const layerInstantLedger = Layer.succeed(Ledger, {
  restore: tryPromise(async () => {
    const stored = readSession()
    if (stored === undefined) {
      return emptySnapshot()
    }
    return loadSnapshot(database(), stored)
  }),
  currentEmail: Effect.sync(() => {
    const stored = readSession()
    if (stored === undefined) {
      return Option.none()
    }
    return Option.some(stored.email)
  }),
  login: email =>
    tryPromise(async () => {
      const parsed = parseEmail(email)
      if (Option.isNone(parsed)) {
        throw new LedgerError({ reason: 'Email is not valid.' })
      }
      const db = database()
      const user = await asUser(db, parsed.value)
      writeSession({ email: parsed.value, userId: user.id })
      const profileId = user.id
      await db.transact(
        requireTx(db.tx.personalCfoProfiles[profileId]).update({
          ownerId: user.id,
          email: parsed.value,
          plan: 'free',
          createdAtMs: Date.now(),
        }),
      )
      const existing = await loadSnapshot(db, {
        email: parsed.value,
        userId: user.id,
      })
      if (existing.accounts.length > 0) {
        return existing
      }
      const seeds = demoAccounts(user.id)
      await db.transact(
        seeds.map(account =>
          requireTx(db.tx.personalCfoAccounts[account.id]).update({
            ownerId: user.id,
            name: account.name,
            institution: account.institution,
            kind: account.kind,
            currency: account.currency,
            balanceCents: account.balanceCents,
            access: 'read_only',
          }),
        ),
      )
      return loadSnapshot(db, { email: parsed.value, userId: user.id })
    }),
  logout: Effect.sync(() => {
    clearSession()
    return emptySnapshot()
  }),
  addAccount: input =>
    tryPromise(async () => {
      const stored = readSession()
      if (stored === undefined) {
        throw new LedgerError({ reason: 'Sign in first.' })
      }
      const db = database()
      const accountId = id()
      await db.transact(
        requireTx(db.tx.personalCfoAccounts[accountId]).update({
          ownerId: stored.userId,
          name: input.name.trim(),
          institution: input.institution.trim() || 'Manual',
          kind: input.kind,
          currency: 'USD',
          balanceCents: input.balanceCents,
          access: 'read_only',
        }),
      )
      return loadSnapshot(db, stored)
    }),
  addVault: input =>
    tryPromise(async () => {
      const stored = readSession()
      if (stored === undefined) {
        throw new LedgerError({ reason: 'Sign in first.' })
      }
      const db = database()
      await db.transact(
        requireTx(db.tx.personalCfoVaultFiles[id()]).update({
          ownerId: stored.userId,
          title: input.title.trim(),
          origin: input.origin,
          createdAtMs: Date.now(),
        }),
      )
      return loadSnapshot(db, stored)
    }),
  armRadar: input =>
    tryPromise(async () => {
      const stored = readSession()
      if (stored === undefined) {
        throw new LedgerError({ reason: 'Sign in first.' })
      }
      const db = database()
      await db.transact(
        requireTx(db.tx.personalCfoRadarJobs[id()]).update({
          ownerId: stored.userId,
          question: input.question.trim(),
          cadence: input.cadence,
          everyMinutes: input.everyMinutes,
          status: 'armed',
          lastAnswer: '',
          lastAnswerHash: '',
        }),
      )
      return loadSnapshot(db, stored)
    }),
  tickRadar: tryPromise(async () => {
    const stored = readSession()
    if (stored === undefined) {
      throw new LedgerError({ reason: 'Sign in first.' })
    }
    const db = database()
    const snapshot = await loadSnapshot(db, stored)
    const findings: Array<Finding> = []
    const ops: Array<unknown> = []
    for (const job of snapshot.radar) {
      if (job.status !== 'armed') {
        continue
      }
      const maybe = maybeFinding(job, snapshot.accounts)
      if (Option.isNone(maybe)) {
        continue
      }
      findings.push(maybe.value)
      ops.push(
        requireTx(db.tx.personalCfoRadarJobs[job.id]).update({
          lastAnswer: maybe.value.answer,
          lastAnswerHash: maybe.value.hash,
        }),
      )
      ops.push(
        requireTx(db.tx.personalCfoNotifications[id()]).update({
          ownerId: stored.userId,
          title: 'Radar',
          body: maybe.value.answer,
          channel: 'local',
          status: 'queued',
          createdAtMs: Date.now(),
        }),
      )
    }
    if (ops.length > 0) {
      await db.transact(ops as never)
    }
    return {
      snapshot: await loadSnapshot(db, stored),
      findings,
    }
  }),
  sendChat: input =>
    tryPromise(async () => {
      const stored = readSession()
      if (stored === undefined) {
        throw new LedgerError({ reason: 'Sign in first.' })
      }
      const db = database()
      const snapshot = await loadSnapshot(db, stored)
      const text = input.text.trim()
      const reply = groundedReply(text, snapshot.accounts)
      const createdAtMs = Date.now()
      await db.transact([
        requireTx(db.tx.personalCfoChatMessages[id()]).update({
          ownerId: stored.userId,
          role: 'user',
          body: text,
          createdAtMs,
          citationsJson: '[]',
        }),
        requireTx(db.tx.personalCfoChatMessages[id()]).update({
          ownerId: stored.userId,
          role: 'assistant',
          body: reply.body,
          createdAtMs: createdAtMs + 1,
          citationsJson: JSON.stringify(reply.citationAccountIds),
        }),
      ])
      return loadSnapshot(db, stored)
    }),
  enqueueNotification: input =>
    tryPromise(async () => {
      const stored = readSession()
      if (stored === undefined) {
        throw new LedgerError({ reason: 'Sign in first.' })
      }
      const db = database()
      await db.transact(
        requireTx(db.tx.personalCfoNotifications[id()]).update({
          ownerId: stored.userId,
          title: input.title.trim(),
          body: input.body.trim(),
          channel: input.channel,
          status: 'queued',
          createdAtMs: Date.now(),
        }),
      )
      return loadSnapshot(db, stored)
    }),
})
