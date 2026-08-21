import { Effect, Option, Schema as S } from 'effect'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import {
  AuthorizationRedirect,
  authProviderFromClientName,
  createAuthorizationURL,
  sendMagicCode,
  signInAsGuest,
  signInWithIdToken,
  signInWithMagicCode,
  signInWithToken,
  signOut,
} from './actions.js'
import { InstantFailure, WrongState } from './error.js'
import {
  AwaitingMagicCode,
  IdleFlow,
  RedirectingOAuth,
  SendingMagicCode,
} from './flow.js'
import {
  FailedIdentity,
  GuestIdentity,
  Identity,
  MemberIdentity,
  NoneIdentity,
} from './identity.js'
import {
  Auth,
  mergeObservedAuth,
  signedOutAuth,
  unknownAuth,
  withLinkedGuestIds,
} from './model.js'
import {
  type InstantAuthClient,
  type InstantAuthResult,
  type InstantAuthUser,
  type InstantMagicCodeSignInResult,
  authFromInstantResult,
  identityFromInstantUser,
  observeAuth,
} from './observe.js'

const guestId = '550e8400-e29b-41d4-a716-446655440000'
const memberId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
const memberEmail = 'member@example.com'
const guestEmail = 'guest@example.com'

const unusedClientError = (method: string): Error =>
  new Error(`Instant ${method} should not be called`)

const unusedClient = (): InstantAuthClient => ({
  createAuthorizationURL: () => {
    throw unusedClientError('createAuthorizationURL')
  },
  getAuth: () => Promise.reject(unusedClientError('getAuth')),
  sendMagicCode: () => Promise.reject(unusedClientError('sendMagicCode')),
  signInAsGuest: () => Promise.reject(unusedClientError('signInAsGuest')),
  signInWithIdToken: () =>
    Promise.reject(unusedClientError('signInWithIdToken')),
  signInWithMagicCode: () =>
    Promise.reject(unusedClientError('signInWithMagicCode')),
  signInWithToken: () => Promise.reject(unusedClientError('signInWithToken')),
  signOut: () => Promise.reject(unusedClientError('signOut')),
  subscribeAuth: () => {
    throw unusedClientError('subscribeAuth')
  },
})

const guestUser: InstantAuthUser = {
  id: guestId,
  isGuest: true,
}

const memberUser: InstantAuthUser = {
  email: memberEmail,
  id: memberId,
  isGuest: false,
}

const guestAuth: Auth = Auth.make({
  flow: IdleFlow.make({}),
  identity: GuestIdentity.make({
    extra: {},
    id: guestId,
  }),
})

const memberAuth: Auth = Auth.make({
  flow: IdleFlow.make({}),
  identity: MemberIdentity.make({
    email: memberEmail,
    extra: {},
    id: memberId,
    linkedGuestIds: [],
  }),
})

const failedAuth: Auth = Auth.make({
  flow: IdleFlow.make({}),
  identity: FailedIdentity.make({
    reason: 'restore failed',
  }),
})

const awaitingAuth = (email: string, identity = guestAuth.identity): Auth =>
  Auth.make({
    flow: AwaitingMagicCode.make({ email }),
    identity,
  })

const sendingAuth: Auth = Auth.make({
  flow: SendingMagicCode.make({ email: memberEmail }),
  identity: NoneIdentity.make({}),
})

type RecordedCall = Readonly<{
  args: unknown
  method: string
}>

