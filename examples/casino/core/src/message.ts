import { Array, Option, Schema as S, String as Str } from 'effect'
import { NonEmptyString } from 'foldkit/adt'
import { type ActionContext, md } from 'foldkit/message'
import { ts } from 'foldkit/schema'
import {
  PortfolioSnapshot,
  TransactionRecord,
  WalletFailure,
  WalletProfile,
} from 'wallet-core-example'

import {
  type Model,
  isPlayerUnproven,
  isProofProbing,
  isStripeProbing,
  isUnpaidNone,
  isWalletProbing,
} from './model.js'

type Context = ActionContext

const isDrafting = (model: Model): boolean => model.draft._tag === 'Drafting'

const isIdleDraft = (model: Model): boolean => model.draft._tag === 'Idle'

const isPopulated = (model: Model): boolean =>
  model.questions._tag === 'Populated'

const hiddenUnless = (
  _model: Model,
  allowed: boolean,
  reason: string,
): string | undefined => (allowed ? undefined : reason)

/** Offers the Stripe deposit path. Starts a live origin probe. */
export const ClickedStripe = md('ClickedStripe', {
  what: 'Offers the Stripe deposit path',
  why: 'Triggered when the player chooses Stripe',
  keys: ['s'],
  tokens: ['stripe'],
  spoken: ['stripe'],
  command: 'stripe',
  event: 'clicked-stripe',
  mutate: 'probe Stripe origin',
  sideEffects: 'ProbeStripe',
  valid: (model: Model, _context: Context) => isUnpaidNone(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isUnpaidNone(model), 'deposit already in progress'),
})

/** Offers the existing wallets example as the crypto path. Starts a Live vault. */
export const ClickedWallet = md('ClickedWallet', {
  what: 'Offers the wallet deposit path',
  why: 'Triggered when the player chooses the existing wallets example',
  keys: ['w'],
  tokens: ['wallet'],
  spoken: ['wallet'],
  command: 'wallet',
  event: 'clicked-wallet',
  mutate: 'connect Live wallet vault',
  sideEffects: 'LoadCasinoWallet',
  valid: (model: Model, _context: Context) => isUnpaidNone(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isUnpaidNone(model), 'deposit already in progress'),
})

/** Offers ZK proof of real-world identity. Starts a live verifier probe. */
export const ClickedZkIdentity = md('ClickedZkIdentity', {
  what: 'Offers ZK identity',
  why: 'Triggered when the player asks for a ZK identity proof',
  keys: ['z'],
  tokens: ['zk'],
  spoken: ['zk'],
  command: 'zk',
  event: 'clicked-zk-identity',
  mutate: 'probe ZK identity origin',
  sideEffects: 'ProbeZkIdentity',
  valid: (model: Model, _context: Context) => isPlayerUnproven(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isPlayerUnproven(model), 'player already proven'),
})

/** Offers proof of humanity. Starts a live verifier probe. */
export const ClickedHumanity = md('ClickedHumanity', {
  what: 'Offers proof of humanity',
  why: 'Triggered when the player asks for a humanity proof',
  keys: ['h'],
  tokens: ['humanity'],
  spoken: ['humanity'],
  command: 'humanity',
  event: 'clicked-humanity',
  mutate: 'probe humanity origin',
  sideEffects: 'ProbeHumanity',
  valid: (model: Model, _context: Context) => isPlayerUnproven(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isPlayerUnproven(model), 'player already proven'),
})

/** Offers a fund-cycling agent. Starts a live verifier probe. */
export const ClickedFundCyclingAgent = md('ClickedFundCyclingAgent', {
  what: 'Offers a fund-cycling agent',
  why: 'Triggered when the player asks for a fund-cycling agent',
  keys: ['a'],
  tokens: ['agent'],
  spoken: ['agent'],
  command: 'agent',
  event: 'clicked-fund-cycling-agent',
  mutate: 'probe fund-cycling agent origin',
  sideEffects: 'ProbeFundCyclingAgent',
  valid: (model: Model, _context: Context) => isPlayerUnproven(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isPlayerUnproven(model), 'player already proven'),
})

/** Starts a new public-fact question. */
export const ClickedAddQuestion = md('ClickedAddQuestion', {
  what: 'Starts a new question',
  why: 'Triggered when the player adds a public-fact question',
  keys: ['n'],
  tokens: ['add'],
  spoken: ['add'],
  command: 'add',
  event: 'clicked-add-question',
  mutate: 'draft becomes drafting',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isIdleDraft(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isIdleDraft(model), 'already drafting'),
})

