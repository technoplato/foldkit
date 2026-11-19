import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { addressExpiresAtMs, addressKeyOf, keptAddress } from './addresses.js'

// NOTE: A file store hands out signed addresses: the same file under an
// address whose signature is renewed now and then. A Client that takes
// each new address loads the same picture again. The file is named by its
// address without the signature, and the address a Client already holds
// is kept until it is about to stop working.

const hour = 3_600_000

const now = Date.UTC(2026, 10, 18, 21, 0, 0)

// A policy as a content network signs it: base64 with `-`, `_` and `~` in
// place of `+`, `=` and `/`.
const policyThatEndsAt = (epochSeconds: number): string =>
  Buffer.from(
    JSON.stringify({
      Statement: [
        {
          Resource: 'https://files.example/made-up/1/cover',
          Condition: { DateLessThan: { 'AWS:EpochTime': epochSeconds } },
        },
      ],
    }),
  )
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('=', '_')
    .replaceAll('/', '~')

const signed = (signature: string, endsAtMs: number): string =>
  `https://files.example/made-up/1/cover?Key-Pair-Id=K1&Policy=${policyThatEndsAt(Math.floor(endsAtMs / 1_000))}&Signature=${signature}&response-cache-control=public`

describe('the file a signed address names', () => {
  it('is its address without the signature, the same for every renewal', () => {
    expect(addressKeyOf(signed('first', now + hour))).toBe(
      'https://files.example/made-up/1/cover',
    )
    expect(addressKeyOf(signed('first', now + hour))).toBe(
      addressKeyOf(signed('second', now + 9 * hour)),
    )
  })

  it('is another file at another path', () => {
    expect(
      addressKeyOf('https://files.example/made-up/2/cover?Signature=a'),
    ).not.toBe(
      addressKeyOf('https://files.example/made-up/1/cover?Signature=a'),
    )
  })

  it('is the text itself when it is not an address', () => {
    expect(addressKeyOf('not an address')).toBe('not an address')
  })
})

describe('when a signed address stops working', () => {
  it('is read from a signed policy', () => {
    expect(addressExpiresAtMs(signed('a', now + hour))).toEqual(
      Option.some(now + hour),
    )
  })

  it('is read from an Expires time, in seconds', () => {
    expect(
      addressExpiresAtMs(
        `https://files.example/a?Expires=${((now + hour) / 1_000).toString()}&Signature=s`,
      ),
    ).toEqual(Option.some(now + hour))
  })

  it('is read from a signing date and how long it lasts', () => {
    expect(
      addressExpiresAtMs(
        'https://files.example/a?X-Amz-Date=20261118T210000Z&X-Amz-Expires=3600&X-Amz-Signature=s',
      ),
    ).toEqual(Option.some(now + hour))
  })

  it('is not known for an address that does not say', () => {
    expect(addressExpiresAtMs('https://files.example/a.jpg')).toEqual(
      Option.none(),
    )
    expect(addressExpiresAtMs('https://files.example/a?Policy=%%%')).toEqual(
      Option.none(),
    )
  })
})

describe('the address a Client keeps for a file', () => {
  const held = signed('first', now + 8 * hour)
  const renewed = signed('second', now + 24 * hour)

  it('is the one that arrived when it holds none', () => {
    expect(keptAddress(Option.none(), renewed, now)).toBe(renewed)
  })

  it('is the one it holds while that still works, though a renewed one arrived', () => {
    expect(keptAddress(Option.some(held), renewed, now)).toBe(held)
  })

  it('is the renewed one once the held one is within an hour of ending, or has ended', () => {
    expect(keptAddress(Option.some(held), renewed, now + 7.5 * hour)).toBe(
      renewed,
    )
    expect(keptAddress(Option.some(held), renewed, now + 9 * hour)).toBe(
      renewed,
    )
  })

  it('is the one that arrived when the file is another one', () => {
    const other = 'https://files.example/made-up/2/cover?Signature=x'
    expect(keptAddress(Option.some(held), other, now)).toBe(other)
  })

  it('is the one that arrived when the held one does not say when it ends', () => {
    expect(
      keptAddress(
        Option.some('https://files.example/made-up/1/cover?Signature=a'),
        'https://files.example/made-up/1/cover?Signature=b',
        now,
      ),
    ).toBe('https://files.example/made-up/1/cover?Signature=b')
  })

  it('is the very same text when the same address arrives again', () => {
    expect(keptAddress(Option.some(held), held, now)).toBe(held)
  })
})
