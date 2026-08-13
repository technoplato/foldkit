import { Effect, Match as M, Option, Schema as S, pipe } from 'effect'
import { Route } from 'foldkit'
import {
  caseOf,
  literal,
  oneOfCases,
  r,
  root,
  slash,
  string,
} from 'foldkit/route'
import { type Url, fromString } from 'foldkit/url'

import {
  Accounts,
  ImportIdle,
  type Model,
  ReaderAudio,
  ReaderBoth,
  ReaderText,
  type Screen,
  Search,
  Settings,
  SignedOut,
  itemById,
  shelfForItems,
} from './model.js'

/** Opens the signed-in shelf. */
export const ShelfTarget = S.TaggedStruct('ShelfTarget', {})
/** Opens one book in the text pane. */
export const BookTextTarget = S.TaggedStruct('BookTextTarget', {
  itemId: S.String,
})
/** Opens one book in the audio pane. */
export const BookAudioTarget = S.TaggedStruct('BookAudioTarget', {
  itemId: S.String,
})
/** Opens one book in the default both pane. */
export const BookBothTarget = S.TaggedStruct('BookBothTarget', {
  itemId: S.String,
})
/** Opens search. */
export const SearchTarget = S.TaggedStruct('SearchTarget', {})
/** Opens people. */
export const PeopleTarget = S.TaggedStruct('PeopleTarget', {})
/** Opens settings. */
export const SettingsTarget = S.TaggedStruct('SettingsTarget', {})
/** Opens import. */
export const ImportTarget = S.TaggedStruct('ImportTarget', {})

/** Every portable books destination accepted by the Program. */
export const NavigationTarget = S.Union([
  ShelfTarget,
  BookTextTarget,
  BookAudioTarget,
  BookBothTarget,
  SearchTarget,
  PeopleTarget,
  SettingsTarget,
  ImportTarget,
])
/** Every portable books destination accepted by the Program. */
export type NavigationTarget = typeof NavigationTarget.Type

const NotFoundRoute = r('NotFoundRoute', { path: S.String })

const emptyPrint = {
  segments: [] as ReadonlyArray<string>,
  queryParams: [] as ReadonlyArray<readonly [string, string]>,
}

const shelfParser = oneOfCases<NavigationTarget>(
  caseOf<NavigationTarget, {}>(literal('shelf'), {
    embed: () => ShelfTarget.make({}),
    extract: () => Option.none(),
  }),
  caseOf<NavigationTarget, {}>(root, {
    embed: () => ShelfTarget.make({}),
    extract: target =>
      target._tag === 'ShelfTarget' ? Option.some({}) : Option.none(),
  }),
  caseOf<NavigationTarget, Readonly<{ itemId: string }>>(
    pipe(literal('book'), slash(string('itemId')), slash(literal('text'))),
    {
      embed: ({ itemId }) => BookTextTarget.make({ itemId }),
      extract: target =>
        target._tag === 'BookTextTarget'
          ? Option.some({ itemId: target.itemId })
          : Option.none(),
    },
  ),
  caseOf<NavigationTarget, Readonly<{ itemId: string }>>(
    pipe(literal('book'), slash(string('itemId')), slash(literal('audio'))),
    {
      embed: ({ itemId }) => BookAudioTarget.make({ itemId }),
      extract: target =>
        target._tag === 'BookAudioTarget'
          ? Option.some({ itemId: target.itemId })
          : Option.none(),
    },
  ),
  caseOf<NavigationTarget, Readonly<{ itemId: string }>>(
    pipe(literal('book'), slash(string('itemId')), slash(literal('both'))),
    {
      embed: ({ itemId }) => BookBothTarget.make({ itemId }),
      extract: () => Option.none(),
    },
  ),
  caseOf<NavigationTarget, Readonly<{ itemId: string }>>(
    pipe(literal('book'), slash(string('itemId'))),
    {
      embed: ({ itemId }) => BookBothTarget.make({ itemId }),
      extract: target =>
        target._tag === 'BookBothTarget'
          ? Option.some({ itemId: target.itemId })
          : Option.none(),
    },
  ),
  caseOf<NavigationTarget, {}>(literal('search'), {
    embed: () => SearchTarget.make({}),
    extract: target =>
      target._tag === 'SearchTarget' ? Option.some({}) : Option.none(),
  }),
  caseOf<NavigationTarget, {}>(literal('people'), {
    embed: () => PeopleTarget.make({}),
    extract: target =>
      target._tag === 'PeopleTarget' ? Option.some({}) : Option.none(),
  }),
  caseOf<NavigationTarget, {}>(literal('settings'), {
    embed: () => SettingsTarget.make({}),
    extract: target =>
      target._tag === 'SettingsTarget' ? Option.some({}) : Option.none(),
  }),
  caseOf<NavigationTarget, {}>(literal('import'), {
    embed: () => ImportTarget.make({}),
    extract: target =>
      target._tag === 'ImportTarget' ? Option.some({}) : Option.none(),
  }),
)