const recordingClient = (
  handlers: Readonly<{
    createAuthorizationURL?: InstantAuthClient['createAuthorizationURL']
    getAuth?: InstantAuthClient['getAuth']
    sendMagicCode?: InstantAuthClient['sendMagicCode']
    signInAsGuest?: InstantAuthClient['signInAsGuest']
    signInWithIdToken?: InstantAuthClient['signInWithIdToken']
    signInWithMagicCode?: InstantAuthClient['signInWithMagicCode']
    signInWithToken?: InstantAuthClient['signInWithToken']
    signOut?: InstantAuthClient['signOut']
    subscribeAuth?: InstantAuthClient['subscribeAuth']
  }> = {},
): Readonly<{
  calls: Array<RecordedCall>
  client: InstantAuthClient
}> => {
  const calls: Array<RecordedCall> = []
  const record = (method: string, args: unknown) => {
    calls.push({ args, method })
  }
  return {
    calls,
    client: {
      createAuthorizationURL: params => {
        record('createAuthorizationURL', params)
        if (handlers.createAuthorizationURL !== undefined) {
          return handlers.createAuthorizationURL(params)
        } else {
          return 'https://auth.example/redirect'
        }
      },
      getAuth: () => {
        record('getAuth', undefined)
        if (handlers.getAuth !== undefined) {
          return handlers.getAuth()
        } else {
          return Promise.resolve(null)
        }
      },
      sendMagicCode: params => {
        record('sendMagicCode', params)
        if (handlers.sendMagicCode !== undefined) {
          return handlers.sendMagicCode(params)
        } else {
          return Promise.resolve({ sent: true })
        }
      },
      signInAsGuest: opts => {
        record('signInAsGuest', opts)
        if (handlers.signInAsGuest !== undefined) {
          return handlers.signInAsGuest(opts)
        } else {
          return Promise.resolve({ user: guestUser })
        }
      },
      signInWithIdToken: params => {
        record('signInWithIdToken', params)
        if (handlers.signInWithIdToken !== undefined) {
          return handlers.signInWithIdToken(params)
        } else {
          return Promise.resolve({ user: memberUser })
        }
      },
      signInWithMagicCode: params => {
        record('signInWithMagicCode', params)
        if (handlers.signInWithMagicCode !== undefined) {
          return handlers.signInWithMagicCode(params)
        } else {
          const result: InstantMagicCodeSignInResult = {
            created: false,
            user: memberUser,
          }
          return Promise.resolve(result)
        }
      },
      signInWithToken: token => {
        record('signInWithToken', token)
        if (handlers.signInWithToken !== undefined) {
          return handlers.signInWithToken(token)
        } else {
          return Promise.resolve({ user: memberUser })
        }
      },
      signOut: () => {
        record('signOut', undefined)
        if (handlers.signOut !== undefined) {
          return handlers.signOut()
        } else {
          return Promise.resolve(undefined)
        }
      },
      subscribeAuth: listener => {
        record('subscribeAuth', undefined)
        if (handlers.subscribeAuth !== undefined) {
          return handlers.subscribeAuth(listener)
        } else {
          return () => undefined
        }
      },
    },
  }
}

const expectWrongState = (
  error: InstantFailure | WrongState,
  action: string,
  message: string,
) => {
  expect(error).toBeInstanceOf(WrongState)
  if (error._tag === 'WrongState') {
    expect(error.action).toBe(action)
    expect(error.message).toBe(message)
  }
}

describe('Identity schema', () => {
  it('decodes GuestIdentity without an email and MemberIdentity with an email', () => {
    const guest = GuestIdentity.make({
      extra: {},
      id: guestId,
    })
    expect(guest).not.toHaveProperty('email')
    expect(guest._tag).toBe('GuestIdentity')

    const member = MemberIdentity.make({
      email: memberEmail,
      extra: {},
      id: memberId,
      linkedGuestIds: [guestId],
    })
    expect(member.email).toBe(memberEmail)
    expect(member.linkedGuestIds).toEqual([guestId])
  })

  it('rejects GuestIdentity payloads that carry an email and MemberIdentity payloads without one', () => {
    const guestWithEmail = S.decodeUnknownOption(GuestIdentity)({
      _tag: 'GuestIdentity',
      email: guestEmail,
      extra: {},
      id: guestId,
    })
    if (Option.isSome(guestWithEmail)) {
      expect(guestWithEmail.value).not.toHaveProperty('email')
      expect(guestWithEmail.value._tag).toBe('GuestIdentity')
    } else {
      expect(Option.isNone(guestWithEmail)).toBe(true)
    }

    expect(
      Option.isNone(
        S.decodeUnknownOption(MemberIdentity)({
          _tag: 'MemberIdentity',
          extra: {},
          id: memberId,
          linkedGuestIds: [],
        }),
      ),
    ).toBe(true)

    expect(
      Option.isNone(
        S.decodeUnknownOption(Identity)({
          _tag: 'GuestIdentity',
          extra: {},
          id: guestId,
          email: guestEmail,
        }),
      ) ||
        (Option.isSome(
          S.decodeUnknownOption(Identity)({
            _tag: 'GuestIdentity',
            extra: {},
            id: guestId,
            email: guestEmail,
          }),
        ) &&
          !(
            'email' in
            Option.getOrThrow(
              S.decodeUnknownOption(Identity)({
                _tag: 'GuestIdentity',
                extra: {},
                id: guestId,
                email: guestEmail,
              }),
            )
          )),
    ).toBe(true)
  })
})

