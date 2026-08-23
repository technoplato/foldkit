import { Array, Option, Schema as S, String as Str } from 'effect'
import { type ActionContext, md } from 'foldkit/message'

import {
  Article,
  BookmarkId,
  Category,
  Other,
  Place,
  Recipe,
  Restaurant,
  Show,
  mapClassifierOutput,
} from './domain/index.js'
import { type Model } from './model.js'

type Context = ActionContext

const isShelf = (model: Model): boolean => model.capture._tag === 'Idle'

const isDrafting = (model: Model): boolean => model.capture._tag === 'Drafting'

const isSearching = (model: Model): boolean =>
  model.library.looking._tag === 'Searching'

const isConfirming = (model: Model): boolean =>
  model.library._tag === 'Populated' &&
  model.library.deleting._tag === 'Confirming'

const isPopulated = (model: Model): boolean =>
  model.library._tag === 'Populated'

const hiddenUnless = (
  _model: Model,
  allowed: boolean,
  reason: string,
): string | undefined => (allowed ? undefined : reason)

/** Starts a pasted capture. */
export const ClickedCaptureOther = md('ClickedCaptureOther', {
  what: 'Starts a pasted capture',
  why: 'Triggered when the player pastes other text',
  keys: ['o'],
  tokens: ['capture'],
  spoken: ['capture'],
  command: 'capture',
  event: 'clicked-capture-other',
  mutate: 'capture becomes drafting',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isShelf(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isShelf(model), 'already capturing'),
})

/** Starts a video capture. */
export const ClickedCaptureVideo = md('ClickedCaptureVideo', {
  what: 'Starts a video capture',
  why: 'Triggered when the player saves a TikTok or video',
  keys: ['v'],
  tokens: ['video'],
  spoken: ['video'],
  command: 'video',
  event: 'clicked-capture-video',
  mutate: 'notice or video draft',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isShelf(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isShelf(model), 'already capturing'),
})

/** Reads X bookmarks. */
export const ClickedCaptureX = md('ClickedCaptureX', {
  what: 'Reads X bookmarks',
  why: 'Triggered when the player asks for the signed-in X session',
  keys: ['x'],
  tokens: ['x'],
  spoken: ['x'],
  command: 'x',
  event: 'clicked-capture-x',
  mutate: 'notice when unsigned',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isShelf(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isShelf(model), 'already capturing'),
})

