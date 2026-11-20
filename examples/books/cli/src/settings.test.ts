import { describe, expect, it } from 'vitest'

import {
  isMadeUpSessionShared,
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
