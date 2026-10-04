import { Layer, Option } from 'effect'
import { type Processor, Runtime } from 'foldkit'
import { localSnapshotFile, localSnapshotPath } from 'foldkit/cli'
import { dirname, join } from 'node:path'

import {
  Instant,
  type ProgramLogDatabase,
  ensureHostedInstantSession,
  makeInstantCoreProgramLogTransport,
  makeNodeInstantDatabase,
} from '@foldkit/instant'

import { makeInstantRemindersStore } from './instantStore.js'
import { RemindersProgram } from './program.js'
import type { RemindersHandle } from './startConfig.js'
import { RemindersStore } from './store.js'
import { SyncedReminders } from './synced.js'

// START

/** The mint a terminal signs in through by default: the hosted Reminders. */
export const defaultRemindersOrigin = 'https://reminders.knophy.com'

/**
 * Where a terminal Reminders finds the lists and its sign-in: the Instant
 * app that holds them, and the web Reminders whose mint turns a Cloudflare
 * Access login into an Instant session. On this machine the local web
 * Reminders, `http://localhost:5223`, mints without a login.
 */
export type RemindersConnection = Readonly<{
  appId: string
  sessionOrigin: string
}>

/**
 * The connection a terminal's environment names: `REMINDERS_INSTANT_APP_ID`
 * and `FOLDKIT_HOSTED_IDENTITY_ORIGIN`, the hosted Reminders by default.
 * None without an app id. `scripts/with-reminders-access` sets both.
 */
export const remindersConnectionFromEnv = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): Option.Option<RemindersConnection> =>
  Option.map(
    Option.filter(
      Option.fromNullishOr(env['REMINDERS_INSTANT_APP_ID']),
      appId => appId.trim() !== '',
    ),
    appId => ({
      appId: appId.trim(),
      sessionOrigin:
        env['FOLDKIT_HOSTED_IDENTITY_ORIGIN']?.trim() || defaultRemindersOrigin,
    }),
  )

/** Why a terminal Reminders could not open, when there is no connection. */
export const noConnectionSentence =
  'Reminders does not know which Instant app holds your lists. Run it through scripts/with-reminders-access, or set REMINDERS_INSTANT_APP_ID.'

/** Why a terminal Reminders could not sign in. */
export const notSignedInSentence =
  'Reminders could not sign you in. Sign in to Cloudflare Access for the Reminders origin, then try again.'

/** A terminal Reminders signed in as the Access member, on its Instant app. */
export type SignedInReminders = Readonly<{
  appId: string
  email: string
  database: ProgramLogDatabase
}>

const stateDirectoryOf = (appId: string): string =>
  join(dirname(localSnapshotPath('foldkit-reminders')), 'reminders', appId)

/**
 * Opens the Instant app with this machine's saved session, or signs in
 * through the mint: a Cloudflare Access login from the environment, or
 * none on this machine. The session is kept in a file, so the next run
 * needs no login. None when nobody could be signed in.
 *
 * @example
 * ```typescript
 * const maybeSignedIn = await signInToReminders({ appId, sessionOrigin: 'http://localhost:5223' })
 * ```
 */
export const signInToReminders = async (
  connection: RemindersConnection,
): Promise<Option.Option<SignedInReminders>> => {
  const database = makeNodeInstantDatabase(
    connection.appId,
    stateDirectoryOf(connection.appId),
  )
  const member = await ensureHostedInstantSession(database, {
    sessionOrigin: connection.sessionOrigin,
  })
  return Option.flatMap(Option.fromNullishOr(member), signedIn =>
    Option.map(Option.fromNullishOr(signedIn.email), email => ({
      appId: connection.appId,
      email,
      database,
    })),
  )
}

/** The engine a terminal Reminders reads and writes: the member's own log. */
export const remindersEngine = (
  signedIn: SignedInReminders,
  config: Readonly<{ host: Processor.Host.Host; instance: string }>,
): Runtime.SyncEngine =>
  Instant({
    app: { id: signedIn.appId },
    processor: config.host,
    instance: config.instance,
    transport: makeInstantCoreProgramLogTransport(
      signedIn.database,
      RemindersProgram.id,
      { owner: 'SignedInUser' },
    ),
  })

/**
 * Starts Reminders in a terminal as the signed-in member: the board from
 * Instant, and this machine's fold of the log in a file, so the next run
 * paints at once.
 *
 * @example
 * ```typescript
 * const handle = startReminders(signedIn, { host: Processor.Host.Tui(), instance: newProcessorInstance() })
 * ```
 */
export const startReminders = (
  signedIn: SignedInReminders,
  config: Readonly<{ host: Processor.Host.Host; instance: string }>,
): RemindersHandle =>
  Runtime.startHandle({
    program: SyncedReminders,
    sync: remindersEngine(signedIn, config),
    resources: Layer.effect(
      RemindersStore,
      makeInstantRemindersStore(signedIn.database),
    ),
    localSnapshot: localSnapshotFile(
      join(stateDirectoryOf(signedIn.appId), 'snapshot.json'),
    ),
    host: config.host,
  })

const boardPollMs = 100

/**
 * Waits until the board has opened, or could not, so a one-shot command
 * paints the lists instead of "Opening your reminders…". Gives up after
 * `timeoutMs` and paints what there is.
 *
 * @example
 * ```typescript
 * await whenBoardOpened(handle, 15_000)
 * ```
 */
export const whenBoardOpened = (
  handle: RemindersHandle,
  timeoutMs: number,
): Promise<void> =>
  new Promise(resolve => {
    const startedAtMs = Date.now()
    const check = (): void => {
      const model = handle.readModel()
      const isOpened =
        model._tag === 'Ready' && model.board._tag !== 'BoardLoading'
      if (isOpened || Date.now() - startedAtMs >= timeoutMs) {
        resolve()
      } else {
        setTimeout(check, boardPollMs)
      }
    }
    check()
  })
