import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import { idSelector } from './selectors.js'

describe('idSelector', () => {
  it('builds a CSS id selector', () => {
    expect(idSelector('graduation-year-items')).toBe('#graduation-year-items')
  })

  it('escapes ids beginning with a digit into a valid selector', () => {
    const id = '889aeafb-48c6-42dd-9010-3de1b751c4eb-graduation-year-items'

    expect(idSelector(id)).toBe(`#${CSS.escape(id)}`)
    expect(() => document.querySelector(idSelector(id))).not.toThrow()
    expect(() => document.querySelector(`#${id}`)).toThrow()
  })
})
