import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  connectionFrom,
  isMadeUpSessionShared,
  isSilentOf,
  isTelemetryAsked,
  madeUpShelfOf,
} from './connection'

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

describe('the made-up library as one session on every device', () => {
  it('is shared only when asked for by name', () => {
    expect(isMadeUpSessionShared({ EXPO_PUBLIC_BOOKS_MADE_UP: 'shared' })).toBe(
      true,
    )
    expect(isMadeUpSessionShared({ EXPO_PUBLIC_BOOKS_MADE_UP: '1' })).toBe(
      false,
    )
    expect(isMadeUpSessionShared({})).toBe(false)
  })

  it('is still the made-up library, never a person’s own', () => {
    expect(
      Option.isNone(
        connectionFrom(
          {
            EXPO_PUBLIC_BOOKS_INSTANT_APP_ID: 'app-1',
            EXPO_PUBLIC_BOOKS_MADE_UP: 'shared',
          },
          'https://books.example',
        ),
      ),
    ).toBe(true)
  })
})

describe('how long the made-up shelf is', () => {
  it('is the long one only when asked for by name', () => {
    expect(madeUpShelfOf({ EXPO_PUBLIC_BOOKS_MADE_UP_SHELF: 'long' })).toBe(
      'Long',
    )
    expect(madeUpShelfOf({ EXPO_PUBLIC_BOOKS_MADE_UP_SHELF: '1' })).toBe(
      'Three',
    )
    expect(madeUpShelfOf({})).toBe('Three')
  })
})

describe('a trace from a build that is not for development', () => {
  it('is kept only when the build asks for it', () => {
    expect(isTelemetryAsked({ EXPO_PUBLIC_BOOKS_TELEMETRY: '1' })).toBe(true)
    expect(isTelemetryAsked({ EXPO_PUBLIC_BOOKS_TELEMETRY: ' ' })).toBe(false)
    expect(isTelemetryAsked({})).toBe(false)
  })
})

describe('whether the phone app makes any sound', () => {
  const real = { EXPO_PUBLIC_BOOKS_INSTANT_APP_ID: 'app-1' }

  it('is silent on the made-up library, which only tests and demonstrations open', () => {
    expect(isSilentOf({})).toBe(true)
    expect(isSilentOf({ ...real, EXPO_PUBLIC_BOOKS_MADE_UP: '1' })).toBe(true)
    expect(isSilentOf({ EXPO_PUBLIC_BOOKS_MADE_UP: 'shared' })).toBe(true)
  })

  it('sounds on the made-up library only when a person asks for its sound by name', () => {
    expect(isSilentOf({ EXPO_PUBLIC_BOOKS_MADE_UP_SOUND: '1' })).toBe(false)
  })

  it('sounds on a person’s own library', () => {
    expect(isSilentOf(real)).toBe(false)
  })

  it('is silent anywhere the test switch is on, whatever else is asked', () => {
    expect(isSilentOf({ ...real, EXPO_PUBLIC_FOLDKIT_SILENT: '1' })).toBe(true)
    expect(
      isSilentOf({
        EXPO_PUBLIC_BOOKS_MADE_UP_SOUND: '1',
        EXPO_PUBLIC_FOLDKIT_SILENT: '1',
      }),
    ).toBe(true)
  })
})
