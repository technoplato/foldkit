import { Array, Option, Schema as S, String as Str } from 'effect'
import { NonEmptyString } from 'foldkit/adt'
import { type ActionContext, md } from 'foldkit/message'

import {
  Host,
  type Model,
  OriginFailure,
  Snapshot,
  Token,
  Visibility,
  isSettingsHost,
} from './model.js'

type Context = ActionContext

const isApplying = (model: Model): boolean => model.apply._tag === 'Applying'

const isDrafting = (model: Model): boolean => model.draft._tag === 'Drafting'

const hiddenUnless = (
  _model: Model,
  allowed: boolean,
  reason: string,
): string | undefined => (allowed ? undefined : reason)

/** Reloads Caddy hosts and Access apps. */
export const ClickedRefresh = md('ClickedRefresh', {
  what: 'Reloads hosts and Access',
  why: 'Triggered when the operator asks for a fresh host list',
  keys: ['r'],
  tokens: ['refresh'],
  spoken: ['refresh'],
  command: 'refresh',
  event: 'clicked-refresh',
  mutate: 'apply becomes Applying',
  sideEffects: 'ReadOrigin',
  valid: (model: Model, _context: Context) => !isApplying(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, !isApplying(model), 'already applying'),
})

/** Makes a host Public. Refused for settings. */
export const ClickedPublic = md('ClickedPublic', {
  fields: { host: NonEmptyString },
  what: 'Makes a host Public',
  why: 'Triggered when the operator flips a host to Public',
  tokens: ['public'],
  spoken: ['public'],
  command: 'public',
  event: 'clicked-public',
  mutate: 'apply becomes Applying',
  sideEffects: 'ApplyVisibility',
  valid: (model: Model, _context: Context) => !isApplying(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, !isApplying(model), 'already applying'),
})

/** Makes a host Restricted. */
export const ClickedRestricted = md('ClickedRestricted', {
  fields: { host: NonEmptyString },
  what: 'Makes a host Restricted',
  why: 'Triggered when the operator flips a host to Restricted',
  tokens: ['restricted'],
  spoken: ['restricted'],
  command: 'restricted',
  event: 'clicked-restricted',
  mutate: 'apply becomes Applying',
  sideEffects: 'ApplyVisibility',
  valid: (model: Model, _context: Context) => !isApplying(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, !isApplying(model), 'already applying'),
})

/** Starts an email draft for a Restricted host. */
export const ClickedAddEmail = md('ClickedAddEmail', {
  fields: { host: NonEmptyString },
  what: 'Starts an email draft',
  why: 'Triggered when the operator adds who can open a host',
  tokens: ['add'],
  spoken: ['add'],
  command: 'add',
  event: 'clicked-add-email',
  mutate: 'draft becomes Drafting',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) =>
    !isApplying(model) && !isDrafting(model),
  hiddenBecause: (model: Model) => {
    if (isApplying(model)) {
      return 'already applying'
    }
    if (isDrafting(model)) {
      return 'already drafting'
    }
    return undefined
  },
})

/** Types an email draft. */
export const TypedEmail = md('TypedEmail', {
  fields: { text: S.String },
  what: 'Types an email',
  why: 'Triggered when the operator changes the draft',
  tokens: ['email'],
  spoken: ['email'],
  command: 'email',
  event: 'typed-email',
  mutate: 'draft text',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isDrafting(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isDrafting(model), 'not drafting'),
})

/** Keeps the drafted email and applies Restricted. */
export const AppliedEmail = md('AppliedEmail', {
  what: 'Adds the drafted email',
  why: 'Triggered when the operator keeps the draft',
  keys: ['Enter'],
  tokens: ['keep'],
  spoken: ['keep'],
  command: 'keep',
  event: 'applied-email',
  mutate: 'apply becomes Applying',
  sideEffects: 'ApplyVisibility',
  valid: (model: Model, _context: Context) => {
    if (model.draft._tag !== 'Drafting' || isApplying(model)) {
      return false
    }
    return (
      model.draft.text.includes('@') && !Str.isEmpty(model.draft.text.trim())
    )
  },
  hiddenBecause: (model: Model) => {
    if (model.draft._tag !== 'Drafting') {
      return 'not drafting'
    }
    if (isApplying(model)) {
      return 'already applying'
    }
    if (!model.draft.text.includes('@')) {
      return 'no email'
    }
    return undefined
  },
})

/** Cancels the email draft. */
export const CancelledEmail = md('CancelledEmail', {
  what: 'Cancels the email draft',
  why: 'Triggered when the operator leaves the draft',
  keys: ['Escape'],
  tokens: ['cancel'],
  spoken: ['cancel'],
  command: 'cancel',
  event: 'cancelled-email',
  mutate: 'draft idle',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isDrafting(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isDrafting(model), 'not drafting'),
})