describe('observeAuth mapping', () => {
  it('maps Instant error, absence, guest, and member payloads', () => {
    expect(
      authFromInstantResult({
        error: { message: 'restore failed' },
      }),
    ).toEqual(
      Auth.make({
        flow: IdleFlow.make({}),
        identity: FailedIdentity.make({ reason: 'restore failed' }),
      }),
    )
    expect(authFromInstantResult({})).toEqual(signedOutAuth)
    expect(
      authFromInstantResult({
        user: { id: guestId, isGuest: true },
      }),
    ).toEqual(guestAuth)
    expect(
      authFromInstantResult({
        user: {
          email: guestEmail,
          id: guestId,
          isGuest: true,
        },
      }).identity,
    ).toEqual(guestAuth.identity)
    expect(
      authFromInstantResult({
        user: { id: memberId, isGuest: false },
      }).identity._tag,
    ).toBe('GuestIdentity')
    expect(
      authFromInstantResult({
        user: memberUser,
      }),
    ).toEqual(memberAuth)
  })

  it('does not decode a guest Instant user with email as MemberIdentity', () => {
    const maybeIdentity = identityFromInstantUser({
      email: guestEmail,
      id: guestId,
      isGuest: true,
    })
    expect(Option.isSome(maybeIdentity)).toBe(true)
    if (Option.isSome(maybeIdentity)) {
      expect(maybeIdentity.value._tag).toBe('GuestIdentity')
      expect(maybeIdentity.value).not.toHaveProperty('email')
    }
  })

  it('forwards Instant subscribeAuth observations without calling other methods', () => {
    const observed: Array<Auth> = []
    let listener: ((result: InstantAuthResult) => void) | undefined
    const recorded = recordingClient({
      subscribeAuth: nextListener => {
        listener = nextListener
        return () => {
          listener = undefined
        }
      },
    })
    const unsubscribe = observeAuth(recorded.client, auth => {
      observed.push(auth)
    })
    expect(listener).toBeDefined()
    if (listener !== undefined) {
      listener({ user: guestUser })
      listener({})
      listener({ error: { message: 'boom' } })
    }
    expect(observed).toEqual([
      guestAuth,
      signedOutAuth,
      Auth.make({
        flow: IdleFlow.make({}),
        identity: FailedIdentity.make({ reason: 'boom' }),
      }),
    ])
    unsubscribe()
    expect(recorded.calls.map(call => call.method)).toEqual(['subscribeAuth'])
  })
})

describe('signInAsGuest WrongState', () => {
  it.effect(
    'rejects guest, member, unknown, failed, and busy flows before Instant',
    () =>
      Effect.gen(function* () {
        const client = unusedClient()
        expectWrongState(
          yield* Effect.flip(signInAsGuest(client, guestAuth)),
          'signInAsGuest',
          "Can't sign in as guest while already signed in as guest.",
        )
        expectWrongState(
          yield* Effect.flip(signInAsGuest(client, memberAuth)),
          'signInAsGuest',
          "Can't sign in as guest while already signed in as member.",
        )
        expectWrongState(
          yield* Effect.flip(signInAsGuest(client, unknownAuth)),
          'signInAsGuest',
          "Can't sign in as guest until authentication has been observed as signed out.",
        )
        expectWrongState(
          yield* Effect.flip(signInAsGuest(client, failedAuth)),
          'signInAsGuest',
          "Can't sign in as guest until authentication has been observed as signed out.",
        )
        expectWrongState(
          yield* Effect.flip(signInAsGuest(client, sendingAuth)),
          'signInAsGuest',
          "Can't sign in as guest while another authentication method is in progress.",
        )
      }),
  )
})

