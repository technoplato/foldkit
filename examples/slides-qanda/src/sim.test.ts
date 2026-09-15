import { describe, expect, test } from 'vitest'

import { SUBMIT_ASCII } from './sim'

describe('submit ASCII', () => {
  test('the bundle tree has no license file', () => {
    expect(SUBMIT_ASCII.includes('LICENSE')).toBe(false)
    expect(SUBMIT_ASCII.includes('package.json')).toBe(true)
    expect(SUBMIT_ASCII.includes('submission fee')).toBe(true)
    expect(SUBMIT_ASCII.includes('pot')).toBe(false)
  })
})