/** Types capture draft text. */
export const TypedDraft = md('TypedDraft', {
  fields: { text: S.String },
  what: 'Types a capture',
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

/** Applies the capture draft. */
export const AppliedDraft = md('AppliedDraft', {
  what: 'Applies the capture',
  why: 'Triggered when the player keeps the draft',
  keys: ['Enter'],
  tokens: ['apply'],
  spoken: ['apply'],
  command: 'apply',
  event: 'applied-draft',
  mutate: 'library gains a classified bookmark',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => {
    if (model.capture._tag !== 'Drafting') {
      return false
    }
    return !Str.isEmpty(model.capture.text)
  },
  hiddenBecause: (model: Model) => {
    if (model.capture._tag !== 'Drafting' || Str.isEmpty(model.capture.text)) {
      return 'no draft text'
    }
    return undefined
  },
})

/** Cancels the capture draft. */
export const CancelledDraft = md('CancelledDraft', {
  what: 'Cancels the capture',
  why: 'Triggered when the player leaves the draft',
  keys: ['Escape'],
  tokens: ['cancel'],
  spoken: ['cancel'],
  command: 'cancel',
  event: 'cancelled-draft',
  mutate: 'capture idle',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isDrafting(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isDrafting(model), 'not drafting'),
})

/** Types a shelf search query. */
export const TypedSearch = md('TypedSearch', {
  fields: { query: S.String },
  what: 'Types a search query',
  why: 'Triggered when the player searches the shelf',
  tokens: ['search'],
  spoken: ['search'],
  command: 'search',
  event: 'typed-search',
  mutate: 'looking idle or searching',
  sideEffects: '(none)',
  valid: () => true,
})

/** Clears the search query. */
export const ClearedSearch = md('ClearedSearch', {
  what: 'Clears search',
  why: 'Triggered when the player leaves searching',
  tokens: ['clear-search'],
  spoken: ['clear search'],
  command: 'clear-search',
  event: 'cleared-search',
  mutate: 'looking idle',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isSearching(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isSearching(model), 'not searching'),
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

/** Asks to delete a library member. */
export const RequestedDelete = md('RequestedDelete', {
  fields: { bookmarkId: BookmarkId },
  what: 'Asks to delete a library member',
  why: 'Triggered when the player starts delete',
  tokens: ['delete'],
  spoken: ['delete'],
  command: 'delete',
  event: 'requested-delete',
  mutate: 'deleting becomes confirming',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => {
    if (model.library._tag !== 'Populated') {
      return false
    }
    return model.library.deleting._tag === 'Idle'
  },
  hiddenBecause: (model: Model) => {
    if (
      model.library._tag !== 'Populated' ||
      model.library.deleting._tag !== 'Idle'
    ) {
      return 'not idle on a populated shelf'
    }
    return undefined
  },
})

/** Cancels delete confirmation. */
export const CancelledDelete = md('CancelledDelete', {
  what: 'Cancels delete',
  why: 'Triggered when the player leaves confirming',
  tokens: ['cancel-delete'],
  spoken: ['cancel delete'],
  command: 'cancel-delete',
  event: 'cancelled-delete',
  mutate: 'deleting becomes idle',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isConfirming(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isConfirming(model), 'not confirming delete'),
})

/** Confirms delete of the held member. */
export const ConfirmedDelete = md('ConfirmedDelete', {
  what: 'Deletes the confirming member',
  why: 'Triggered when the player confirms delete',
  tokens: ['confirm-delete'],
  spoken: ['confirm delete'],
  command: 'confirm-delete',
  event: 'confirmed-delete',
  mutate: 'member leaves the library',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isConfirming(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isConfirming(model), 'not confirming delete'),
})

/** Shows every category. */
export const ClearedFilter = md('ClearedFilter', {
  what: 'Shows every category',
  why: 'Triggered when the player clears the filter',
  tokens: ['all'],
  spoken: ['all'],
  command: 'all',
  event: 'cleared-filter',
  mutate: 'filter all',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => model.filter._tag === 'Only',
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, model.filter._tag === 'Only', 'already showing all'),
})

/** Shows one category. */
export const ChoseFilter = md('ChoseFilter', {
  fields: { category: S.String },
  what: 'Shows one category',
  why: 'Triggered when the player filters the shelf',
  tokens: ['filter'],
  spoken: ['filter'],
  command: 'filter',
  event: 'chose-filter',
  mutate: 'filter only',
  sideEffects: '(none)',
  valid: () => true,
})

/** Static Actions projected through Program.valid. */
export const actions = [
  ClickedCaptureOther,
  ClickedCaptureVideo,
  ClickedCaptureX,
  AppliedDraft,
  CancelledDraft,
  ClearedSearch,
  DismissedNotice,
  CancelledDelete,
  ConfirmedDelete,
  ClearedFilter,
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

const categoryOf = (name: string): Category => mapClassifierOutput(name)

/** Ingest Message union. */
export const Message = S.Union([
  ClickedCaptureOther,
  ClickedCaptureVideo,
  ClickedCaptureX,
  TypedDraft,
  AppliedDraft,
  CancelledDraft,
  TypedSearch,
  ClearedSearch,
  DismissedNotice,
  RequestedDelete,
  CancelledDelete,
  ConfirmedDelete,
  ClearedFilter,
  ChoseFilter,
])
/** Ingest Message union. */
export type Message = typeof Message.Type

/** CLI what-sentence for a token on the current tree. */
export const whatForToken = (token: string): string => {
  const action = actionByToken(token)
  if (action !== undefined) {
    return action.doc.what
  }
  if (token.startsWith('draft:')) {
    return 'Types a capture'
  }
  if (token.startsWith('search:')) {
    return 'Types a search query'
  }
  if (token.startsWith('delete:')) {
    return 'Asks to delete a library member'
  }
  if (token.startsWith('filter:')) {
    return 'Shows one category'
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
  const maybeSearch = afterPrefix(token, 'search:')
  if (Option.isSome(maybeSearch)) {
    return TypedSearch({ query: maybeSearch.value })
  }
  const maybeDelete = afterPrefix(token, 'delete:')
  if (Option.isSome(maybeDelete)) {
    return RequestedDelete({
      bookmarkId: BookmarkId.make(maybeDelete.value),
    })
  }
  const maybeFilter = afterPrefix(token, 'filter:')
  if (Option.isSome(maybeFilter)) {
    return ChoseFilter({ category: maybeFilter.value })
  }
  return undefined
}

export {
  categoryOf,
  isConfirming,
  isDrafting,
  isPopulated,
  isSearching,
  isShelf,
  Recipe,
  Restaurant,
  Place,
  Show,
  Article,
  Other,
}
