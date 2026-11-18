import { describe, expect, it } from 'vitest'

import { historyStepOf } from './issueHistory.js'

describe('the address follows the navigation', () => {
  it('pushes an entry for a new page, so Back returns to the list', () => {
    expect(historyStepOf('/issues?q=heart', '/issues/1538', false)).toBe('Push')
    expect(historyStepOf('/issues/1538', '/issues', false)).toBe('Push')
  })

  it('replaces the entry while typing a search, so Back does not take back a letter', () => {
    expect(historyStepOf('/issues?q=hea', '/issues?q=heart', false)).toBe(
      'Replace',
    )
    expect(historyStepOf('/issues', '/issues?q=h', false)).toBe('Replace')
  })

  it('keeps an address that already shows the place, and replaces while the browser goes back', () => {
    expect(historyStepOf('/issues?q=heart', '/issues?q=heart', false)).toBe(
      'Keep',
    )
    expect(historyStepOf('/issues/1538', '/issues?q=heart', true)).toBe(
      'Replace',
    )
  })
})
