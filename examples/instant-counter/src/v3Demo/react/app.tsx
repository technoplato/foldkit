import { navigationToPath } from 'counters-core-example'
import { Array, Effect, Exit, Option, Result, Scope, Schema as S, Stream } from 'effect'
import * as Synchronization from 'foldkit/synchronization'
import { useEffect, useMemo, useState } from 'react'

import type { InstantCounterDatabase } from '../../../instant.schema.js'
import {
  type Authentication,
  LoadingAuthentication,
  observeAuthentication,
  signInWithMagicCode,
} from '../../client/auth.js'
import { makeBrowserDatabase } from '../../client/database.js'
import { resolveMultipleCountersV3EnabledActionToken } from '../client/actions.js'
import {
  type MultipleCountersV3ClientController,
  type MultipleCountersV3ClientSnapshot,
  makeMultipleCountersV3ClientController,
} from '../client/controller.js'
import {
  type MultipleCountersV3FollowDraft,
  emptyMultipleCountersV3FollowDraft,
  formatMultipleCountersV3SessionChrome,
  isMultipleCountersV3ObserveFollower,
  multipleCountersV3FollowAlignmentExplanation,
  multipleCountersV3FollowMode,
  multipleCountersV3ModeRequestLabel,
  multipleCountersV3SessionChrome,
} from '../client/sessionChrome.js'
import {
  MultipleCountersV3DebugEmail,
  MultipleCountersV3DebugLoginIssued,
  multipleCountersV3DebugLoginPath,
  multipleCountersV3DebugLoginSubjects,
} from '../shared/debugLogin.js'
import { multipleCountersV3SessionEpochSeed } from '../shared/identity.js'
import {
  appendBrowserMultipleCountersV3PolicyRequest,
  makeBrowserMultipleCountersV3ProcessorConfig,
  resolveBrowserMultipleCountersV3PolicyRequest,
} from '../browser/processorConfig.js'
import { MultipleCountersV3ReactProgramScreen } from './programScreen.js'

const canonicalListDestinationUri = '/counters'
const reactIdentityDatabaseName = 'foldkit-instant-multiple-counters-v3-react'
const isDebugLoginEnabled = import.meta.env.DEV

