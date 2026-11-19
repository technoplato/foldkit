import { describe, expect, it } from 'vitest'

import { outcomeOfSession, signInCallbackPath } from './signIn'

describe('what the system’s sign-in session came back with', () => {
  it('is signed in when the app’s link comes back carrying a session', () => {
    const outcome = outcomeOfSession({
      type: 'success',
      url: `foldkit-books://${signInCallbackPath}#cf_authorization=a.b.c`,
    })
    expect(outcome._tag).toBe('SignedIn')
    expect(outcome._tag === 'SignedIn' && outcome.accessToken).toBe('a.b.c')
  })

  it('is left when the person closes the sheet', () => {
    expect(outcomeOfSession({ type: 'cancel' })).toEqual({ _tag: 'Left' })
    expect(outcomeOfSession({ type: 'dismiss' })).toEqual({ _tag: 'Left' })
  })

  it('is no session when the link comes back with nothing in it', () => {
    expect(
      outcomeOfSession({
        type: 'success',
        url: `foldkit-books://${signInCallbackPath}`,
      }),
    ).toEqual({ _tag: 'NoSession' })
  })
})