/** Removes an email from a Restricted host. */
export const ClickedRemoveEmail = md('ClickedRemoveEmail', {
  fields: { host: NonEmptyString, email: NonEmptyString },
  what: 'Removes an email',
  why: 'Triggered when the operator removes who can open a host',
  tokens: ['remove'],
  spoken: ['remove'],
  command: 'remove',
  event: 'clicked-remove-email',
  mutate: 'apply becomes Applying',
  sideEffects: 'ApplyVisibility',
  valid: (model: Model, _context: Context) => !isApplying(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, !isApplying(model), 'already applying'),
})

/** Dismisses the notice. */
export const DismissedNotice = md('DismissedNotice', {
  what: 'Dismisses the notice',
  why: 'Triggered when the operator clears a notice',
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

/** Origin read succeeded. */
export const SucceededReadOrigin = md('SucceededReadOrigin', {
  fields: { token: Token, hosts: S.Array(Host) },
  what: 'Records a successful origin read',
  why: 'Triggered when ReadOrigin returns tagged Snapshot',
  command: 'read-origin',
  event: 'succeeded-read-origin',
  mutate: 'hosts and token from snapshot',
  sideEffects: '(none)',
})

/** Origin read failed. */
export const FailedReadOrigin = md('FailedReadOrigin', {
  fields: { reason: OriginFailure },
  what: 'Records a failed origin read',
  why: 'Triggered when ReadOrigin cannot return tagged Snapshot',
  command: 'read-origin',
  event: 'failed-read-origin',
  mutate: 'notice failed',
  sideEffects: '(none)',
})

/** Apply succeeded. */
export const SucceededApply = md('SucceededApply', {
  fields: { token: Token, hosts: S.Array(Host) },
  what: 'Records a successful apply',
  why: 'Triggered when ApplyVisibility returns tagged Snapshot',
  command: 'apply-visibility',
  event: 'succeeded-apply',
  mutate: 'apply becomes Applied',
  sideEffects: '(none)',
})

/** Apply failed. */
export const FailedApply = md('FailedApply', {
  fields: { reason: OriginFailure },
  what: 'Records a failed apply',
  why: 'Triggered when ApplyVisibility is refused or fails',
  command: 'apply-visibility',
  event: 'failed-apply',
  mutate: 'apply becomes Failed',
  sideEffects: '(none)',
})

/** Every Message accepted by the Settings Program. */
export const Message = S.Union([
  ClickedRefresh,
  ClickedPublic,
  ClickedRestricted,
  ClickedAddEmail,
  TypedEmail,
  AppliedEmail,
  CancelledEmail,
  ClickedRemoveEmail,
  DismissedNotice,
  SucceededReadOrigin,
  FailedReadOrigin,
  SucceededApply,
  FailedApply,
])
/** A Settings Message value. */
export type Message = typeof Message.Type

/** Message constructors that screens walk for Actions. */
export const actions = [
  ClickedRefresh,
  AppliedEmail,
  CancelledEmail,
  DismissedNotice,
] as const

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

/** What sentence painted for a CLI token. */
export const whatForToken = (token: string): string => {
  const action = actionByToken(token)
  if (action !== undefined) {
    return action.doc.what
  }
  if (token.startsWith('public:')) {
    return 'Makes a host Public'
  }
  if (token.startsWith('restricted:')) {
    return 'Makes a host Restricted'
  }
  if (token.startsWith('add:')) {
    return 'Starts an email draft'
  }
  if (token.startsWith('remove:')) {
    return 'Removes an email'
  }
  if (token.startsWith('email:')) {
    return 'Types an email'
  }
  return token
}

/**
 * Resolves a screen Button token against the current Model.
 * Parameterized tokens carry their payload after `:`.
 */
export const messageFromToken = (
  token: string,
  model?: Model,
): Message | undefined => {
  const action = actionByToken(token)
  if (action !== undefined) {
    if (model !== undefined && !action.valid(model, {})) {
      return undefined
    }
    return action()
  }
  const maybePublic = afterPrefix(token, 'public:')
  if (Option.isSome(maybePublic)) {
    if (isSettingsHost(maybePublic.value)) {
      return undefined
    }
    return ClickedPublic({ host: NonEmptyString.make(maybePublic.value) })
  }
  const maybeRestricted = afterPrefix(token, 'restricted:')
  if (Option.isSome(maybeRestricted)) {
    return ClickedRestricted({
      host: NonEmptyString.make(maybeRestricted.value),
    })
  }
  const maybeAdd = afterPrefix(token, 'add:')
  if (Option.isSome(maybeAdd)) {
    return ClickedAddEmail({ host: NonEmptyString.make(maybeAdd.value) })
  }
  const maybeEmail = afterPrefix(token, 'email:')
  if (Option.isSome(maybeEmail)) {
    return TypedEmail({ text: maybeEmail.value })
  }
  const maybeRemove = afterPrefix(token, 'remove:')
  if (Option.isSome(maybeRemove)) {
    const [host, email] = maybeRemove.value.split(':', 2)
    if (host === undefined || email === undefined || Str.isEmpty(email)) {
      return undefined
    }
    return ClickedRemoveEmail({
      host: NonEmptyString.make(host),
      email: NonEmptyString.make(email),
    })
  }
  return undefined
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

export { Snapshot, Visibility }
