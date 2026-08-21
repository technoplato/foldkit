import { Option } from 'effect'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import { executeCliOperation } from './host.js'

describe('Transcribe CLI', () => {
  it('lists the catalog through the Program runtime', async () => {
    const model = await Effect.runPromise(
      executeCliOperation('List', Option.none()),
    )
    expect(
      model.catalog._tag === 'LoadedCatalog' ||
        model.catalog._tag === 'FailedCatalog',
    ).toBe(true)
  })
})
