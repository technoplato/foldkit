import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { connectionFrom, isBackAtBooks } from './connection'

const origin = 'https://books.example'

describe('which library the phone opens', () => {
  it('opens the made-up library when no Instant app is named', () => {
    expect(connectionFrom({}, origin)).toEqual(Option.none())
    expect(
      connectionFrom({ EXPO_PUBLIC_BOOKS_INSTANT_APP_ID: '  ' }, origin),
    ).toEqual(Option.none())
  })

  it('opens the library of the Instant app it is built with, through the site that signs people in', () => {
    expect(
      connectionFrom({ EXPO_PUBLIC_BOOKS_INSTANT_APP_ID: 'app-1' }, origin),
    ).toEqual(Option.some({ appId: 'app-1', sessionOrigin: origin }))
  })

  it('opens the made-up library when asked to, whatever app is named', () => {
    expect(
      connectionFrom(
        {
          EXPO_PUBLIC_BOOKS_INSTANT_APP_ID: 'app-1',
          EXPO_PUBLIC_BOOKS_MADE_UP: '1',
        },
        origin,
      ),
    ).toEqual(Option.none())
  })
})

describe('when a person has finished signing in', () => {
  it('is when the sign-in page has come back to Books itself', () => {
    expect(isBackAtBooks(`${origin}/books`, origin)).toBe(true)
    expect(isBackAtBooks(`${origin}/`, origin)).toBe(true)
  })

  it('is not while the sign-in is still on its own pages', () => {
    expect(
      isBackAtBooks(
        'https://team.cloudflareaccess.com/cdn-cgi/access/login/x',
        origin,
      ),
    ).toBe(false)
    expect(
      isBackAtBooks(`${origin}/cdn-cgi/access/authorized?nonce=1`, origin),
    ).toBe(false)
    expect(isBackAtBooks('https://books.example.evil.test/books', origin)).toBe(
      false,
    )
    expect(isBackAtBooks('about:blank', origin)).toBe(false)
  })
})
