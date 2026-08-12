import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  describeUnknownCause,
  logMultipleCountersV3Debug,
  multipleCountersV3DebugLogPrefix,
} from './debugLog.js'

describe('Multiple Counters v3 debug log', () => {
  it('flattens nested tagged admission failures for the operator console', () => {
    expect(
      describeUnknownCause({
        _tag: 'V3SharedProgramAdmissionResolutionError',
        occurrenceId: 'occurrence-open',
        proposalId: null,
        cause: {
          _tag: 'InvalidInteractionInvocationFactsError',
          cause: { _tag: 'Pointer', path: ['sessionId'] },
        },
      }),
    ).toBe(
      'V3SharedProgramAdmissionResolutionError (occurrenceId=occurrence-open): InvalidInteractionInvocationFactsError: Pointer',
    )
  })

  it('writes one JSON line that names the subject without Instant secrets', () => {
    const writes: Array<string> = []
    const originalWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === 'string' ? chunk : chunk.toString())
      return true
    }) as typeof process.stdout.write

    try {
      logMultipleCountersV3Debug('signed-in', {
        email: 'alice@fake.com',
        sessionIdLength: 134,
        subjectIdLength: 36,
      })
    } finally {
      process.stdout.write = originalWrite
    }

    expect(writes).toHaveLength(1)
    const maybeLine = Array.head(writes)
    expect(Option.isSome(maybeLine)).toBe(true)
    if (Option.isSome(maybeLine)) {
      expect(maybeLine.value.startsWith(`${multipleCountersV3DebugLogPrefix} `)).toBe(
        true,
      )
      expect(maybeLine.value).toContain('"event":"signed-in"')
      expect(maybeLine.value).toContain('alice@fake.com')
      expect(maybeLine.value).not.toContain('INSTANT_APP_ADMIN_TOKEN')
    }
  })
})