/** Types question draft text. */
export const TypedDraft = md('TypedDraft', {
  fields: { text: S.String },
  what: 'Types a question',
  why: 'Triggered when the player changes the draft',
  tokens: ['draft'],
  spoken: ['draft'],
  command: 'draft',
  event: 'typed-draft',
  mutate: 'draft text',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isDrafting(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isDrafting(model), 'not drafting'),
})

/** Keeps the drafted question. */
export const AppliedDraft = md('AppliedDraft', {
  what: 'Keeps the drafted question',
  why: 'Triggered when the player keeps the draft',
  keys: ['Enter'],
  tokens: ['keep'],
  spoken: ['keep'],
  command: 'keep',
  event: 'applied-draft',
  mutate: 'questions gain a public-fact member',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => {
    if (model.draft._tag !== 'Drafting') {
      return false
    }
    return !Str.isEmpty(model.draft.text)
  },
  hiddenBecause: (model: Model) => {
    if (model.draft._tag !== 'Drafting' || Str.isEmpty(model.draft.text)) {
      return 'no draft text'
    }
    return undefined
  },
})

/** Cancels the question draft. */
export const CancelledDraft = md('CancelledDraft', {
  what: 'Cancels the draft',
  why: 'Triggered when the player leaves the draft',
  keys: ['Escape'],
  tokens: ['cancel'],
  spoken: ['cancel'],
  command: 'cancel',
  event: 'cancelled-draft',
  mutate: 'draft idle',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isDrafting(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isDrafting(model), 'not drafting'),
})

/** Removes a public-fact question. */
export const RequestedRemove = md('RequestedRemove', {
  fields: { questionId: NonEmptyString },
  what: 'Removes a question',
  why: 'Triggered when the player removes a public-fact question',
  tokens: ['remove'],
  spoken: ['remove'],
  command: 'remove',
  event: 'requested-remove',
  mutate: 'question leaves the shelf',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isPopulated(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isPopulated(model), 'no questions'),
})

/** Dismisses the notice. */
export const DismissedNotice = md('DismissedNotice', {
  what: 'Dismisses the notice',
  why: 'Triggered when the player clears a notice',
  tokens: ['dismiss'],
  spoken: ['dismiss'],
  command: 'dismiss',
  event: 'dismissed-notice',
  mutate: 'notice none',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => model.notice._tag === 'Some',
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, model.notice._tag === 'Some', 'no notice'),
})

/** Stripe probe found no charge secret. */
export const FoundStripeUnconfigured = ts('FoundStripeUnconfigured')
/** Stripe probe found a secret. This is not a live charge. */
export const FoundStripeConfigured = ts('FoundStripeConfigured')
/** Stripe probe failed. */
export const FailedProbeStripe = ts('FailedProbeStripe', {
  code: NonEmptyString,
})

/** Vault restored public profiles. */
export const SucceededLoadProfiles = ts('SucceededLoadProfiles', {
  wallets: S.Array(WalletProfile),
})
/** Vault could not restore public profiles. */
export const FailedLoadProfiles = ts('FailedLoadProfiles', {
  code: S.Literals(['Unavailable', 'InvalidKeyMaterial']),
})
/** Vault created a public profile. */
export const SucceededCreateWallet = ts('SucceededCreateWallet', {
  wallet: WalletProfile,
})
/** Vault could not create a public profile. */
export const FailedCreateWallet = ts('FailedCreateWallet', {
  code: S.Literals(['Unavailable', 'InvalidKeyMaterial']),
})
/** Client loaded a public portfolio. */
export const SucceededLoadPortfolio = ts('SucceededLoadPortfolio', {
  wallets: S.Array(WalletProfile),
  portfolio: PortfolioSnapshot,
})
/** Client could not load a public portfolio. */
export const FailedLoadPortfolio = ts('FailedLoadPortfolio', {
  failure: WalletFailure,
})
/** A live adapter observed a public transaction. */
export const ObservedIncoming = ts('ObservedIncoming', {
  transaction: TransactionRecord,
})
/** Observation failed. */
export const FailedObserveIncoming = ts('FailedObserveIncoming', {
  failure: WalletFailure,
})

