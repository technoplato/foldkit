import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  PrivateAudience,
  PublicAudience,
  UnlistedAudience,
} from './audience.js'
import { Reader } from './link.js'
import { Share } from './model.js'
import { noteViewRuleParams, parseSharePath, printSharePath } from './path.js'

const subjectId = '550e8400-e29b-41d4-a716-446655440000'
const linkId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
const secret = 'share-secret-one'

const link = {
  id: linkId,
  role: Reader.make({}),
  secret,
}

const privateShare = Share.make({
  audience: PrivateAudience.make({}),
  links: [link],
  subjectId,
})

const unlistedShare = Share.make({
  audience: UnlistedAudience.make({}),
  links: [link],
  subjectId,
})

const publicShare = Share.make({
  audience: PublicAudience.make({}),
  links: [link],
  subjectId,
})

describe('printSharePath', () => {
  it('prints /n/:id for private, including when a link exists', () => {
    expect(printSharePath(privateShare)).toBe(`/n/${subjectId}`)
    expect(printSharePath(privateShare, link)).toBe(`/n/${subjectId}`)
  })

  it('prints /n/:id?s=:secret for unlisted', () => {
    expect(printSharePath(unlistedShare)).toBe(`/n/${subjectId}?s=${secret}`)
    expect(printSharePath(unlistedShare, link)).toBe(
      `/n/${subjectId}?s=${secret}`,
    )
  })

  it('prints /n/:id for public', () => {
    expect(printSharePath(publicShare)).toBe(`/n/${subjectId}`)
  })

  it('prints /n/:id for unlisted when no link secret exists', () => {
    const bare = Share.make({
      audience: UnlistedAudience.make({}),
      links: [],
      subjectId,
    })
    expect(printSharePath(bare)).toBe(`/n/${subjectId}`)
  })
})

describe('parseSharePath', () => {
  it('parses a public or private path without a secret', () => {
    const parsed = parseSharePath(`/n/${subjectId}`)
    expect(Option.isSome(parsed)).toBe(true)
    if (Option.isSome(parsed)) {
      expect(parsed.value.subjectId).toBe(subjectId)
      expect(Option.isNone(parsed.value.secret)).toBe(true)
    }
  })

  it('parses an unlisted path with s in the query', () => {
    const parsed = parseSharePath(`/n/${subjectId}?s=${secret}`)
    expect(Option.isSome(parsed)).toBe(true)
    if (Option.isSome(parsed)) {
      expect(parsed.value.subjectId).toBe(subjectId)
      expect(parsed.value.secret).toEqual(Option.some(secret))
    }
  })

  it('parses path+search from a host carrier', () => {
    const parsed = parseSharePath(
      `https://books.example/n/${subjectId}?s=${secret}#hash`,
    )
    expect(parsed).toEqual(parseSharePath(`/n/${subjectId}?s=${secret}`))
  })

  it('roundtrips print then parse for every audience', () => {
    for (const share of [privateShare, unlistedShare, publicShare]) {
      const printed = printSharePath(share)
      const parsed = parseSharePath(printed)
      expect(Option.isSome(parsed)).toBe(true)
      if (Option.isSome(parsed)) {
        expect(parsed.value.subjectId).toBe(subjectId)
        if (share.audience._tag === 'UnlistedAudience') {
          expect(parsed.value.secret).toEqual(Option.some(secret))
        } else {
          expect(Option.isNone(parsed.value.secret)).toBe(true)
        }
      }
    }
  })

  it('rejects a path that is not /n/:uuid', () => {
    expect(Option.isNone(parseSharePath('/book/abc'))).toBe(true)
    expect(Option.isNone(parseSharePath('/n/not-a-uuid'))).toBe(true)
    expect(Option.isNone(parseSharePath('/n'))).toBe(true)
  })
})

describe('noteViewRuleParams', () => {
  it('maps subjectId onto Instant knownDocId', () => {
    expect(noteViewRuleParams({ subjectId })).toEqual({
      knownDocId: subjectId,
      secret: '',
    })
  })

  it('forwards a query secret for Instant ruleParams.secret', () => {
    expect(
      noteViewRuleParams({ secret: Option.some(secret), subjectId }),
    ).toEqual({
      knownDocId: subjectId,
      secret,
    })
    expect(noteViewRuleParams({ secret, subjectId })).toEqual({
      knownDocId: subjectId,
      secret,
    })
  })
})

describe('Share schema', () => {
  it('accepts a private share that holds links', () => {
    const decoded = S.decodeUnknownOption(Share)({
      audience: { _tag: 'PrivateAudience' },
      links: [link],
      subjectId,
    })
    expect(Option.isSome(decoded)).toBe(true)
    if (Option.isSome(decoded)) {
      expect(decoded.value.links).toHaveLength(1)
      expect(decoded.value.audience._tag).toBe('PrivateAudience')
    }
  })
})
