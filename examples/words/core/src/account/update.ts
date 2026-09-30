import { Effect, Match as M, Option, Schema as S } from 'effect'
import { Command } from 'foldkit'
import { load } from 'foldkit/navigation'
import { evo } from 'foldkit/struct'

import { AccountRoute, scribeRouteToShareUrl } from '../link.js'
import {
  type AccessIdentity,
  WordsOrigin,
  type WordsOriginError,
  isSameEmail,
} from '../origin.js'
import { WordsStore, type WordsStoreError } from '../store.js'
import {
  CompletedLeaveForAccessLogout,
  CompletedSignOutOfScribe,
  FailedCheckAccess,
  FailedConnectAccount,
  FailedSignOutOfScribe,
  FoundNoAccessIdentity,
  FoundNoScribeAccount,
  FoundScribeAccount,
  type Message,
  type OutMessage,
  RequestedCopy,
  SucceededConnectAccount,
} from './message.js'
import {
  AwaitingIPhone,
  CheckingAccount,
  ConnectedAccount,
  ConnectingAccount,
  type Connection,
  FailedAccountCheck,
  FailedConnect,
  type Model,
  NoAccessIdentity,
  SignedOutAccount,
  accessOf,
  isRechecking,
} from './model.js'

/** Cloudflare Access's logout page for the current host; it ends the Google login. */
export const ACCESS_LOGOUT_PATH = '/cdn-cgi/access/logout'

type Services = WordsStore | WordsOrigin
type Commands = ReadonlyArray<Command.Command<Message, never, Services>>

/** The account update's result: the next Model, its Commands, and what it tells the page. */
export type UpdateReturn = readonly [Model, Commands, Option.Option<OutMessage>]

const withUpdateReturn = M.withReturnType<UpdateReturn>()

const reasonOf = (error: WordsStoreError | WordsOriginError): string =>
  M.value(error).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      WordsStoreError: ({ operation, cause }) =>
        `${operation}: ${String(cause)}`,
      WordsOriginError: ({ reason }) => reason,
    }),
  )

// COMMAND

/** Asks the origin who Cloudflare Access says the listener is, and whether Scribe has that account. */
export const CheckAccess = Command.define(
  'CheckAccess',
  FoundScribeAccount,
  FoundNoScribeAccount,
  FoundNoAccessIdentity,
  FailedCheckAccess,
)(
  WordsOrigin.pipe(
    Effect.flatMap(origin => origin.checkAccess),
    Effect.map(check =>
      M.value(check).pipe(
        M.withReturnType<
          | typeof FoundScribeAccount.Type
          | typeof FoundNoScribeAccount.Type
          | typeof FoundNoAccessIdentity.Type
        >(),
        M.tagsExhaustive({
          ScribeAccountReady: ({ access, features }) =>
            FoundScribeAccount({ access, features }),
          ScribeAccountMissing: ({ access, features }) =>
            FoundNoScribeAccount({ access, features }),
          AccessIdentityMissing: () => FoundNoAccessIdentity(),
        }),
      ),
    ),
    Effect.catch(error =>
      Effect.succeed(FailedCheckAccess({ reason: error.reason })),
    ),
  ),
)

/**
 * Signs the browser in to the Scribe account for `email`. A browser already
 * signed in as that account keeps its session; otherwise the origin mints a
 * session from the Access identity and Instant signs in with it.
 */
export const ConnectAccount = Command.define(
  'ConnectAccount',
  { email: S.String },
  SucceededConnectAccount,
  FailedConnectAccount,
)(({ email }) =>
  Effect.gen(function* () {
    const store = yield* WordsStore
    const maybeMember = yield* store.currentMember
    if (
      Option.exists(maybeMember, member => isSameEmail(member.email, email))
    ) {
      return SucceededConnectAccount()
    } else {
      const origin = yield* WordsOrigin
      const session = yield* origin.mintSession
      yield* store.signInWithToken(session.token)
      return SucceededConnectAccount()
    }
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedConnectAccount({ reason: reasonOf(error) })),
    ),
  ),
)

/** Signs the browser out of Scribe's Instant app. */
export const SignOutOfScribe = Command.define(
  'SignOutOfScribe',
  CompletedSignOutOfScribe,
  FailedSignOutOfScribe,
)(
  WordsStore.pipe(
    Effect.flatMap(store => store.signOut),
    Effect.as(CompletedSignOutOfScribe()),
    Effect.catch(error =>
      Effect.succeed(FailedSignOutOfScribe({ reason: reasonOf(error) })),
    ),
  ),
)

