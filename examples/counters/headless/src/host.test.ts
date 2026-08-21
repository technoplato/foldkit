import { FailedWindow, StartingWindow } from 'counters-instant-example'
import { Effect } from 'effect'
import { TestConsole } from 'effect/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { executeHeadless, runHeadless } from './host.js'

const missingAppIdError =
  'COUNTERS_TAPE=instant needs INSTANT_APP_ID. Use the foldkit Instant demo wrapper.'

const previousInstantAppId = process.env['INSTANT_APP_ID']
const previousInstantAdminToken = process.env['INSTANT_APP_ADMIN_TOKEN']

const restoreEnv = (
  name: 'INSTANT_APP_ID' | 'INSTANT_APP_ADMIN_TOKEN',
  previous: string | undefined,
) => {
  if (previous === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = previous
}

describe('Multiple Counters headless Processor', () => {
  beforeEach(() => {
    delete process.env['INSTANT_APP_ID']
    delete process.env['INSTANT_APP_ADMIN_TOKEN']
  })

  afterEach(() => {
    restoreEnv('INSTANT_APP_ID', previousInstantAppId)
    restoreEnv('INSTANT_APP_ADMIN_TOKEN', previousInstantAdminToken)
  })

  it('fails Instant open as CountersHeadlessError, not a memory Ready list', async () => {
    const error = await Effect.runPromise(Effect.flip(executeHeadless([])))

    expect(error._tag).toBe('CountersHeadlessError')
    expect(error.message).toBe(missingAppIdError)
  })

  it('prints Starting then Failed when Instant is missing, not a silent increment', async () => {
    const lines = await Effect.runPromise(
      Effect.gen(function* () {
        yield* runHeadless(['increment', 'counter-1'])
        return yield* TestConsole.logLines
      }).pipe(Effect.provide(TestConsole.layer)),
    )

    expect(lines).toEqual([
      JSON.stringify(StartingWindow.make({})),
      JSON.stringify(FailedWindow.make({ error: missingAppIdError })),
    ])
  })
})
