import { describe, expect, it } from 'vitest'

import {
  FailedCountersSession,
  SignedInCountersSession,
  establishCountersSession,
  fetchCountersDemoSession,
} from './session.js'

type FakeUser = Readonly<{ id: string }> | null

const fakeDatabase = (input: {
  user?: FakeUser
  signIn?: (token: string) => Promise<void>
}) => {
  let user: FakeUser = input.user ?? null
  return {
    auth: {
      signInWithToken: async (token: string) => {
        if (input.signIn !== undefined) {
          await input.signIn(token)
        }
        user = { id: `user-for-${token}` }
      },
    },
    getAuth: async () => user,
  }
}

describe('establishCountersSession', () => {
  it('reuses an existing Instant session', async () => {
    const session = await establishCountersSession({
      database: fakeDatabase({ user: { id: 'existing' } }),
      ensureHostedSession: async () => {
        throw new Error('hosted sign-in must not run')
      },
    })
    expect(session).toEqual(
      SignedInCountersSession.make({ userId: 'existing' }),
    )
  })

  it('returns Failed when Instant has no session', async () => {
    const session = await establishCountersSession({
      database: fakeDatabase({ user: null }),
      ensureHostedSession: async () => undefined,
    })
    expect(session).toEqual(
      FailedCountersSession.make({
        error: 'Sign-in failed. Instant has no session.',
      }),
    )
  })

  it('rejects a Metro-relative mint path', async () => {
    const session = await establishCountersSession({
      database: fakeDatabase({ user: null }),
      ensureHostedSession: async () => undefined,
      sessionUrl: '/__foldkit/counters-demo-session',
    })
    expect(session._tag).toBe('FailedCountersSession')
    if (session._tag === 'FailedCountersSession') {
      expect(session.error).toContain('absolute URL')
    }
  })

  it('signs in with a token from an absolute mint URL', async () => {
    const session = await establishCountersSession({
      database: fakeDatabase({ user: null }),
      ensureHostedSession: async () => undefined,
      fetch: async () =>
        new Response(
          JSON.stringify({ email: 'counter@foldkit.dev', token: 'demo' }),
          { status: 200 },
        ),
      sessionUrl: 'http://127.0.0.1:5213/__foldkit/counters-demo-session',
    })
    expect(session).toEqual(
      SignedInCountersSession.make({ userId: 'user-for-demo' }),
    )
  })
})

describe('fetchCountersDemoSession', () => {
  it('reads a token from an absolute mint URL', async () => {
    const maybeToken = await fetchCountersDemoSession(
      'http://127.0.0.1:9/__foldkit/counters-demo-session',
      async () =>
        new Response(
          JSON.stringify({ email: 'counter@foldkit.dev', token: 't' }),
          {
            status: 200,
          },
        ),
    )
    expect(maybeToken._tag).toBe('Some')
    if (maybeToken._tag === 'Some') {
      expect(maybeToken.value).toBe('t')
    }
  })

  it('ignores a Metro-relative mint path', async () => {
    const maybeToken = await fetchCountersDemoSession(
      '/__foldkit/counters-demo-session',
    )
    expect(maybeToken._tag).toBe('None')
  })
})
