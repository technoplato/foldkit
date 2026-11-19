import { describe, expect, test } from 'vitest'

import { originFailureReason } from './originFailure.js'

// #754 (claude-code/scribe-A-242, 2026-10-17 02:07): his iPhone Safari's Settings said "words.pisspoursoftware.xyz did
// not answer within 5 seconds" when the request had been sent to Cloudflare Access's sign-in instead.
describe('a failed request to the words origin says what happened', () => {
  test('a request that ran out of time says it did not answer within 5 seconds', () => {
    const timeout = new DOMException('The operation timed out.', 'TimeoutError')
    expect(originFailureReason(timeout)).toBe(
      'words.pisspoursoftware.xyz did not answer within 5 seconds.',
    )
  })

  test('a request the browser could not complete says so, and that a sign-in redirect is the usual cause', () => {
    expect(originFailureReason(new TypeError('Load failed'))).toBe(
      'The browser could not complete the request to words.pisspoursoftware.xyz (Load failed). This browser is not signed in to words, or it is offline.',
    )
  })

  test('anything else says what it was', () => {
    expect(originFailureReason(new Error('boom'))).toBe(
      'The request to words.pisspoursoftware.xyz failed: boom',
    )
    expect(originFailureReason('odd')).toBe(
      'The request to words.pisspoursoftware.xyz failed: odd',
    )
  })
})
