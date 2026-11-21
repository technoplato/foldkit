import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  appVersionOf,
  isMadeUpSessionShared,
  madeUpEmailOf,
  madeUpNameOf,
  madeUpShelfOf,
} from './settings.js'

describe('how long the made-up shelf is', () => {
  it('is the long shelf only when the environment names it', () => {
    expect(madeUpShelfOf({ BOOKS_MADE_UP_SHELF: 'Long' })).toBe('Long')
    expect(madeUpShelfOf({ BOOKS_MADE_UP_SHELF: 'long' })).toBe('Three')
    expect(madeUpShelfOf({})).toBe('Three')
  })
})

describe('the made-up library as one session on every device', () => {
  it('is shared only when the environment asks for it by name', () => {
    expect(isMadeUpSessionShared({ BOOKS_MADE_UP_SESSION: 'shared' })).toBe(
      true,
    )
    expect(isMadeUpSessionShared({ BOOKS_MADE_UP_SESSION: '1' })).toBe(false)
    expect(isMadeUpSessionShared({})).toBe(false)
  })

  it('says nothing about which library opens: that is still BOOKS_MADE_UP', () => {
    expect(madeUpNameOf({ BOOKS_MADE_UP_SESSION: 'shared' })).toBeUndefined()
  })
})

describe('client metadata settings', () => {
  it('prefers BOOKS_APP_VERSION and falls back to a build stamp from the file mtime', () => {
    const here = fileURLToPath(import.meta.url)
    expect(appVersionOf(here, { BOOKS_APP_VERSION: 'v0.131.0' })).toBe(
      'v0.131.0',
    )
    expect(appVersionOf(here, {})).toMatch(/^v\d{8}-\d{4}$/)
    expect(appVersionOf('/nonexistent/books-daemon.js', {})).toBe('')
  })

  it('reads BOOKS_MADE_UP_EMAIL only when non-empty', () => {
    expect(
      madeUpEmailOf({ BOOKS_MADE_UP_EMAIL: ' michael@example.com ' }),
    ).toBe('michael@example.com')
    expect(madeUpEmailOf({ BOOKS_MADE_UP_EMAIL: '  ' })).toBeUndefined()
    expect(madeUpEmailOf({})).toBeUndefined()
  })
})
