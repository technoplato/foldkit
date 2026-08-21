import { Option } from 'effect'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import { executeCliOperation } from './host.js'

describe('Advocacy CLI', () => {
  it('lists meetings through the Program runtime', async () => {
    const model = await Effect.runPromise(
      executeCliOperation('List', Option.none()),
    )
    expect(model.meetings.length).toBeGreaterThan(0)
  })
})
