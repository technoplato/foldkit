import { Array, Option, Schema as S } from 'effect'
import { type ActionContext, m, md } from 'foldkit/message'

import {
  AccountKind,
  CadenceTag,
  NotifyChannel,
  Screen,
  Snapshot,
  VaultOrigin,
} from './domain.js'
import { type Model } from './model.js'

type Context = ActionContext

const signedIn = (model: Model): boolean =>
  model.session._tag === 'Authenticated'

const idle = (model: Model): boolean => model.status === 'idle'

const canMutate = (model: Model): boolean => signedIn(model) && idle(model)

/** Restores Instant / memory session on boot. */
export const RequestedRestore = md('RequestedRestore', {
  what: 'Loads the current Ledger session and snapshot',
  why: 'Init must not read files or Instant directly',
  tokens: ['restore'],
  command: 'restore',
  event: 'restored',
  sideEffects: 'Ledger.restore',
  valid: (model: Model, _context: Context) => idle(model),
})

/** Email login. Hosts pass a parsed email; core still re-validates. */
export const RequestedLogin = md('RequestedLogin', {
  fields: { email: S.String },
  what: 'Opens a Free session for one email',
  why: 'The product is login-gated',
  tokens: ['login'],
  command: 'login',
  event: 'session-opened',
  sideEffects: 'Ledger.login',
  valid: (model: Model, _context: Context) =>
    model.session._tag === 'Anonymous' && idle(model),
})

/** Signs out and drops the local session handle. */
export const RequestedLogout = md('RequestedLogout', {
  what: 'Closes the current session',
  why: 'The user asked to sign out',
  tokens: ['logout'],
  command: 'logout',
  event: 'session-closed',
  sideEffects: 'Ledger.logout',
  valid: (model: Model, _context: Context) => signedIn(model) && idle(model),
})

/** Navigates to one sitemap surface. Anonymous hosts stay on sign-in. */
export const RequestedOpen = md('RequestedOpen', {
  fields: { screen: Screen },
  what: 'Opens one app surface',
  why: 'CLI tokens and Expo tabs map to sitemap URIs',
  tokens: [
    'dashboard',
    'accounts',
    'vault',
    'radar',
    'chat',
    'more',
    'sign-in',
  ],
  command: 'open',
  event: 'opened',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => idle(model),
})

/** Adds a manual read-only account. */
export const RequestedAddAccount = md('RequestedAddAccount', {
  fields: {
    name: S.String,
    institution: S.String,
    kind: AccountKind,
    balanceCents: S.Number,
  },
  what: 'Adds one manual read-only account',
  why: 'This slice has no live Plaid or SnapTrade',
  tokens: ['add-account'],
  command: 'add-account',
  event: 'account-added',
  mutate: 'accounts append read_only row',
  sideEffects: 'Ledger.addAccount',
  valid: canMutate,
})

/** Adds a vault stub. */
export const RequestedAddVault = md('RequestedAddVault', {
  fields: { title: S.String, origin: VaultOrigin },
  what: 'Files one vault document stub',
  why: 'Chat and Research artifacts persist here',
  tokens: ['add-vault'],
  command: 'add-vault',
  event: 'document-uploaded',
  sideEffects: 'Ledger.addVault',
  valid: canMutate,
})

/** Arms a standing Radar job. */
export const RequestedArmRadar = md('RequestedArmRadar', {
  fields: {
    question: S.String,
    cadence: CadenceTag,
    everyMinutes: S.Number,
  },
  what: 'Arms one standing Radar job',
  why: 'Radar speaks later only when the answer hash changes',
  tokens: ['arm-radar'],
  command: 'arm-radar',
  event: 'radar-armed',
  sideEffects: 'Ledger.armRadar',
  valid: canMutate,
})

/** Runs every armed Radar job against the live ledger. */
export const RequestedRadarTick = md('RequestedRadarTick', {
  what: 'Recomputes armed Radar answers',
  why: 'Notify only when the answer hash changes',
  tokens: ['tick-radar'],
  command: 'tick-radar',
  event: 'finding-raised',
  sideEffects: 'Ledger.tickRadar + Notifier.enqueue',
  valid: canMutate,
})

/** Enqueues a local / in-app notification. */
export const RequestedNotify = md('RequestedNotify', {
  fields: {
    title: S.String,
    body: S.String,
    channel: NotifyChannel,
  },
  what: 'Enqueues one notification',
  why: 'CLI and Expo must share the same notify Message',
  tokens: ['notify'],
  command: 'notify',
  event: 'notification-enqueued',
  sideEffects: 'Notifier.enqueue',
  valid: canMutate,
})

/** Sends a chat turn grounded in the ledger. */
export const RequestedChat = md('RequestedChat', {
  fields: { text: S.String },
  what: 'Asks the CFO a question grounded in live accounts',
  why: 'Chat is not a search box over transactions',
  tokens: ['send-chat'],
  command: 'send-chat',
  event: 'chat-message-sent',
  sideEffects: 'Ledger.sendChat',
  valid: canMutate,
})

/** Ledger write succeeded. */
export const SucceededSnapshot = m('SucceededSnapshot', { snapshot: Snapshot })

/** Ledger or notifier failed. */
export const FailedLedger = m('FailedLedger', { error: S.String })

/** Every Message accepted by the Personal CFO Program. */
export const Message = S.Union([
  RequestedRestore,
  RequestedLogin,
  RequestedLogout,
  RequestedOpen,
  RequestedAddAccount,
  RequestedAddVault,
  RequestedArmRadar,
  RequestedRadarTick,
  RequestedNotify,
  RequestedChat,
  SucceededSnapshot,
  FailedLedger,
])
/** Every Message accepted by the Personal CFO Program. */
export type Message = typeof Message.Type

/** User-facing constructors that `valid` and CLI tokens walk. */
export const actions = [
  RequestedRestore,
  RequestedLogin,
  RequestedLogout,
  RequestedOpen,
  RequestedAddAccount,
  RequestedAddVault,
  RequestedArmRadar,
  RequestedRadarTick,
  RequestedNotify,
  RequestedChat,
] as const

/** One constructor from {@link actions}. */
export type Action = (typeof actions)[number]

/** Finds a constructor by its CLI token. */
export const actionByToken = (token: string): Action | undefined => {
  const maybeAction = Array.findFirst(actions, action =>
    Array.contains(action.tokens ?? [], token),
  )
  if (Option.isSome(maybeAction)) {
    return maybeAction.value
  }
  return undefined
}

/** Token printed for a constructor. */
export const tokenOf = (action: Action): string =>
  Option.getOrElse(Array.head(action.tokens ?? []), () => action.command ?? '')