describe('sendMagicCode WrongState', () => {
  it.effect(
    'rejects member, unknown, failed, and busy flows before Instant',
    () =>
      Effect.gen(function* () {
        const client = unusedClient()
        expectWrongState(
          yield* Effect.flip(sendMagicCode(client, memberAuth, memberEmail)),
          'sendMagicCode',
          "Can't send a magic code while already signed in as member.",
        )
        expectWrongState(
          yield* Effect.flip(sendMagicCode(client, unknownAuth, memberEmail)),
          'sendMagicCode',
          "Can't send a magic code until authentication is signed out or a guest.",
        )
        expectWrongState(
          yield* Effect.flip(sendMagicCode(client, failedAuth, memberEmail)),
          'sendMagicCode',
          "Can't send a magic code until authentication is signed out or a guest.",
        )
        expectWrongState(
          yield* Effect.flip(
            sendMagicCode(client, awaitingAuth(memberEmail), memberEmail),
          ),
          'sendMagicCode',
          "Can't send a magic code while another authentication method is in progress.",
        )
      }),
  )
})

describe('signInWithMagicCode WrongState', () => {
  it.effect('rejects when no matching magic code is awaiting', () =>
    Effect.gen(function* () {
      const client = unusedClient()
      const params = { code: '123456', email: memberEmail }
      expectWrongState(
        yield* Effect.flip(signInWithMagicCode(client, signedOutAuth, params)),
        'signInWithMagicCode',
        'No magic code is awaiting for that email.',
      )
      expectWrongState(
        yield* Effect.flip(
          signInWithMagicCode(
            client,
            awaitingAuth('other@example.com'),
            params,
          ),
        ),
        'signInWithMagicCode',
        'No magic code is awaiting for that email.',
      )
      expectWrongState(
        yield* Effect.flip(signInWithMagicCode(client, sendingAuth, params)),
        'signInWithMagicCode',
        'No magic code is awaiting for that email.',
      )
    }),
  )
})

describe('signInWithIdToken WrongState', () => {
  it.effect(
    'rejects member, unknown, failed, and busy flows before Instant',
    () =>
      Effect.gen(function* () {
        const client = unusedClient()
        const params = {
          clientName: 'google',
          idToken: 'id-token',
        }
        expectWrongState(
          yield* Effect.flip(signInWithIdToken(client, memberAuth, params)),
          'signInWithIdToken',
          "Can't sign in with an identity token while already signed in as member.",
        )
        expectWrongState(
          yield* Effect.flip(signInWithIdToken(client, unknownAuth, params)),
          'signInWithIdToken',
          "Can't sign in with an identity token until authentication is signed out or a guest.",
        )
        expectWrongState(
          yield* Effect.flip(signInWithIdToken(client, failedAuth, params)),
          'signInWithIdToken',
          "Can't sign in with an identity token until authentication is signed out or a guest.",
        )
        expectWrongState(
          yield* Effect.flip(
            signInWithIdToken(client, awaitingAuth(memberEmail), params),
          ),
          'signInWithIdToken',
          "Can't sign in with an identity token while another authentication method is in progress.",
        )
      }),
  )
})

describe('signInWithToken WrongState', () => {
  it.effect(
    'rejects member, unknown, failed, and busy flows before Instant',
    () =>
      Effect.gen(function* () {
        const client = unusedClient()
        expectWrongState(
          yield* Effect.flip(signInWithToken(client, memberAuth, 'token')),
          'signInWithToken',
          "Can't sign in with a hosted identity token while already signed in as member.",
        )
        expectWrongState(
          yield* Effect.flip(signInWithToken(client, unknownAuth, 'token')),
          'signInWithToken',
          "Can't sign in with a hosted identity token until authentication is signed out or a guest.",
        )
        expectWrongState(
          yield* Effect.flip(
            signInWithToken(client, awaitingAuth(memberEmail), 'token'),
          ),
          'signInWithToken',
          "Can't sign in with a hosted identity token while another authentication method is in progress.",
        )
      }),
  )
})

