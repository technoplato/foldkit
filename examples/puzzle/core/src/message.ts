import { Array, Option, Schema as S } from 'effect'
import { type ActionContext, md } from 'foldkit/message'

import { type Model } from './model.js'

// MESSAGE

type Context = ActionContext

const hasTape = (model: Model): boolean =>
  Option.isSome(Array.head(model.tape)) || model.prompt._tag !== 'LabelStep'

const isLabelPrompt = (model: Model): boolean =>
  model.prompt._tag === 'LabelStep'

const operatorPhase = (model: Model): string | undefined => {
  if (model.prompt._tag !== 'OperatorStep') {
    return undefined
  }
  return model.prompt.phase._tag
}

/** Records yes on the current label. */
export const GuessedYes = md('GuessedYes', {
  what: 'Records yes on the current label',
  why: 'Triggered when the player guesses yes',
  keys: ['y', '+', '='],
  tokens: ['yes'],
  spoken: ['yes'],
  command: 'guess-yes',
  event: 'guessed-yes',
  mutate: 'tape appends GuessStep answer y',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isLabelPrompt(model),
  hiddenBecause: (model: Model) =>
    isLabelPrompt(model) ? undefined : 'prompt is the Operator flow',
})

/** Records no on the current label. */
export const GuessedNo = md('GuessedNo', {
  what: 'Records no on the current label',
  why: 'Triggered when the player guesses no',
  keys: ['n', '-'],
  tokens: ['no'],
  spoken: ['no'],
  command: 'guess-no',
  event: 'guessed-no',
  mutate: 'tape appends GuessStep answer n',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isLabelPrompt(model),
  hiddenBecause: (model: Model) =>
    isLabelPrompt(model) ? undefined : 'prompt is the Operator flow',
})

/** Requests a hint on the current label. */
export const RequestedHint = md('RequestedHint', {
  what: 'Requests a hint on the current label',
  why: 'Triggered when the player asks for a hash-tape hint',
  keys: ['h', '?'],
  tokens: ['hint'],
  spoken: ['hint'],
  command: 'hint',
  event: 'requested-hint',
  mutate: 'tape appends HintStep',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isLabelPrompt(model),
  hiddenBecause: (model: Model) =>
    isLabelPrompt(model) ? undefined : 'prompt is the Operator flow',
})

/** Starts the grok.knophy.com Operator flow. */
export const PostedOperator = md('PostedOperator', {
  what: 'Posts the Operator identity payload',
  why: 'Triggered when the player starts the grok.knophy.com flow',
  keys: ['o'],
  tokens: ['operator'],
  spoken: ['operator'],
  command: 'operator-post',
  event: 'posted-operator',
  mutate: 'prompt becomes OperatorPosted',
  sideEffects: 'post fans out identity and returns URLs',
  valid: (model: Model, _context: Context) => isLabelPrompt(model),
  hiddenBecause: (model: Model) =>
    isLabelPrompt(model) ? undefined : 'Operator is already in progress',
})

/** Operator `post()` returned URLs. */
export const SucceededOperatorUrls = md('SucceededOperatorUrls', {
  what: 'Records URLs returned by Operator post',
  why: 'Triggered when post finishes fanning out identity',
  tokens: ['operator-opened'],
  spoken: ['operator opened'],
  command: 'operator-opened',
  event: 'succeeded-operator-urls',
  mutate: 'prompt becomes OperatorOpened',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) =>
    operatorPhase(model) === 'OperatorPosted',
  hiddenBecause: (model: Model) =>
    operatorPhase(model) === 'OperatorPosted'
      ? undefined
      : 'Operator has not posted',
})

/** Observes Operator websocket analytics and logs. */
export const ObservedOperator = md('ObservedOperator', {
  what: 'Observes Operator analytics and logs',
  why: 'Triggered when the player watches the Operator websocket',
  keys: ['w'],
  tokens: ['observe'],
  spoken: ['observe'],
  command: 'operator-observe',
  event: 'observed-operator',
  mutate: 'prompt becomes OperatorObserved',
  sideEffects: 'websocket observe analytics and logs',
  valid: (model: Model, _context: Context) =>
    operatorPhase(model) === 'OperatorOpened',
  hiddenBecause: (model: Model) =>
    operatorPhase(model) === 'OperatorOpened'
      ? undefined
      : 'Operator URLs are not open',
})

