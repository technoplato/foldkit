import { Array, Option, Schema as S } from 'effect'

/** USD is the only currency in this slice. */
export const Currency = S.Literals(['USD'])
/** USD is the only currency in this slice. */
export type Currency = typeof Currency.Type

/** Manual account classes that match Silvia's asset-class URIs. */
export const AccountKind = S.Literals([
  'cash',
  'brokerage',
  'crypto',
  'real_estate',
  'vehicle',
  'metal',
  'collectible',
  'private',
  'liability',
])
/** Manual account classes that match Silvia's asset-class URIs. */
export type AccountKind = typeof AccountKind.Type

/**
 * The only legal access mode. There is no write / trade / transfer constructor.
 */
export const Access = S.Literals(['read_only'])
/**
 * The only legal access mode. There is no write / trade / transfer constructor.
 */
export type Access = typeof Access.Type

/** Plan names marketed on the public site. This slice always issues Free. */
export const Plan = S.Literals(['free', 'pro', 'max'])
/** Plan names marketed on the public site. This slice always issues Free. */
export type Plan = typeof Plan.Type

/** Where a vault file came from. */
export const VaultOrigin = S.Literals(['upload', 'artifact', 'memory_note'])
/** Where a vault file came from. */
export type VaultOrigin = typeof VaultOrigin.Type

/** Radar cadence names. Custom carries minutes on the job row. */
export const CadenceTag = S.Literals(['daily', 'weekly', 'monthly', 'custom'])
/** Radar cadence names. Custom carries minutes on the job row. */
export type CadenceTag = typeof CadenceTag.Type

/** Standing-job lifecycle. */
export const RadarStatus = S.Literals([
  'draft',
  'armed',
  'running',
  'paused',
  'archived',
])
/** Standing-job lifecycle. */
export type RadarStatus = typeof RadarStatus.Type

/** Chat speaker. */
export const ChatRole = S.Literals(['user', 'assistant'])
/** Chat speaker. */
export type ChatRole = typeof ChatRole.Type

/** Notification channel. Remote push is a host concern, not a ledger write. */
export const NotifyChannel = S.Literals([
  'in_app',
  'email',
  'sms',
  'local',
  'push',
])
/** Notification channel. Remote push is a host concern, not a ledger write. */
export type NotifyChannel = typeof NotifyChannel.Type

/** Delivery lifecycle for one notification row. */
export const NotifyStatus = S.Literals(['queued', 'delivered', 'failed'])
/** Delivery lifecycle for one notification row. */
export type NotifyStatus = typeof NotifyStatus.Type

const integerCents = S.Number.check(S.isInt())

/** Integer USD cents. Sign is owned by kind (liability vs asset), not by a minus. */
export const Cents = integerCents
/** Integer USD cents. Sign is owned by kind (liability vs asset), not by a minus. */
export type Cents = typeof Cents.Type

/** One manual institution account. Access is always read-only. */
export const Account = S.Struct({
  id: S.String.check(S.isMinLength(1)),
  name: S.String.check(S.isMinLength(1)),
  institution: S.String.check(S.isMinLength(1)),
  kind: AccountKind,
  currency: Currency,
  balanceCents: Cents,
  access: Access,
})
/** One manual institution account. Access is always read-only. */
export type Account = typeof Account.Type

/** One vault document or generated artifact stub. */
export const VaultFile = S.Struct({
  id: S.String.check(S.isMinLength(1)),
  title: S.String.check(S.isMinLength(1)),
  origin: VaultOrigin,
  createdAtMs: S.Number,
})
/** One vault document or generated artifact stub. */
export type VaultFile = typeof VaultFile.Type

/** One standing Radar job. Speaks only when the answer hash changes. */
export const RadarJob = S.Struct({
  id: S.String.check(S.isMinLength(1)),
  question: S.String.check(S.isMinLength(1)),
  cadence: CadenceTag,
  everyMinutes: S.Number,
  status: RadarStatus,
  lastAnswer: S.String,
  lastAnswerHash: S.String,
})
/** One standing Radar job. Speaks only when the answer hash changes. */
export type RadarJob = typeof RadarJob.Type