const urlToRoute = Route.parseUrlWithFallback(shelfParser, NotFoundRoute)
const absoluteCarrierPattern = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//u

/** Parses a host URL into a semantic target with no secrets. */
export const urlToNavigationTarget = (url: Url): NavigationTarget =>
  M.value(urlToRoute(url)).pipe(
    M.withReturnType<NavigationTarget>(),
    M.tagsExhaustive({
      ShelfTarget: target => target,
      BookTextTarget: target => target,
      BookAudioTarget: target => target,
      BookBothTarget: target => target,
      SearchTarget: target => target,
      PeopleTarget: target => target,
      SettingsTarget: target => target,
      ImportTarget: target => target,
      NotFoundRoute: () => ShelfTarget.make({}),
    }),
  )

/** Parses a relative path or host carrier into a semantic navigation target. */
export const pathToNavigationTarget = (
  pathOrCarrier: string,
): NavigationTarget => {
  const relativePath = pathOrCarrier.startsWith('/')
    ? pathOrCarrier
    : `/${pathOrCarrier}`
  const carrier = absoluteCarrierPattern.test(pathOrCarrier)
    ? pathOrCarrier
    : `https://books.invalid${relativePath}`
  const maybeUrl = fromString(carrier)
  return Option.isSome(maybeUrl)
    ? urlToNavigationTarget(maybeUrl.value)
    : ShelfTarget.make({})
}

/** Prints a semantic target as a portable relative URI. */
export const navigationTargetToPath = (target: NavigationTarget): string => {
  const printed = Effect.runSync(shelfParser.print(target, emptyPrint))
  const path = `/${printed.segments.join('/')}`
  return path === '//' ? '/' : path
}

/** Prints current screen state as its semantic URL projection. */
export const screenToPath = (screen: Screen): string =>
  navigationTargetToPath(navigationTargetForScreen(screen))

/** Projects a screen onto the destination it prints. */
export const navigationTargetForScreen = (screen: Screen): NavigationTarget =>
  M.value(screen).pipe(
    M.withReturnType<NavigationTarget>(),
    M.tagsExhaustive({
      SignedOut: () => ShelfTarget.make({}),
      ShelfEmpty: () => ShelfTarget.make({}),
      ShelfBrowse: () => ShelfTarget.make({}),
      ReaderText: ({ itemId }) => BookTextTarget.make({ itemId }),
      ReaderAudio: ({ itemId }) => BookAudioTarget.make({ itemId }),
      ReaderBoth: ({ itemId }) => BookBothTarget.make({ itemId }),
      ImportIdle: () => ImportTarget.make({}),
      ImportScanning: () => ImportTarget.make({}),
      Settings: () => SettingsTarget.make({}),
      Accounts: () => PeopleTarget.make({}),
      Search: () => SearchTarget.make({}),
    }),
  )

const screenForTarget = (model: Model, target: NavigationTarget): Screen =>
  M.value(target).pipe(
    M.withReturnType<Screen>(),
    M.tagsExhaustive({
      ShelfTarget: () =>
        model.screen._tag === 'SignedOut'
          ? SignedOut()
          : shelfForItems(model.items),
      BookTextTarget: ({ itemId }) => ReaderText({ itemId }),
      BookAudioTarget: ({ itemId }) => ReaderAudio({ itemId }),
      BookBothTarget: ({ itemId }) => ReaderBoth({ itemId }),
      SearchTarget: () =>
        model.screen._tag === 'Search' ? model.screen : Search({ query: '' }),
      PeopleTarget: () => Accounts(),
      SettingsTarget: () => Settings(),
      ImportTarget: () =>
        model.screen._tag === 'ImportScanning' ? model.screen : ImportIdle(),
    }),
  )

/** Applies one destination to Model.screen without executing a side effect. */
export const applyNavigationTarget = (
  model: Model,
  target: NavigationTarget,
): Model => {
  if (
    (target._tag === 'BookTextTarget' ||
      target._tag === 'BookAudioTarget' ||
      target._tag === 'BookBothTarget') &&
    itemById(model.items, target.itemId) === undefined
  ) {
    return {
      ...model,
      screen:
        model.screen._tag === 'SignedOut'
          ? SignedOut()
          : shelfForItems(model.items),
    }
  }
  return { ...model, screen: screenForTarget(model, target) }
}
