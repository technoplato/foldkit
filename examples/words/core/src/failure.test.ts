import { describe, expect, it } from 'vitest'

import { failureTextOf, plainCauseOf } from './failure.js'
import { WordsStoreError, storeFailureReasonOf } from './store.js'

describe('failure text', () => {
  it('names a network drop and a timeout in plain words, and nothing else', () => {
    expect(plainCauseOf(new TypeError('Failed to fetch'))).toBe(
      'The network connection dropped.',
    )
    expect(plainCauseOf(new TypeError('Load failed'))).toBe(
      'The network connection dropped.',
    )
    expect(
      plainCauseOf('Scribe did not confirm the write within 5 seconds.'),
    ).toBe('Scribe did not answer in time.')
    expect(plainCauseOf(new Error('permission denied: perms-pass'))).toBe('')
  })

  it('says what did not happen, then why, without operation names or internal errors', () => {
    expect(
      failureTextOf(
        'The audio did not upload.',
        new TypeError('Failed to fetch'),
      ),
    ).toBe('The audio did not upload. The network connection dropped.')
    expect(
      storeFailureReasonOf(
        new WordsStoreError({
          operation: 'ObserveRecording',
          cause: new Error('Validation failed for query'),
        }),
      ),
    ).toBe('The recording did not load.')
  })
})
