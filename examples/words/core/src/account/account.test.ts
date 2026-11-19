import { Array, Effect, Layer, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { SignedIn, SignedOut } from '../model.js'
import {
  type AccessCheck,
  type AccessIdentity,
  type OriginFeatures,
  ScribeAccountReady,
  WordsOrigin,
  WordsOriginError,
  decodeAccessResponse,
  decodeSessionResponse,
} from '../origin.js'
import {
  WordsStore,
  WordsStoreError,
  makeStaticWordsResources,
} from '../store.js'
import {
  ClickedCopyAccountLink,
  ClickedSignInAgain,
  ClickedSignOut,
  CompletedSignOutOfScribe,
  FailedConnectAccount,
  FoundNoScribeAccount,
  FoundScribeAccount,
  LostInstantSession,
  type Message,
  SucceededConnectAccount,
  TickedAccountRecheck,
} from './message.js'
import { type Model, init, isRechecking } from './model.js'
import { ConnectAccount, update } from './update.js'

const access: AccessIdentity = {
  email: 'owner@example.invalid',
  source: 'CloudflareAccess',
  maybeExpiresAtMs: Option.some(1_790_000_000_000),
}

const features: OriginFeatures = { sharing: 'AwaitingSchema' }

const loopbackAccess: AccessIdentity = {
  ...access,
  source: 'Loopback',
  maybeExpiresAtMs: Option.none(),
}

const run = (model: Model, messages: ReadonlyArray<Message>) =>
  Array.reduce(
    messages,
    {
      model,
      commandNames: Array.empty<string>(),
      outMessageTags: Array.empty<string>(),
    },
    (state, message) => {
      const [next, commands, maybeOutMessage] = update(state.model, message)
      return {
        model: next,
        commandNames: [
          ...state.commandNames,
          ...commands.map(command => command.name),
        ],
        outMessageTags: [
          ...state.outMessageTags,
          ...Option.toArray(Option.map(maybeOutMessage, out => out._tag)),
        ],
      }
    },
  )

describe('connecting the Cloudflare identity to the Scribe account', () => {
  it('waits for the iPhone when Scribe has no account yet, checking again on a timer', () => {
    const waiting = run(init(), [FoundNoScribeAccount({ access, features })])

    expect(waiting.model.connection._tag).toBe('AwaitingIPhone')
    expect(waiting.commandNames).toEqual([])
    expect(isRechecking(waiting.model)).toBe(true)
    expect(run(waiting.model, [TickedAccountRecheck()]).commandNames).toEqual([
      'CheckAccess',
    ])
  })

  it('signs in as soon as the account exists, and stops checking', () => {
    const connecting = run(init(), [
      FoundNoScribeAccount({ access, features }),
      FoundScribeAccount({ access, features }),
    ])
    expect(connecting.model.connection._tag).toBe('ConnectingAccount')
    expect(connecting.commandNames).toEqual(['ConnectAccount'])

    const connected = run(connecting.model, [SucceededConnectAccount()])
    expect(connected.model.connection._tag).toBe('ConnectedAccount')
    expect(isRechecking(connected.model)).toBe(false)
    expect(run(connected.model, [TickedAccountRecheck()]).commandNames).toEqual(
      [],
    )
  })

  it('does not sign in twice when a check repeats for the same email', () => {
    const connected = run(init(), [
      FoundScribeAccount({ access, features }),
      SucceededConnectAccount(),
    ])
    expect(
      run(connected.model, [FoundScribeAccount({ access, features })])
        .commandNames,
    ).toEqual([])
  })

  it('keeps checking after a failed sign-in', () => {
    const failed = run(init(), [
      FoundScribeAccount({ access, features }),
      FailedConnectAccount({ reason: 'MintUnavailable' }),
    ])
    expect(failed.model.connection._tag).toBe('FailedConnect')
    expect(run(failed.model, [TickedAccountRecheck()]).commandNames).toEqual([
      'CheckAccess',
    ])
  })

  it('signs in again when Instant loses the session', () => {
    const connected = run(init(), [
      FoundScribeAccount({ access, features }),
      SucceededConnectAccount(),
    ])
    const lost = run(connected.model, [LostInstantSession()])
    expect(lost.model.connection._tag).toBe('ConnectingAccount')
    expect(lost.commandNames).toEqual(['ConnectAccount'])
  })
})

describe('signing out', () => {
  it('ends the Cloudflare Access login too, so the next visit asks Google again', () => {
    const connected = run(init(), [
      FoundScribeAccount({ access, features }),
      SucceededConnectAccount(),
    ])
    const signedOut = run(connected.model, [
      ClickedSignOut(),
      CompletedSignOutOfScribe(),
    ])
    expect(signedOut.commandNames).toEqual([
      'SignOutOfScribe',
      'LeaveForAccessLogout',
    ])
    expect(signedOut.model.connection._tag).toBe('SignedOutAccount')
  })

  it('stays signed out on a loopback preview until the listener signs in again', () => {
    const connected = run(init(), [
      FoundScribeAccount({ access: loopbackAccess, features }),
      SucceededConnectAccount(),
    ])
    const signedOut = run(connected.model, [CompletedSignOutOfScribe()])
    expect(signedOut.commandNames).toEqual([])
    expect(
      run(signedOut.model, [
        FoundScribeAccount({ access: loopbackAccess, features }),
      ]).model.connection._tag,
    ).toBe('SignedOutAccount')

    const again = run(signedOut.model, [ClickedSignInAgain()])
    expect(again.model.connection._tag).toBe('CheckingAccount')
    expect(again.commandNames).toEqual(['CheckAccess'])
  })
})

describe('copying', () => {
  it('asks the page to copy the account link', () => {
    expect(run(init(), [ClickedCopyAccountLink()]).outMessageTags).toEqual([
      'RequestedCopy',
    ])
  })
})

describe('origin answers', () => {
  it('reads who Cloudflare Access says the listener is and whether Scribe has the account', () => {
    const check = Effect.runSync(
      decodeAccessResponse(200, {
        email: 'owner@example.invalid',
        source: 'CloudflareAccess',
        expiresAtMs: 1_790_000_000_000,
        scribeAccount: 'Missing',
      }),
    )
    expect(check).toEqual({
      _tag: 'ScribeAccountMissing',
      access,
      features: { sharing: 'AwaitingSchema' },
    })
  })

  it('signs in when the origin creates the account on sign-in', () => {
    const check = Effect.runSync(
      decodeAccessResponse(200, {
        email: 'owner@example.invalid',
        source: 'CloudflareAccess',
        scribeAccount: 'Missing',
        accountCreation: 'Enabled',
      }),
    )
    expect(check._tag).toBe('ScribeAccountReady')
  })

  it('treats 401 as no Access identity and other refusals as errors the page shows', () => {
    expect(
      Effect.runSync(
        decodeAccessResponse(401, { error: 'MissingAccessIdentity' }),
      )._tag,
    ).toBe('AccessIdentityMissing')
    const failure = Effect.runSync(
      Effect.flip(decodeAccessResponse(503, { error: 'CheckUnavailable' })),
    )
    expect(failure.reason).toContain('could not reach')
  })

  it('explains a 409 from the session mint as the iPhone-first rule', () => {
    const failure = Effect.runSync(
      Effect.flip(
        decodeSessionResponse(409, {
          error: 'ConnectIPhoneFirst',
          email: 'owner@example.invalid',
        }),
      ),
    )
    expect(failure.reason).toContain('Sign in on the iPhone first')
  })
})

describe('ConnectAccount', () => {
  const originCalls: Array<string> = []
  const originLayer = (check: AccessCheck) =>
    Layer.succeed(WordsOrigin, {
      checkAccess: Effect.succeed(check),
      mintSession: Effect.sync(() => {
        originCalls.push('mintSession')
        return { email: access.email, token: 'refresh-token' }
      }),
      mintTranscriptionToken: Effect.fail(
        new WordsOriginError({
          operation: 'MintTranscriptionToken',
          reason: 'unused',
        }),
      ),
      readLiveBeat: () => Effect.succeed(Option.none()),
    })
  const emptyList = {
    recordings: [],
    skipped: { count: 0, maybeFirstReason: Option.none() },
  }

  it('keeps a session that is already signed in as the Access email', async () => {
    originCalls.length = 0
    const store = makeStaticWordsResources(
      SignedIn({
        userID: 'user-1',
        maybeEmail: Option.some('owner@example.invalid'),
        isGuest: false,
      }),
      emptyList,
      {},
    )
    const result = await Effect.runPromise(
      ConnectAccount({ email: access.email }).effect.pipe(
        Effect.provide(
          Layer.merge(
            store,
            originLayer(ScribeAccountReady({ access, features })),
          ),
        ),
      ),
    )
    expect(result._tag).toBe('SucceededConnectAccount')
    expect(originCalls).toEqual([])
  })

  it('mints a session from the Access identity when the browser is signed out', async () => {
    originCalls.length = 0
    const store = makeStaticWordsResources(SignedOut(), emptyList, {})
    const result = await Effect.runPromise(
      ConnectAccount({ email: access.email }).effect.pipe(
        Effect.provide(
          Layer.merge(
            store,
            originLayer(ScribeAccountReady({ access, features })),
          ),
        ),
      ),
    )
    expect(result._tag).toBe('SucceededConnectAccount')
    expect(originCalls).toEqual(['mintSession'])
  })

  it('reports a store that cannot sign in as a failed connect, never a crash', async () => {
    const signedOutStore = Effect.runSync(
      WordsStore.pipe(
        Effect.provide(makeStaticWordsResources(SignedOut(), emptyList, {})),
      ),
    )
    const failingStore = Layer.succeed(WordsStore, {
      ...signedOutStore,
      signInWithToken: () =>
        Effect.fail(
          new WordsStoreError({ operation: 'SignIn', cause: 'token rejected' }),
        ),
    })
    const result = await Effect.runPromise(
      ConnectAccount({ email: access.email }).effect.pipe(
        Effect.provide(
          Layer.merge(
            failingStore,
            originLayer(ScribeAccountReady({ access, features })),
          ),
        ),
      ),
    )
    expect(result._tag).toBe('FailedConnectAccount')
  })
})