/** One chat tape row. Assistant rows carry citations and the advice disclaimer. */
export const ChatMessage = S.Struct({
  id: S.String.check(S.isMinLength(1)),
  role: ChatRole,
  body: S.String.check(S.isMinLength(1)),
  createdAtMs: S.Number,
  citationAccountIds: S.Array(S.String),
})
/** One chat tape row. Assistant rows carry citations and the advice disclaimer. */
export type ChatMessage = typeof ChatMessage.Type

/** One queued or delivered notification. */
export const AppNotification = S.Struct({
  id: S.String.check(S.isMinLength(1)),
  title: S.String.check(S.isMinLength(1)),
  body: S.String.check(S.isMinLength(1)),
  channel: NotifyChannel,
  status: NotifyStatus,
  createdAtMs: S.Number,
})
/** One queued or delivered notification. */
export type AppNotification = typeof AppNotification.Type

/** Signed-out session. */
export const Anonymous = S.TaggedStruct('Anonymous', {})
/** Signed-out session. */
export type Anonymous = typeof Anonymous.Type

/** Signed-in session. Plan is Free in this slice. */
export const Authenticated = S.TaggedStruct('Authenticated', {
  userId: S.String.check(S.isMinLength(1)),
  email: S.String.check(S.isMinLength(1)),
  plan: Plan,
})
/** Signed-in session. Plan is Free in this slice. */
export type Authenticated = typeof Authenticated.Type

/** Session ADT. */
export const Session = S.Union([Anonymous, Authenticated])
/** Session ADT. */
export type Session = typeof Session.Type

/** Login-gated app surfaces that match the live sitemap. */
export const Screen = S.Literals([
  'sign-in',
  'dashboard',
  'accounts',
  'vault',
  'radar',
  'chat',
  'more',
])
/** Login-gated app surfaces that match the live sitemap. */
export type Screen = typeof Screen.Type

/** Durable product snapshot restored from the Ledger. */
export const Snapshot = S.Struct({
  session: Session,
  accounts: S.Array(Account),
  vault: S.Array(VaultFile),
  radar: S.Array(RadarJob),
  chat: S.Array(ChatMessage),
  notifications: S.Array(AppNotification),
})
/** Durable product snapshot restored from the Ledger. */
export type Snapshot = typeof Snapshot.Type

/** Radar finding. Citations are account ids that grounded the answer. */
export const Finding = S.Struct({
  radarId: S.String.check(S.isMinLength(1)),
  answer: S.String.check(S.isMinLength(1)),
  hash: S.String.check(S.isMinLength(1)),
  citations: S.NonEmptyArray(S.String),
})
/** Radar finding. Citations are account ids that grounded the answer. */
export type Finding = typeof Finding.Type

const emptyAuthenticated = (): Snapshot =>
  Snapshot.make({
    session: Anonymous.make({}),
    accounts: [],
    vault: [],
    radar: [],
    chat: [],
    notifications: [],
  })

/** Empty snapshot for a signed-out host. */
export const emptySnapshot = emptyAuthenticated

/** Liability kinds subtract from net worth. Every other kind adds. */
export const isLiability = (kind: AccountKind): boolean => kind === 'liability'

/** Signed cents contribution of one account toward net worth. */
export const signedCents = (account: Account): number =>
  isLiability(account.kind) ? -account.balanceCents : account.balanceCents

/** Net worth in USD cents. Derived from accounts; notes cannot override it. */
export const netWorthCents = (accounts: ReadonlyArray<Account>): number =>
  Array.reduce(accounts, 0, (total, account) => total + signedCents(account))

/** Asset-side cents (excludes liabilities). */
export const assetCents = (accounts: ReadonlyArray<Account>): number =>
  Array.reduce(accounts, 0, (total, account) =>
    isLiability(account.kind) ? total : total + account.balanceCents,
  )

/** Liability-side cents. */
export const liabilityCents = (accounts: ReadonlyArray<Account>): number =>
  Array.reduce(accounts, 0, (total, account) =>
    isLiability(account.kind) ? total + account.balanceCents : total,
  )

