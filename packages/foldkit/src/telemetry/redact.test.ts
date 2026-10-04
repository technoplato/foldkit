import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { Transition } from './event.js'
import {
  makeRedactionPolicy,
  maximumArrayItems,
  maximumDepth,
  maximumStringLength,
  redactedMarker,
  scrubEvent,
  secretValuePatternOf,
  toTelemetryJson,
  truncatedMarker,
} from './redact.js'

const policy = makeRedactionPolicy()

describe('toTelemetryJson', () => {
  it('redacts secret-looking keys at any depth', () => {
    expect(
      toTelemetryJson(
        {
          user: { name: 'Ada', refreshToken: 'r-1', password: 'hunter2' },
          headers: [{ Authorization: 'Bearer abc', 'set-cookie': 'id=1' }],
          clientSecret: 's-1',
          accessToken: 'a-1',
          deep: { a: { b: { c: { apiKey: 'k-1', title: 'Dune' } } } },
        },
        policy,
      ),
    ).toStrictEqual({
      user: {
        name: 'Ada',
        refreshToken: redactedMarker,
        password: redactedMarker,
      },
      headers: [
        { Authorization: redactedMarker, 'set-cookie': redactedMarker },
      ],
      clientSecret: redactedMarker,
      accessToken: redactedMarker,
      deep: { a: { b: { c: { apiKey: redactedMarker, title: 'Dune' } } } },
    })
  })

  it('redacts the extra keys a policy names', () => {
    expect(
      toTelemetryJson(
        { inviteCode: 'X7Q', title: 'Dune' },
        makeRedactionPolicy(['inviteCode']),
      ),
    ).toStrictEqual({ inviteCode: redactedMarker, title: 'Dune' })
  })

  it('returns clean JSON as the same reference', () => {
    const message = {
      bookId: 'a-new-earth',
      via: { _tag: 'Button', label: 'Play' },
    }
    expect(toTelemetryJson(message, policy)).toBe(message)
  })

  it('writes values JSON cannot carry as JSON', () => {
    expect(
      toTelemetryJson(
        {
          at: new Date(0),
          maybeTitle: Option.some('Dune'),
          tags: new Set(['a']),
          counts: new Map([['a', 1]]),
          big: 12n,
          missing: undefined,
          onPress: () => undefined,
          ratio: Number.NaN,
        },
        policy,
      ),
    ).toStrictEqual({
      at: '1970-01-01T00:00:00.000Z',
      maybeTitle: { _id: 'Option', _tag: 'Some', value: 'Dune' },
      tags: ['a'],
      counts: [['a', 1]],
      big: '12',
      ratio: null,
    })
  })

  it('cuts long strings, long arrays, and deep values', () => {
    const longText = 'x'.repeat(maximumStringLength + 5)
    const longList = Array.from(
      { length: maximumArrayItems + 3 },
      (_, index) => index,
    )
    const deep = Array.from({ length: maximumDepth + 2 }).reduce<unknown>(
      inner => ({ inner }),
      'bottom',
    )
    expect(toTelemetryJson(longText, policy)).toBe(
      `${'x'.repeat(maximumStringLength)}${truncatedMarker}`,
    )
    const cutList = toTelemetryJson(longList, policy)
    expect(Array.isArray(cutList) && cutList.length).toBe(maximumArrayItems + 1)
    expect(Array.isArray(cutList) && cutList.at(-1)).toBe(
      `${truncatedMarker} 3 more`,
    )
    expect(JSON.stringify(toTelemetryJson(deep, policy))).toContain(
      truncatedMarker,
    )
  })

  it('redacts secret-looking query parameters inside URLs', () => {
    expect(
      toTelemetryJson(
        {
          maybeCoverUrl: {
            _id: 'Option',
            _tag: 'Some',
            value:
              'https://files.example/4/cover.jpg?response-cache-control=public&Policy=eyJTdGF0ZW1lbnQ&Signature=NdpSDBg4S8eP~f8L&Key-Pair-Id=K2D8',
          },
          callback: '/auth/done?access_token=a-1&state=xyz',
          note: 'token=t-1 was sent',
          plain: 'x=1&y=2',
        },
        policy,
      ),
    ).toStrictEqual({
      maybeCoverUrl: {
        _id: 'Option',
        _tag: 'Some',
        value:
          'https://files.example/4/cover.jpg?response-cache-control=public&Policy=eyJTdGF0ZW1lbnQ&Signature=[REDACTED]&Key-Pair-Id=K2D8',
      },
      callback: '/auth/done?access_token=[REDACTED]&state=xyz',
      note: 'token=[REDACTED] was sent',
      plain: 'x=1&y=2',
    })
  })

  it('scrubs secret values out of strings', () => {
    const secretPolicy = makeRedactionPolicy(
      [],
      secretValuePatternOf(['sk-test-0123456789abcdef', 'yes']),
    )
    expect(
      toTelemetryJson(
        { note: 'calling with sk-test-0123456789abcdef now', answer: 'yes' },
        secretPolicy,
      ),
    ).toStrictEqual({
      note: `calling with ${redactedMarker} now`,
      answer: 'yes',
    })
  })
})

describe('scrubEvent', () => {
  it('applies a policy to payloads, Command args, and Models', () => {
    const secretPolicy = makeRedactionPolicy(
      [],
      secretValuePatternOf(['/Users/ada/private-folder']),
    )
    const transition = Transition.make({
      at: '2026-10-04T20:15:02.114Z',
      sequence: 2,
      session: '9f3c2a71',
      transition: 1,
      message: 'OpenedFile',
      payload: { path: '/Users/ada/private-folder/book.epub' },
      source: { _tag: 'Host' },
      commands: [
        {
          name: 'ReadFile',
          args: { path: '/Users/ada/private-folder/book.epub' },
        },
      ],
      isModelChanged: true,
      changedPathCount: 1,
      model: { lastPath: '/Users/ada/private-folder/book.epub' },
    })
    expect(JSON.stringify(scrubEvent(transition, secretPolicy))).not.toContain(
      '/Users/ada/private-folder',
    )
    expect(scrubEvent(transition, secretPolicy)).toMatchObject({
      payload: { path: `${redactedMarker}/book.epub` },
    })
  })
})