/** `[operator-verify]` email accepted. */
export const SucceededOperatorVerify = md('SucceededOperatorVerify', {
  what: 'Verifies the Operator email',
  why: 'Triggered when [operator-verify] accepts the Knophy mailbox',
  keys: ['v'],
  tokens: ['verify'],
  spoken: ['verify'],
  command: 'operator-verify',
  event: 'succeeded-operator-verify',
  mutate: 'prompt becomes OperatorVerified',
  sideEffects: '[operator-verify] email',
  valid: (model: Model, _context: Context) =>
    operatorPhase(model) === 'OperatorObserved',
  hiddenBecause: (model: Model) =>
    operatorPhase(model) === 'OperatorObserved'
      ? undefined
      : 'Operator has not been observed',
})

/** `[operator-dispatch]` finished. */
export const SucceededOperatorDispatch = md('SucceededOperatorDispatch', {
  what: 'Dispatches the Operator',
  why: 'Triggered when [operator-dispatch] settles',
  keys: ['d'],
  tokens: ['dispatch'],
  spoken: ['dispatch'],
  command: 'operator-dispatch',
  event: 'succeeded-operator-dispatch',
  mutate: 'tape appends OperatorDispatched',
  sideEffects: '[operator-dispatch]',
  valid: (model: Model, _context: Context) =>
    operatorPhase(model) === 'OperatorVerified',
  hiddenBecause: (model: Model) =>
    operatorPhase(model) === 'OperatorVerified'
      ? undefined
      : 'Operator has not been verified',
})

/** Operator command failed. */
export const FailedOperator = md('FailedOperator', {
  fields: { reason: S.String },
  what: 'Records an Operator command failure',
  why: 'Triggered when post, observe, verify, or dispatch fails',
  tokens: ['operator-failed'],
  spoken: ['operator failed'],
  command: 'operator-failed',
  event: 'failed-operator',
  mutate: '(none)',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) =>
    model.prompt._tag === 'OperatorStep',
  hiddenBecause: (model: Model) =>
    model.prompt._tag === 'OperatorStep'
      ? undefined
      : 'Operator is not in progress',
})

/** Opens the self-replicate script and page. */
export const OpenedReplicate = md('OpenedReplicate', {
  what: 'Opens the self-replicate script',
  why: 'Triggered when the player asks how to download and run Puzzle',
  tokens: ['replicate'],
  spoken: ['replicate'],
  command: 'replicate',
  event: 'opened-replicate',
  mutate: 'prompt becomes ReplicateStep',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isLabelPrompt(model),
  hiddenBecause: (model: Model) =>
    isLabelPrompt(model)
      ? undefined
      : 'prompt is the replicate script or Operator',
})

/** Clears the tape back to the first label. */
export const ResetTape = md('ResetTape', {
  what: 'Clears the tape',
  why: 'Triggered when the player starts over',
  keys: ['r'],
  tokens: ['reset'],
  spoken: ['reset'],
  command: 'reset',
  event: 'reset-tape',
  mutate: 'tape is empty and prompt is next',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => hasTape(model),
  hiddenBecause: (model: Model) =>
    hasTape(model) ? undefined : 'tape is already empty',
})

/** Every Message accepted by the Puzzle Program. */
export const Message = S.Union([
  GuessedYes,
  GuessedNo,
  RequestedHint,
  PostedOperator,
  SucceededOperatorUrls,
  ObservedOperator,
  SucceededOperatorVerify,
  SucceededOperatorDispatch,
  FailedOperator,
  OpenedReplicate,
  ResetTape,
])
/** A Puzzle Message value. */
export type Message = typeof Message.Type

/** Message constructors that `show` walks for ACTIONS. */
export const actions = [
  GuessedYes,
  GuessedNo,
  RequestedHint,
  PostedOperator,
  OpenedReplicate,
  ObservedOperator,
  SucceededOperatorVerify,
  SucceededOperatorDispatch,
  ResetTape,
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