const group = (cents: number): string => {
  const sign = cents < 0 ? '-' : ''
  const absolute = Math.abs(cents)
  const dollars = Math.floor(absolute / 100)
  const remainder = absolute % 100
  const dollarText = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const centsText = remainder.toString().padStart(2, '0')
  return `${sign}$${dollarText}.${centsText}`
}

/** Formats integer cents as a USD string. */
export const formatUsd = (cents: number): string => group(cents)

/** djb2 hex. Stable across hosts. Not a cryptographic promise. */
export const answerHash = (answer: string): string => {
  let hash = 5381
  let index = 0
  while (index < answer.length) {
    const code = answer.charCodeAt(index)
    hash = (hash * 33) ^ code
    index += 1
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

const advice = 'Not professional advice.'

/** Grounded Radar / chat answer from the live ledger. Accounts win. */
export const ledgerAnswer = (
  question: string,
  accounts: ReadonlyArray<Account>,
): string => {
  const net = formatUsd(netWorthCents(accounts))
  const assets = formatUsd(assetCents(accounts))
  const debts = formatUsd(liabilityCents(accounts))
  const count = accounts.length.toString()
  return `${question.trim()} → net worth ${net} (assets ${assets}, liabilities ${debts}) across ${count} read-only accounts. ${advice}`
}

const citationIds = (accounts: ReadonlyArray<Account>): ReadonlyArray<string> =>
  Array.map(accounts, account => account.id)

/**
 * Speaks only when the answer hash changes. First tick from an empty hash
 * is a change. Citations are required.
 */
export const maybeFinding = (
  job: RadarJob,
  accounts: ReadonlyArray<Account>,
): Option.Option<Finding> => {
  const ids = citationIds(accounts)
  if (!S.is(S.NonEmptyArray(S.String))(ids)) {
    return Option.none()
  }
  const answer = ledgerAnswer(job.question, accounts)
  const hash = answerHash(answer)
  if (hash === job.lastAnswerHash) {
    return Option.none()
  }
  return Option.some(
    Finding.make({
      radarId: job.id,
      answer,
      hash,
      citations: ids,
    }),
  )
}

/** Assistant reply grounded in the current ledger. */
export const groundedReply = (
  question: string,
  accounts: ReadonlyArray<Account>,
): Readonly<{ body: string; citationAccountIds: ReadonlyArray<string> }> => ({
  body: ledgerAnswer(question, accounts),
  citationAccountIds: citationIds(accounts),
})

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Accepts a trimmed email or none. */
export const parseEmail = (raw: string): Option.Option<string> => {
  const email = raw.trim().toLowerCase()
  if (!emailPattern.test(email)) {
    return Option.none()
  }
  return Option.some(email)
}

/** Parses integer cents from a CLI / form string. */
export const parseCents = (raw: string): Option.Option<number> => {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return Option.none()
  }
  if (!/^-?\d+$/.test(trimmed)) {
    return Option.none()
  }
  const value = Number(trimmed)
  if (!Number.isSafeInteger(value)) {
    return Option.none()
  }
  return Option.some(value)
}

/** First-login demo ledger. Manual, read-only, not live Plaid. */
export const demoAccounts = (ownerPrefix: string): ReadonlyArray<Account> => [
  Account.make({
    id: `${ownerPrefix}:checking`,
    name: 'Everyday Checking',
    institution: 'First Demo Bank',
    kind: 'cash',
    currency: 'USD',
    balanceCents: 1_250_000,
    access: 'read_only',
  }),
  Account.make({
    id: `${ownerPrefix}:brokerage`,
    name: 'Taxable Brokerage',
    institution: 'Demo Broker',
    kind: 'brokerage',
    currency: 'USD',
    balanceCents: 8_400_000,
    access: 'read_only',
  }),
  Account.make({
    id: `${ownerPrefix}:mortgage`,
    name: 'Home Mortgage',
    institution: 'Demo Servicer',
    kind: 'liability',
    currency: 'USD',
    balanceCents: 21_000_000,
    access: 'read_only',
  }),
]