const requestDebugLogin = (
  email: typeof MultipleCountersV3DebugEmail.Type,
): Promise<typeof MultipleCountersV3DebugLoginIssued.Type> =>
  fetch(multipleCountersV3DebugLoginPath, {
    body: JSON.stringify({ email }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  }).then(async response => {
    const body: unknown = await response.json()
    if (!response.ok) {
      throw new Error('DebugLoginUnavailable')
    }
    return S.decodeUnknownSync(MultipleCountersV3DebugLoginIssued)(body)
  })

const instantAppId = (): string => {
  const appId = import.meta.env['VITE_INSTANT_APP_ID']
  if (appId === undefined || appId.length === 0) {
    throw new Error(
      'VITE_INSTANT_APP_ID is required. Run through the foldkit-instant-demo credential wrapper.',
    )
  }
  return appId
}

const accountLabel = (authentication: Authentication): string => {
  if (authentication._tag !== 'SignedIn') {
    return 'Signed out'
  }
  return Option.getOrElse(
    authentication.maybeEmail,
    () => authentication.subjectId,
  )
}

/** React Instant Client with the same session policy chrome as Foldkit, CLI, and TUI. */
export const MultipleCountersV3ReactApp = () => {
  const database = useMemo(() => makeBrowserDatabase(), [])
  const [authentication, setAuthentication] = useState<Authentication>(
    LoadingAuthentication.make({}),
  )
  const [controller, setController] =
    useState<MultipleCountersV3ClientController | null>(null)
  const [snapshot, setSnapshot] =
    useState<MultipleCountersV3ClientSnapshot | null>(null)
  const [followDraft, setFollowDraft] = useState<MultipleCountersV3FollowDraft>(
    emptyMultipleCountersV3FollowDraft(),
  )
  const [maybeNotice, setNotice] = useState(Option.none<string>())
  const [isModeRequestPending, setModeRequestPending] = useState(false)

  useEffect(() => {
    const scope = Effect.runSync(Scope.make())
    const appId = instantAppId()
    void Effect.runPromise(
      makeMultipleCountersV3ClientController({
        policyRequests: {
          append: request =>
            appendBrowserMultipleCountersV3PolicyRequest(database, request),
          nextPolicyRequestId: () => crypto.randomUUID(),
          now: Date.now,
          resolve: request =>
            resolveBrowserMultipleCountersV3PolicyRequest(database, request),
        },
        processorConfig: subjectId =>
          makeBrowserMultipleCountersV3ProcessorConfig({
            database,
            identityDatabaseName: reactIdentityDatabaseName,
            instantAppId: appId,
            sessionEpochSeed: multipleCountersV3SessionEpochSeed,
            subjectId,
          }),
        signOut: () =>
          Effect.promise(() => database.auth.signOut()).pipe(Effect.asVoid),
      }).pipe(Effect.provideService(Scope.Scope, scope)),
    ).then(nextController => {
      setController(nextController)
      void Effect.runPromise(
        Stream.runForEach(nextController.snapshots, nextSnapshot =>
          Effect.sync(() => setSnapshot(nextSnapshot)),
        ).pipe(Effect.provideService(Scope.Scope, scope)),
      )
    })
    const unsubscribeAuth = observeAuthentication(
      database,
      setAuthentication,
    )
    return () => {
      unsubscribeAuth()
      void Effect.runPromise(Scope.close(scope, Exit.void))
    }
  }, [database])

  useEffect(() => {
    if (controller === null || authentication._tag !== 'SignedIn') {
      return
    }
    void Effect.runPromise(
      controller.reconcileAuthenticatedSubject(
        Option.some(authentication.subjectId),
      ).pipe(
        Effect.flatMap(() => controller.open(canonicalListDestinationUri)),
      ),
    )
  }, [authentication, controller])

  const requestMode = (mode: Synchronization.Mode) => {
    if (controller === null || isModeRequestPending) {
      return
    }
    setModeRequestPending(true)
    setNotice(
      Option.some(
        `Requesting ${multipleCountersV3ModeRequestLabel(mode)} from the session authority.`,
      ),
    )
    void Effect.runPromise(controller.requestMode(mode)).then(
      resolution => {
        setModeRequestPending(false)
        setNotice(
          Option.some(
            resolution.resolutionState === 'Accepted'
              ? `The authority accepted ${multipleCountersV3ModeRequestLabel(mode)} as policy generation ${resolution.resolvedPolicyGeneration.toString()}.`
              : `The authority rejected ${multipleCountersV3ModeRequestLabel(mode)}: ${resolution.rejectionReason}.`,
          ),
        )
        void Effect.runPromise(controller.readSnapshot).then(setSnapshot)
      },
      () => {
        setModeRequestPending(false)
        setNotice(Option.some('Mode request was not applied.'))
      },
    )
  }

  const performToken = (token: string) => {
    if (controller === null || snapshot === null) {
      return
    }
    const resolved = resolveMultipleCountersV3EnabledActionToken(
      snapshot.model,
      token,
      !isMultipleCountersV3ObserveFollower(snapshot),
    )
    if (Result.isFailure(resolved)) {
      setNotice(Option.some(resolved.failure._tag))
      return
    }
    void Effect.runPromise(controller.perform(resolved.success)).then(() =>
      Effect.runPromise(controller.readSnapshot).then(setSnapshot),
    )
  }

  if (authentication._tag !== 'SignedIn' || snapshot === null) {
    return (
      <AuthScreen
        authentication={authentication}
        database={database}
        maybeNotice={maybeNotice}
        setNotice={setNotice}
      />
    )
  }

  const chrome = multipleCountersV3SessionChrome(
    snapshot,
    accountLabel(authentication),
  )
  const followerProcessorId =
    followDraft.followerProcessorId.length === 0
      ? chrome.processorId
      : followDraft.followerProcessorId

  return (
    <main className="auth-shell">
      <aside className="v3-client-chrome" aria-label="Instant session">
        {Array.map(formatMultipleCountersV3SessionChrome(chrome), line => (
          <span key={line}>{line}</span>
        ))}
        {chrome.isObserveFollower ? (
          <span className="v3-client-notice">
            Navigation follows the leader. Domain actions stay available.
          </span>
        ) : null}
        {Option.isSome(maybeNotice) ? (
          <span className="v3-client-notice">{maybeNotice.value}</span>
        ) : null}
        <div className="v3-mode-controls">
          <span>Navigation synchronization</span>
          <button
            disabled={isModeRequestPending}
            onClick={() => requestMode(Synchronization.SharedDomain.make({}))}
            type="button"
          >
            Independent
          </button>
          <button
            disabled={isModeRequestPending}
            onClick={() => requestMode(Synchronization.Mirror.make({}))}
            type="button"
          >
            Mirror
          </button>
          <p className="muted">{multipleCountersV3FollowAlignmentExplanation}</p>
          <label>
            Leader
            <input
              disabled={isModeRequestPending}
              onChange={event =>
                setFollowDraft({
                  ...followDraft,
                  leaderProcessorId: event.currentTarget.value,
                })
              }
              value={followDraft.leaderProcessorId}
            />
          </label>
          <label>
            Follower
            <input
              disabled={isModeRequestPending}
              onChange={event =>
                setFollowDraft({
                  ...followDraft,
                  followerProcessorId: event.currentTarget.value,
                })
              }
              value={followerProcessorId}
            />
          </label>
          <label>
            Control
            <select
              disabled={isModeRequestPending}
              onChange={event => {
                const control = event.currentTarget.value
                if (control === 'Observe' || control === 'RemoteControl') {
                  setFollowDraft({ ...followDraft, control })
                }
              }}
              value={followDraft.control}
            >
              <option value="Observe">Observe</option>
              <option value="RemoteControl">Remote control</option>
            </select>
          </label>
          <button
            disabled={isModeRequestPending}
            onClick={() => {
              const maybeMode = multipleCountersV3FollowMode(
                followDraft.leaderProcessorId,
                followerProcessorId,
                followDraft.control,
              )
              if (Option.isNone(maybeMode)) {
                setNotice(
                  Option.some(
                    'Follow needs different non-empty leader and follower Processor ids.',
                  ),
                )
                return
              }
              requestMode(maybeMode.value)
            }}
            type="button"
          >
            Follow
          </button>
        </div>
        <button
          onClick={() => {
            if (controller !== null) {
              void Effect.runPromise(controller.signOut)
            }
          }}
          type="button"
        >
          Sign out
        </button>
      </aside>
      <MultipleCountersV3ReactProgramScreen
        isNavigationEnabled={!chrome.isObserveFollower}
        model={snapshot.model}
        onPerform={performToken}
        path={navigationToPath(snapshot.model.navigation)}
      />
    </main>
  )
}

const AuthScreen = ({
  authentication,
  database,
  maybeNotice,
  setNotice,
}: Readonly<{
  authentication: Authentication
  database: InstantCounterDatabase
  maybeNotice: Option.Option<string>
  setNotice: (notice: Option.Option<string>) => void
}>) => (
  <main className="auth-shell">
    <section className="auth-card">
      <p className="eyebrow">Foldkit Program | React Instant</p>
      <h1>Your counters, on every Processor</h1>
      {Option.isSome(maybeNotice) ? (
        <p className="notice" role="status">
          {maybeNotice.value}
        </p>
      ) : null}
      {authentication._tag === 'LoadingAuthentication' ? (
        <p className="muted">Restoring Instant authentication…</p>
      ) : (
        <p className="muted">Sign in as Alice or Bob, then switch Independent, Mirror, or Follow.</p>
      )}
      {isDebugLoginEnabled
        ? Array.map(multipleCountersV3DebugLoginSubjects, subject => (
            <button
              className="quiet"
              key={subject.email}
              onClick={() => {
                void requestDebugLogin(subject.email).then(
                  issued =>
                    signInWithMagicCode(database, issued.email, issued.code),
                  () =>
                    setNotice(
                      Option.some(
                        'Start the headless authority to mint Alice and Bob codes.',
                      ),
                    ),
                )
              }}
              type="button"
            >
              Sign in as {subject.label}
            </button>
          ))
        : null}
    </section>
  </main>
)