describe('createAuthorizationURL WrongState', () => {
  it.effect(
    'rejects member, unknown, failed, and busy flows before Instant',
    () =>
      Effect.gen(function* () {
        const client = unusedClient()
        const params = {
          clientName: 'google',
          redirectURL: 'https://app.example/callback',
        }
        expectWrongState(
          yield* Effect.flip(
            createAuthorizationURL(client, memberAuth, params),
          ),
          'createAuthorizationURL',
          "Can't start OAuth while already signed in as member.",
        )
        expectWrongState(
          yield* Effect.flip(
            createAuthorizationURL(client, unknownAuth, params),
          ),
          'createAuthorizationURL',
          "Can't start OAuth until authentication is signed out or a guest.",
        )
        expectWrongState(
          yield* Effect.flip(
            createAuthorizationURL(client, failedAuth, params),
          ),
          'createAuthorizationURL',
          "Can't start OAuth until authentication is signed out or a guest.",
        )
        expectWrongState(
          yield* Effect.flip(
            createAuthorizationURL(client, sendingAuth, params),
          ),
          'createAuthorizationURL',
          "Can't start OAuth while another authentication method is in progress.",
        )
      }),
  )
})

describe('signOut WrongState', () => {
  it.effect('rejects none, unknown, and failed identities before Instant', () =>
    Effect.gen(function* () {
      const client = unusedClient()
      expectWrongState(
        yield* Effect.flip(signOut(client, signedOutAuth)),
        'signOut',
        'Already signed out.',
      )
      expectWrongState(
        yield* Effect.flip(signOut(client, unknownAuth)),
        'signOut',
        "Can't sign out before authentication has been observed.",
      )
      expectWrongState(
        yield* Effect.flip(signOut(client, failedAuth)),
        'signOut',
        "Can't sign out while authentication is failed.",
      )
    }),
  )
})

