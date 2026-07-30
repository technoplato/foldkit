import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import { makeHeadlessDatabases } from './database.js'

describe('headless Instant database boundary', () => {
  it('fails with only a missing variable name and no credential value', async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        makeHeadlessDatabases({
          INSTANT_APP_ID: '00000000-0000-4000-8000-000000000000',
        }),
      ),
    )

    expect(error).toStrictEqual(
      expect.objectContaining({
        _tag: 'HeadlessConfigurationError',
        variable: 'INSTANT_APP_ADMIN_TOKEN',
      }),
    )
    expect(JSON.stringify(error)).not.toContain('admin-token-value')
  })
})
