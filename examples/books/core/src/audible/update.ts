import {
  Array,
  Effect,
  Match as M,
  Option,
  Redacted,
  Schema as S,
  String,
} from 'effect'
import { Command } from 'foldkit'
import { ts } from 'foldkit/schema'

import {
  ConnectedAudible,
  FailedConnectAudible,
  type Message,
  PastedAddress,
} from './message.js'
import {
  type AudibleModel,
  type SignIn,
  SignInConnecting,
  SignInReady,
  SignInStuck,
  SignInWaiting,
  type Titles,
  TitlesImported,
  TitlesImporting,
  TitlesRead,
  TitlesUnread,
  TitlesUnreadable,
  isSelected,
  newAsinsOf,
} from './model.js'
import { AddressMismatch, type AudibleProblem } from './problem.js'
import { AudibleImport } from './service.js'
import type { Asin } from './title.js'

// COMMAND

/**
 * Finishes the Amazon sign-in with the pasted address: the Books server
 * registers this device for the family member and saves the login,
 * encrypted. A refusal becomes FailedConnectAudible with its problem, so a
 * wrong paste never crashes the page.
 */
export const FinishAudibleSignIn = Command.define(
  'FinishAudibleSignIn',
  { address: PastedAddress },
  ConnectedAudible,
  FailedConnectAudible,
)(({ address }) =>
  Effect.gen(function* () {
    const audible = yield* AudibleImport
    yield* audible.finishSignIn(address)
    return ConnectedAudible()
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedConnectAudible({ problem: error.problem })),
    ),
  ),
)

// OUT

/** The titles need an Audible login first: Books shows the sign-in instead. */
export const NeededSignIn = ts('NeededSignIn')
/** The account connected: Books shows the titles instead of the sign-in. */
export const Connected = ts('Connected')
/** What the Audible import asks of the Books stack that holds it. */
export const OutMessage = S.Union([NeededSignIn, Connected])
/** What the Audible import asks of the Books stack that holds it. */
export type OutMessage = typeof OutMessage.Type

// UPDATE

type UpdateReturn = readonly [
  AudibleModel,
  ReadonlyArray<Command.Command<Message>>,
  Option.Option<OutMessage>,
]

const withUpdateReturn = M.withReturnType<UpdateReturn>()

const unchanged = (model: AudibleModel): UpdateReturn => [
  model,
  [],
  Option.none(),
]

const withSignIn = (model: AudibleModel, signIn: SignIn): UpdateReturn => [
  { ...model, signIn },
  [],
  Option.none(),
]

const withTitles = (model: AudibleModel, titles: Titles): UpdateReturn => [
  { ...model, titles },
  [],
  Option.none(),
]

const authorizationCodeField = 'openid.oa2.authorization_code='

const isLandingAddress = (address: string): boolean =>
  String.includes(authorizationCodeField)(address)

const loginUrlOf = (signIn: SignIn): Option.Option<string> =>
  signIn._tag === 'SignInReady' || signIn._tag === 'SignInConnecting'
    ? Option.some(signIn.loginUrl)
    : Option.none()

const connected = (
  model: AudibleModel,
  address: Redacted.Redacted<string>,
): UpdateReturn => {
  const signIn = model.signIn
  if (signIn._tag !== 'SignInReady') {
    return unchanged(model)
  } else if (isLandingAddress(Redacted.value(address))) {
    return [
      { ...model, signIn: SignInConnecting({ loginUrl: signIn.loginUrl }) },
      [FinishAudibleSignIn({ address })],
      Option.none(),
    ]
  } else {
    return withSignIn(
      model,
      SignInReady({
        loginUrl: signIn.loginUrl,
        maybeProblem: Option.some(AddressMismatch()),
      }),
    )
  }
}

const withProblemOnLink = (
  model: AudibleModel,
  problem: AudibleProblem,
): UpdateReturn =>
  Option.match(loginUrlOf(model.signIn), {
    onNone: () =>
      withSignIn(model, SignInWaiting({ maybeProblem: Option.some(problem) })),
    onSome: loginUrl =>
      withSignIn(
        model,
        SignInReady({ loginUrl, maybeProblem: Option.some(problem) }),
      ),
  })

/**
 * Where a failed connect leaves the sign-in. The same link stays open for
 * a wrong paste or a problem on Books' side; a sign-in Amazon refused or
 * that ran out of time starts a new one, with the problem shown above it.
 */
const failedConnect = (
  model: AudibleModel,
  problem: AudibleProblem,
): UpdateReturn =>
  M.value(problem).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      SignInExpired: () =>
        withSignIn(
          model,
          SignInWaiting({ maybeProblem: Option.some(problem) }),
        ),
      AmazonRefused: () =>
        withSignIn(
          model,
          SignInWaiting({ maybeProblem: Option.some(problem) }),
        ),
      AddressMismatch: () => withProblemOnLink(model, problem),
      NotSignedIn: () => withProblemOnLink(model, problem),
      NotConnected: () => withProblemOnLink(model, problem),
      LoginExpired: () => withProblemOnLink(model, problem),
      Unavailable: () => withProblemOnLink(model, problem),
    }),
  )

const toggled = (read: TitlesRead, asin: Asin): ReadonlyArray<Asin> =>
  isSelected(read, asin)
    ? Array.filter(read.selected, selected => selected !== asin)
    : Array.filter(
        Array.map(read.titles, title => title.asin),
        each => each === asin || Array.contains(read.selected, each),
      )

