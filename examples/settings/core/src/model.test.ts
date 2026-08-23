import { Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  Public,
  Restricted,
  Snapshot,
  TokenReady,
  defaultRestricted,
  isDefaultRestrictedEmails,
  ownerEmail,
  sampleSnapshot,
} from './model.js'

describe('Visibility', () => {
  it('keeps Public and Restricted exclusive', () => {
    expect(Public()._tag).toBe('Public')
    expect(defaultRestricted()._tag).toBe('Restricted')
    expect(defaultRestricted().emails).toEqual([ownerEmail])
    expect(isDefaultRestrictedEmails([ownerEmail])).toBe(true)
    expect(isDefaultRestrictedEmails([ownerEmail, 'a@b.com'])).toBe(false)
  })

  it('round-trips sample Snapshot', () => {
    const encoded = S.encodeUnknownSync(Snapshot)(sampleSnapshot)
    expect(S.decodeUnknownSync(Snapshot)(encoded)).toEqual(sampleSnapshot)
    expect(sampleSnapshot.token).toEqual(TokenReady())
    expect(Restricted.make({ emails: defaultRestricted().emails })._tag).toBe(
      'Restricted',
    )
  })
})
