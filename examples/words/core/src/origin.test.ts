import { Effect, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { decodeLiveBeatResponse } from './origin.js'

describe("the origin's live beat", () => {
  it('reads the newest beat the origin trusts, or none', () => {
    expect(
      Effect.runSync(
        decodeLiveBeatResponse(200, {
          durationSeconds: 124,
          beatAtMs: 1_790_000_000_000,
        }),
      ),
    ).toEqual(
      Option.some({ durationSeconds: 124, beatAtMs: 1_790_000_000_000 }),
    )
    expect(Effect.runSync(decodeLiveBeatResponse(200, {}))).toEqual(
      Option.none(),
    )
  })

  it('fails when the origin cannot read the room', () => {
    const failure = Effect.runSync(
      Effect.flip(
        decodeLiveBeatResponse(503, { error: 'LiveBeatUnavailable' }),
      ),
    )
    expect(failure.operation).toBe('ReadLiveBeat')
  })
})