const onRead = (
  model: AudibleModel,
  next: (read: TitlesRead) => Titles,
): UpdateReturn =>
  model.titles._tag === 'TitlesRead'
    ? withTitles(model, next(model.titles))
    : unchanged(model)

const startedImport = (model: AudibleModel): UpdateReturn =>
  onRead(model, read =>
    Array.isReadonlyArrayEmpty(read.selected)
      ? read
      : TitlesImporting({
          titles: read.titles,
          skipped: read.skipped,
          selected: read.selected,
          progress: {
            stage: 'ReadingChapters',
            done: 0,
            total: read.selected.length,
          },
        }),
  )

const failedImport = (
  model: AudibleModel,
  problem: AudibleProblem,
): UpdateReturn => {
  const titles = model.titles
  if (titles._tag !== 'TitlesImporting') {
    return unchanged(model)
  } else if (problem._tag === 'LoginExpired') {
    return withTitles(model, TitlesUnreadable({ problem }))
  } else if (problem._tag === 'NotConnected') {
    return [
      { ...model, titles: TitlesUnread() },
      [],
      Option.some(NeededSignIn()),
    ]
  } else {
    return withTitles(
      model,
      TitlesRead({
        titles: titles.titles,
        skipped: titles.skipped,
        selected: titles.selected,
        maybeProblem: Option.some(problem),
      }),
    )
  }
}

const failedRead = (
  model: AudibleModel,
  problem: AudibleProblem,
): UpdateReturn =>
  problem._tag === 'NotConnected'
    ? [{ ...model, titles: TitlesUnread() }, [], Option.some(NeededSignIn())]
    : withTitles(model, TitlesUnreadable({ problem }))

/**
 * Applies one Audible import Message to this device's import. Starting a
 * sign-in, reading the titles, and importing them come from Subscriptions
 * that watch this state; finishing a sign-in is the one Command. The
 * OutMessage asks Books to swap the sign-in and the titles pages: the
 * titles found no login, or the login was just saved.
 *
 * @example
 * ```typescript
 * update(model, ConnectAudible({ address }))
 * // [{ signIn: SignInConnecting, … }, [FinishAudibleSignIn({ address })], None]
 * ```
 */
export const update = (model: AudibleModel, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      ConnectAudible: ({ address }) => connected(model, address),
      TryAudibleSignInAgain: () =>
        model.signIn._tag === 'SignInStuck'
          ? withSignIn(model, SignInWaiting({ maybeProblem: Option.none() }))
          : unchanged(model),
      StartedAudibleSignIn: ({ loginUrl }) =>
        model.signIn._tag === 'SignInWaiting'
          ? withSignIn(
              model,
              SignInReady({
                loginUrl,
                maybeProblem: model.signIn.maybeProblem,
              }),
            )
          : unchanged(model),
      FailedStartAudibleSignIn: ({ problem }) =>
        model.signIn._tag === 'SignInWaiting'
          ? withSignIn(model, SignInStuck({ problem }))
          : unchanged(model),
      ConnectedAudible: () => [
        {
          signIn: SignInWaiting({ maybeProblem: Option.none() }),
          titles: TitlesUnread(),
        },
        [],
        Option.some(Connected()),
      ],
      FailedConnectAudible: ({ problem }) => failedConnect(model, problem),
      ReceivedAudibleLibrary: ({ titles, skipped }) =>
        model.titles._tag === 'TitlesUnread'
          ? withTitles(
              model,
              TitlesRead({
                titles,
                skipped,
                selected: newAsinsOf(titles),
                maybeProblem: Option.none(),
              }),
            )
          : unchanged(model),
      FailedReadAudibleLibrary: ({ problem }) =>
        model.titles._tag === 'TitlesUnread'
          ? failedRead(model, problem)
          : unchanged(model),
      ReadAudibleLibraryAgain: () =>
        model.titles._tag === 'TitlesUnreadable'
          ? withTitles(model, TitlesUnread())
          : unchanged(model),
      ToggleAudibleTitle: ({ asin }) =>
        onRead(model, read =>
          TitlesRead({ ...read, selected: toggled(read, asin) }),
        ),
      SelectAllAudibleTitles: () =>
        onRead(model, read =>
          TitlesRead({
            ...read,
            selected: Array.map(read.titles, title => title.asin),
          }),
        ),
      DeselectAudibleTitles: () =>
        onRead(model, read => TitlesRead({ ...read, selected: [] })),
      ImportAudibleTitles: () => startedImport(model),
      AdvancedAudibleImport: ({ progress }) =>
        model.titles._tag === 'TitlesImporting'
          ? withTitles(model, TitlesImporting({ ...model.titles, progress }))
          : unchanged(model),
      ImportedAudibleTitles: ({ summary }) =>
        model.titles._tag === 'TitlesImporting'
          ? withTitles(
              model,
              TitlesImported({ summary, skipped: model.titles.skipped }),
            )
          : unchanged(model),
      FailedImportAudibleTitles: ({ problem }) => failedImport(model, problem),
    }),
  )

/**
 * The import as the titles page opens again from the library or the
 * profile: the titles read afresh, unless an import is running.
 */
export const reopened = (model: AudibleModel): AudibleModel =>
  model.titles._tag === 'TitlesImporting'
    ? model
    : { ...model, titles: TitlesUnread() }

/** The import as a person chooses to connect again: a new sign-in. */
export const reconnecting = (model: AudibleModel): AudibleModel => ({
  ...model,
  signIn: SignInWaiting({ maybeProblem: Option.none() }),
})
