import { describe, expect, it } from 'vitest'

import { isMadeUpSessionShared, madeUpNameOf } from './settings.js'

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