/** ZK probe found no live verifier. */
export const FoundZkNotConnected = ts('FoundZkNotConnected')
/** ZK verifier succeeded. Do not construct without a live verifier. */
export const SucceededZkIdentity = ts('SucceededZkIdentity')
/** ZK probe failed. */
export const FailedProbeZkIdentity = ts('FailedProbeZkIdentity', {
  code: NonEmptyString,
})

/** Humanity probe found no live verifier. */
export const FoundHumanityNotConnected = ts('FoundHumanityNotConnected')
/** Humanity verifier succeeded. Do not construct without a live verifier. */
export const SucceededHumanity = ts('SucceededHumanity')
/** Humanity probe failed. */
export const FailedProbeHumanity = ts('FailedProbeHumanity', {
  code: NonEmptyString,
})

/** Fund-cycling agent probe found no live verifier. */
export const FoundFundCyclingAgentNotConnected = ts(
  'FoundFundCyclingAgentNotConnected',
)
/** Fund-cycling agent verifier succeeded. Do not construct without a live verifier. */
export const SucceededFundCyclingAgent = ts('SucceededFundCyclingAgent')
/** Fund-cycling agent probe failed. */
export const FailedProbeFundCyclingAgent = ts('FailedProbeFundCyclingAgent', {
  code: NonEmptyString,
})

/** Static Actions projected through Program.valid. */
export const actions = [
  ClickedStripe,
  ClickedWallet,
  ClickedZkIdentity,
  ClickedHumanity,
  ClickedFundCyclingAgent,
  ClickedAddQuestion,
  AppliedDraft,
  CancelledDraft,
  DismissedNotice,
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

const afterPrefix = (token: string, prefix: string): Option.Option<string> => {
  if (!token.startsWith(prefix)) {
    return Option.none()
  }
  const rest = token.slice(prefix.length)
  if (Str.isEmpty(rest)) {
    return Option.none()
  }
  return Option.some(rest)
}

/** Casino Message union. */
export const Message = S.Union([
  ClickedStripe,
  ClickedWallet,
  ClickedZkIdentity,
  ClickedHumanity,
  ClickedFundCyclingAgent,
  ClickedAddQuestion,
  TypedDraft,
  AppliedDraft,
  CancelledDraft,
  RequestedRemove,
  DismissedNotice,
  FoundStripeUnconfigured,
  FoundStripeConfigured,
  FailedProbeStripe,
  SucceededLoadProfiles,
  FailedLoadProfiles,
  SucceededCreateWallet,
  FailedCreateWallet,
  SucceededLoadPortfolio,
  FailedLoadPortfolio,
  ObservedIncoming,
  FailedObserveIncoming,
  FoundZkNotConnected,
  SucceededZkIdentity,
  FailedProbeZkIdentity,
  FoundHumanityNotConnected,
  SucceededHumanity,
  FailedProbeHumanity,
  FoundFundCyclingAgentNotConnected,
  SucceededFundCyclingAgent,
  FailedProbeFundCyclingAgent,
])
/** Casino Message union. */
export type Message = typeof Message.Type

/** CLI what-sentence for a token on the current tree. */
export const whatForToken = (token: string): string => {
  const action = actionByToken(token)
  if (action !== undefined) {
    return action.doc.what
  }
  if (token.startsWith('draft:')) {
    return 'Types a question'
  }
  if (token.startsWith('remove:')) {
    return 'Removes a question'
  }
  return token
}

/**
 * Resolves a screen Button token against the current Model.
 * Parameterized tokens carry their payload after `:`.
 */
export const messageFromToken = (
  token: string,
  model: Model,
): Message | undefined => {
  const action = actionByToken(token)
  if (action !== undefined) {
    if (!action.valid(model, {})) {
      return undefined
    }
    return action()
  }
  const maybeDraft = afterPrefix(token, 'draft:')
  if (Option.isSome(maybeDraft)) {
    return TypedDraft({ text: maybeDraft.value })
  }
  const maybeRemove = afterPrefix(token, 'remove:')
  if (Option.isSome(maybeRemove)) {
    return RequestedRemove({
      questionId: NonEmptyString.make(maybeRemove.value),
    })
  }
  return undefined
}

export {
  isDrafting,
  isIdleDraft,
  isPopulated,
  isProofProbing,
  isStripeProbing,
  isWalletProbing,
}
