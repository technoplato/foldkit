import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  ClientMetadata,
  browserClientMetadataOf,
  browserNameOf,
  resolveClientMetadata,
} from './clientMetadata.js'

describe('ClientMetadata', () => {
  it('decodes rows with all, some, or no optional metadata fields', () => {
    expect(S.decodeUnknownSync(ClientMetadata)({})).toStrictEqual({})
    expect(
      S.decodeUnknownSync(ClientMetadata)({
        browser: 'Chrome',
        windowLabel: 'Tab 1',
        appVersion: 'v0.131.0',
        userEmail: 'michael@example.com',
      }),
    ).toStrictEqual({
      browser: 'Chrome',
      windowLabel: 'Tab 1',
      appVersion: 'v0.131.0',
      userEmail: 'michael@example.com',
    })
  })

  it('resolves static and dynamic metadata while dropping blank values', () => {
    expect(resolveClientMetadata(undefined)).toStrictEqual({})
    expect(
      resolveClientMetadata({
        browser: '  Safari  ',
        windowLabel: '   ',
        appVersion: 'v1.2.3',
        userEmail: '',
      }),
    ).toStrictEqual({ browser: 'Safari', appVersion: 'v1.2.3' })
    expect(
      resolveClientMetadata(() => ({
        userEmail: 'michael@example.com',
      })),
    ).toStrictEqual({ userEmail: 'michael@example.com' })
  })

  it('identifies common browsers from userAgent strings', () => {
    expect(
      browserNameOf(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      ),
    ).toStrictEqual(Option.some('Chrome'))
    expect(
      browserNameOf(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
      ),
    ).toStrictEqual(Option.some('Safari'))
    expect(
      browserNameOf(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0',
      ),
    ).toStrictEqual(Option.some('Firefox'))
    expect(
      browserNameOf(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
      ),
    ).toStrictEqual(Option.some('Edge'))
    expect(browserNameOf('curl/8.7.1')).toStrictEqual(Option.none())
  })

  it('derives browser client metadata cleanly', () => {
    expect(
      browserClientMetadataOf({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
        windowLabel: 'Books | React',
        appVersion: 'v0.131.0',
        userEmail: 'michael@example.com',
      }),
    ).toStrictEqual({
      browser: 'Chrome',
      windowLabel: 'Books | React',
      appVersion: 'v0.131.0',
      userEmail: 'michael@example.com',
    })
  })
})
