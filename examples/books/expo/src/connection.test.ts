import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { connectionFrom } from './connection'

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
