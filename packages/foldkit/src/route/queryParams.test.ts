import { Effect, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import * as QueryParams from './queryParams.js'

describe('portable query parameters', () => {
  it('round trips canonical form encoding without URLSearchParams', async () => {
    const queryParams = QueryParams.set(
      QueryParams.set(QueryParams.empty, 'model', '{"title":"a b~c"}'),
      'frame',
      '3',
    )
    const encoded = QueryParams.toString(queryParams)
    const decoded = await Effect.runPromise(QueryParams.parse(encoded))

    expect(encoded).toBe('model=%7B%22title%22%3A%22a+b%7Ec%22%7D&frame=3')
    expect(decoded).toStrictEqual(queryParams)
    expect(Option.getOrThrow(QueryParams.getLast(decoded, 'frame'))).toBe('3')
  })

  it('reports malformed percent encoding as a typed failure', async () => {
    const exit = await Effect.runPromiseExit(QueryParams.parse('model=%ZZ'))

    expect(exit._tag).toBe('Failure')
  })
})
