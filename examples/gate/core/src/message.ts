import { Array, Option, Schema as S } from 'effect'
import { type ActionContext, md } from 'foldkit/message'

import { type Model, OriginFailure, Quota } from './model.js'

// MESSAGE

type Context = ActionContext

const isReading = (model: Model): boolean => model.origin._tag === 'Reading'

/** Records that refresh was clicked. */
export const ClickedRefresh = md('ClickedRefresh', {
  what: 'Reads the origin again',
  why: 'Triggered when the operator asks for a fresh rate and message limit',
  keys: ['r'],
  tokens: ['refresh'],
  spoken: ['refresh'],
  command: 'refresh',
  event: 'clicked-refresh',
  mutate: 'origin becomes Reading',
  sideEffects: 'ReadOrigin',
  valid: (model: Model, _context: Context) => !isReading(model),
  hiddenBecause: (model: Model) =>
    isReading(model) ? 'origin is already reading' : undefined,
})

/** Origin read succeeded. */
export const SucceededReadOrigin = md('SucceededReadOrigin', {
  fields: { rate: Quota, messages: Quota },
  what: 'Records a successful origin read',
  why: 'Triggered when ReadOrigin returns tagged Read',
  command: 'read-origin',
  event: 'succeeded-read-origin',
  mutate: 'origin becomes Read',
  sideEffects: '(none)',
})

/** Origin read failed. */
export const FailedReadOrigin = md('FailedReadOrigin', {
  fields: { reason: OriginFailure },
  what: 'Records a failed origin read',
  why: 'Triggered when ReadOrigin cannot return tagged Read',
  command: 'read-origin',
  event: 'failed-read-origin',
  mutate: 'origin becomes Failed',
  sideEffects: '(none)',
})

/** Every Message accepted by the Gate Program. */
export const Message = S.Union([
  ClickedRefresh,
  SucceededReadOrigin,
  FailedReadOrigin,
])
/** A Gate Message value. */
export type Message = typeof Message.Type

/** Message constructors that screens walk for Actions. */
export const actions = [ClickedRefresh] as const

/** One constructor from {@link actions}. */
export type Action = (typeof actions)[number]

/** Actions a React host may call. */
export type Actions = Readonly<{
  clickedRefresh: () => void
}>

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

/** Key hints painted beside a Button token. */
export const keysForToken = (token: string): ReadonlyArray<string> => {
  const action = actionByToken(token)
  if (action === undefined) {
    return []
  }
  return action.keys ?? []
}

/** What sentence painted for a CLI token. */
export const whatForToken = (token: string): string => {
  const action = actionByToken(token)
  if (action === undefined) {
    return token
  }
  return action.doc.what
}

/** Message for a screen Button token. */
export const messageFromToken = (token: string): Message | undefined => {
  const action = actionByToken(token)
  if (action === undefined) {
    return undefined
  }
  return action()
}

/** Message for a key from Action `keys` metadata. */
export const messageFromKey = (
  key: string,
  model: Model,
  modifiers: Readonly<{ metaKey: boolean; ctrlKey: boolean }> = {
    metaKey: false,
    ctrlKey: false,
  },
): Message | undefined => {
  if (modifiers.metaKey || modifiers.ctrlKey) {
    return undefined
  }
  const normalized = key.toLowerCase()
  const maybeAction = Array.findFirst(
    actions,
    action =>
      Array.contains(action.keys ?? [], normalized) ||
      Array.contains(action.keys ?? [], key),
  )
  if (Option.isNone(maybeAction)) {
    return undefined
  }
  if (!maybeAction.value.valid(model, {})) {
    return undefined
  }
  return maybeAction.value()
}
