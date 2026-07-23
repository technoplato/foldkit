import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import { Loading, Ready, Saving } from './counter.js'
import { parseCounterUri, printCounterUri } from './counterUri.js'

describe('Counter URI codec', () => {
  it.each([
    [Loading(), '/?mode=Loading'],
    [Ready({ count: 3 }), '/?mode=Ready&count=3'],
    [Saving({ count: -2 }), '/?mode=Saving&count=-2'],
  ])('round-trips %o through %s', (model, uri) => {
    expect(printCounterUri(model)).toBe(uri)
    expect(Effect.runSync(parseCounterUri(uri))).toStrictEqual(model)
  })

  it('canonicalizes query ordering', () => {
    const model = Effect.runSync(parseCounterUri('/?count=7&mode=Ready'))
    expect(printCounterUri(model)).toBe('/?mode=Ready&count=7')
  })

  it('rejects state outside the root path and query', () => {
    expect(() =>
      Effect.runSync(parseCounterUri('/counter?mode=Ready&count=1')),
    ).toThrow()
    expect(() =>
      Effect.runSync(parseCounterUri('/?mode=Ready&count=1#details')),
    ).toThrow()
  })
})
