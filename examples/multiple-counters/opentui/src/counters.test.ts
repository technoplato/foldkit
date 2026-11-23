import { describe, expect, it } from 'bun:test'

import { paintAt } from './paintAt.js'

describe('Multiple Counters on OpenTUI', () => {
  it('paints the list with each counter and its buttons', async () => {
    const painted = await paintAt(['Add', 'Increment:2'])
    expect(painted).toContain('/counters')
    expect(painted).toContain('Counter 1')
    expect(painted).toContain('Counter 2')
    expect(painted).toContain('Add counter')
  })

  it('floats the delete question over the counter page', async () => {
    const painted = await paintAt(['Open:1', 'Delete'])
    expect(painted).toContain('/counters/1/delete/1')
    expect(painted).toContain('Delete Counter 1?')
    expect(painted).toContain('Delete (y)')
    expect(painted).toContain('Cancel (n)')
  })
})