/** Opens Cloudflare Access's logout page, which ends the Google login for knophy.com. */
export const LeaveForAccessLogout = Command.define(
  'LeaveForAccessLogout',
  CompletedLeaveForAccessLogout,
)(load(ACCESS_LOGOUT_PATH).pipe(Effect.as(CompletedLeaveForAccessLogout())))

// UPDATE

const noOutMessage = Option.none<OutMessage>()

const withConnection = (model: Model, connection: Connection): Model =>
  evo(model, { connection: () => connection })

const connect = (model: Model, access: AccessIdentity): UpdateReturn => [
  withConnection(model, ConnectingAccount({ access })),
  [ConnectAccount({ email: access.email })],
  noOutMessage,
]

const foundAccount = (model: Model, access: AccessIdentity): UpdateReturn =>
  M.value(model.connection).pipe(
    withUpdateReturn,
    M.tag('SignedOutAccount', () => [model, [], noOutMessage]),
    M.tag('ConnectingAccount', 'ConnectedAccount', current =>
      isSameEmail(current.access.email, access.email)
        ? [model, [], noOutMessage]
        : connect(model, access),
    ),
    M.orElse(() => connect(model, access)),
  )

const unlessSignedOut = (model: Model, connection: Connection): Model =>
  model.connection._tag === 'SignedOutAccount'
    ? model
    : withConnection(model, connection)

const signedOut = (model: Model): UpdateReturn =>
  Option.match(accessOf(model), {
    onNone: () => [model, [], noOutMessage],
    onSome: access => [
      withConnection(model, SignedOutAccount({ access })),
      access.source === 'CloudflareAccess' ? [LeaveForAccessLogout()] : [],
      noOutMessage,
    ],
  })

/** Folds one account Message into the account Model. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      FoundScribeAccount: ({ access, features }) =>
        foundAccount(
          evo(model, { maybeFeatures: () => Option.some(features) }),
          access,
        ),
      FoundNoScribeAccount: ({ access, features }) => [
        unlessSignedOut(
          evo(model, { maybeFeatures: () => Option.some(features) }),
          AwaitingIPhone({ access }),
        ),
        [],
        noOutMessage,
      ],
      FoundNoAccessIdentity: () => [
        withConnection(model, NoAccessIdentity()),
        [],
        noOutMessage,
      ],
      FailedCheckAccess: ({ reason }) => [
        unlessSignedOut(model, FailedAccountCheck({ reason })),
        [],
        noOutMessage,
      ],
      SucceededConnectAccount: () =>
        M.value(model.connection).pipe(
          withUpdateReturn,
          M.tag('ConnectingAccount', ({ access }) => [
            withConnection(model, ConnectedAccount({ access })),
            [],
            noOutMessage,
          ]),
          M.orElse(() => [model, [], noOutMessage]),
        ),
      FailedConnectAccount: ({ reason }) =>
        M.value(model.connection).pipe(
          withUpdateReturn,
          M.tag('ConnectingAccount', ({ access }) => [
            withConnection(model, FailedConnect({ access, reason })),
            [],
            noOutMessage,
          ]),
          M.orElse(() => [model, [], noOutMessage]),
        ),
      LostInstantSession: () =>
        M.value(model.connection).pipe(
          withUpdateReturn,
          M.tag('ConnectedAccount', ({ access }) => connect(model, access)),
          M.orElse(() => [model, [], noOutMessage]),
        ),
      TickedAccountRecheck: () => [
        model,
        isRechecking(model) ? [CheckAccess()] : [],
        noOutMessage,
      ],
      ClickedCheckAccountAgain: () => [model, [CheckAccess()], noOutMessage],
      ClickedSignOut: () => [model, [SignOutOfScribe()], noOutMessage],
      CompletedSignOutOfScribe: () => signedOut(model),
      FailedSignOutOfScribe: () => signedOut(model),
      CompletedLeaveForAccessLogout: () => [model, [], noOutMessage],
      ClickedSignInAgain: () => [
        withConnection(model, CheckingAccount()),
        [CheckAccess()],
        noOutMessage,
      ],
      ClickedCopyUserID: ({ userID }) => [
        model,
        [],
        Option.some(
          RequestedCopy({ text: userID, noticeText: 'Copied user ID' }),
        ),
      ],
      ClickedCopyAccountLink: () => [
        model,
        [],
        Option.some(
          RequestedCopy({
            text: scribeRouteToShareUrl(AccountRoute()),
            noticeText: 'Copied account link',
          }),
        ),
      ],
    }),
  )