describe('allowed Instant transitions', () => {
  it.effect('signs in as guest from NoneIdentity and IdleFlow', () =>
    Effect.gen(function* () {
      const recorded = recordingClient()
      const extraFields = { displayName: 'Ada' }
      const next = yield* signInAsGuest(
        recorded.client,
        signedOutAuth,
        extraFields,
      )
      expect(next.identity).toEqual(guestAuth.identity)
      expect(next.flow._tag).toBe('IdleFlow')
      expect(recorded.calls).toEqual([
        {
          args: { extraFields },
          method: 'signInAsGuest',
        },
      ])
      expect(JSON.stringify(next)).not.toContain('displayName')
    }),
  )

  it.effect('sends a magic code from NoneIdentity or GuestIdentity', () =>
    Effect.gen(function* () {
      const recorded = recordingClient()
      const fromNone = yield* sendMagicCode(
        recorded.client,
        signedOutAuth,
        memberEmail,
      )
      const fromGuest = yield* sendMagicCode(
        recorded.client,
        guestAuth,
        memberEmail,
      )
      expect(fromNone).toEqual(
        Auth.make({
          flow: AwaitingMagicCode.make({ email: memberEmail }),
          identity: NoneIdentity.make({}),
        }),
      )
      expect(fromGuest).toEqual(awaitingAuth(memberEmail, guestAuth.identity))
      expect(recorded.calls).toEqual([
        { args: { email: memberEmail }, method: 'sendMagicCode' },
        { args: { email: memberEmail }, method: 'sendMagicCode' },
      ])
    }),
  )

  it.effect('verifies a matching awaiting magic code', () =>
    Effect.gen(function* () {
      const extraFields = { plan: 'pro' }
      const recorded = recordingClient()
      const next = yield* signInWithMagicCode(
        recorded.client,
        awaitingAuth(memberEmail),
        {
          code: '123456',
          email: memberEmail,
          extraFields,
        },
      )
      expect(next).toEqual(memberAuth)
      expect(recorded.calls).toEqual([
        {
          args: {
            code: '123456',
            email: memberEmail,
            extraFields,
          },
          method: 'signInWithMagicCode',
        },
      ])
      expect(JSON.stringify(next)).not.toContain('123456')
      expect(JSON.stringify(next)).not.toContain('plan')
    }),
  )

  it.effect(
    'exchanges an identity token from NoneIdentity or GuestIdentity',
    () =>
      Effect.gen(function* () {
        const recorded = recordingClient()
        const next = yield* signInWithIdToken(recorded.client, guestAuth, {
          clientName: 'google',
          extraFields: { locale: 'en' },
          idToken: 'id-token',
          nonce: 'nonce-1',
        })
        expect(next).toEqual(memberAuth)
        expect(recorded.calls).toEqual([
          {
            args: {
              clientName: 'google',
              extraFields: { locale: 'en' },
              idToken: 'id-token',
              nonce: 'nonce-1',
            },
            method: 'signInWithIdToken',
          },
        ])
        expect(JSON.stringify(next)).not.toContain('id-token')
        expect(JSON.stringify(next)).not.toContain('nonce-1')
      }),
  )

  it.effect(
    'exchanges a hosted identity token from NoneIdentity or GuestIdentity',
    () =>
      Effect.gen(function* () {
        const recorded = recordingClient()
        const next = yield* signInWithToken(
          recorded.client,
          guestAuth,
          'hosted-refresh-token',
        )
        expect(next).toEqual(memberAuth)
        expect(recorded.calls).toEqual([
          {
            args: 'hosted-refresh-token',
            method: 'signInWithToken',
          },
        ])
        expect(JSON.stringify(next)).not.toContain('hosted-refresh-token')
      }),
  )

  it.effect('returns a redirect URL and RedirectingOAuth Auth', () =>
    Effect.gen(function* () {
      const recorded = recordingClient()
      const redirect = yield* createAuthorizationURL(
        recorded.client,
        signedOutAuth,
        {
          clientName: 'google',
          redirectURL: 'https://app.example/callback',
        },
      )
      expect(redirect).toEqual(
        AuthorizationRedirect.make({
          auth: Auth.make({
            flow: RedirectingOAuth.make({
              nonce: Option.none(),
              provider: 'google',
            }),
            identity: NoneIdentity.make({}),
          }),
          url: 'https://auth.example/redirect',
        }),
      )
      expect(authProviderFromClientName('not-a-provider')).toBe('custom')
    }),
  )

  it.effect('signs out guest and member identities', () =>
    Effect.gen(function* () {
      const recorded = recordingClient()
      expect(yield* signOut(recorded.client, guestAuth)).toEqual(signedOutAuth)
      expect(yield* signOut(recorded.client, memberAuth)).toEqual(signedOutAuth)
      expect(recorded.calls.map(call => call.method)).toEqual([
        'signOut',
        'signOut',
      ])
    }),
  )

  it.effect('wraps Instant body messages as InstantFailure', () =>
    Effect.gen(function* () {
      const recorded = recordingClient({
        signInAsGuest: () =>
          Promise.reject({
            body: { message: 'Guest auth is disabled.' },
          }),
      })
      const error = yield* Effect.flip(
        signInAsGuest(recorded.client, signedOutAuth),
      )
      expect(error).toBeInstanceOf(InstantFailure)
      if (error._tag === 'InstantFailure') {
        expect(error.message).toBe('Guest auth is disabled.')
      }
    }),
  )
})

describe('observed Auth merging', () => {
  it('keeps AwaitingMagicCode when the same guest is re-observed', () => {
    const awaiting = awaitingAuth(memberEmail, guestAuth.identity)
    const merged = mergeObservedAuth(
      awaiting,
      authFromInstantResult({ user: guestUser }),
    )
    expect(merged.flow).toEqual(AwaitingMagicCode.make({ email: memberEmail }))
    expect(merged.identity).toEqual(guestAuth.identity)
  })

  it('idles when identity becomes member or signed out', () => {
    const awaiting = awaitingAuth(memberEmail, guestAuth.identity)
    expect(
      mergeObservedAuth(awaiting, authFromInstantResult({ user: memberUser }))
        .flow._tag,
    ).toBe('IdleFlow')
    expect(mergeObservedAuth(awaiting, signedOutAuth)).toEqual(signedOutAuth)
  })

  it('fills linked guest ids on a member without touching Flow', () => {
    const next = withLinkedGuestIds(memberAuth, [guestId])
    expect(next.flow).toEqual(IdleFlow.make({}))
    if (next.identity._tag === 'MemberIdentity') {
      expect(next.identity.linkedGuestIds).toEqual([guestId])
    } else {
      expect(next.identity._tag).toBe('MemberIdentity')
    }
  })
})
