import { Effect, Exit, Schema as S } from 'effect'
import { decodeReplayTape, replayToFrame } from 'foldkit/runtime'
import { describe, expect, it } from 'vitest'

import {
  AdjustedCounter,
  CurrentMessageFromV0,
  MessageVersioningProgram,
  WireMessageV0,
  counterAdjustedEventId,
  downgradeCurrentToV0,
  replayTapeV0,
  upgradeV0ToCurrent,
} from './index.js'

const canonicalV0 = WireMessageV0.make({
  eventId: counterAdjustedEventId,
  version: 0,
  payload: { delta: 3 },
})

describe('versioned Messages', () => {
  it('upgrades the canonical v0 wire representation deterministically', () => {
    const first = upgradeV0ToCurrent(canonicalV0)
    const second = upgradeV0ToCurrent(canonicalV0)

    expect(first).toStrictEqual(
      AdjustedCounter({
        eventId: counterAdjustedEventId,
        version: 2,
        amount: 3,
        origin: 'Legacy',
      }),
    )
    expect(second).toStrictEqual(first)
  })

  it('round trips the exactly representable subset through v0', async () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const current = AdjustedCounter({
          eventId: counterAdjustedEventId,
          version: 2,
          amount: 5,
          origin: 'Legacy',
        })
        const encoded = yield* S.encodeEffect(CurrentMessageFromV0)(current)
        const decoded =
          yield* S.decodeUnknownEffect(CurrentMessageFromV0)(encoded)

        expect(encoded).toStrictEqual(
          WireMessageV0.make({
            eventId: counterAdjustedEventId,
            version: 0,
            payload: { delta: 5 },
          }),
        )
        expect(decoded).toStrictEqual(current)
      }),
    ))

  it('rejects a downgrade that would discard current information', async () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const current = AdjustedCounter({
          eventId: counterAdjustedEventId,
          version: 2,
          amount: 5,
          origin: 'Automation',
        })
        const domainError = yield* Effect.flip(downgradeCurrentToV0(current))
        const schemaExit = yield* Effect.exit(
          S.encodeEffect(CurrentMessageFromV0)(current),
        )

        expect(domainError.reason).toBe(
          'v0 cannot represent the Automation origin',
        )
        expect(Exit.isFailure(schemaExit)).toBe(true)
      }),
    ))

  it('migrates a v0 replay tape before current Message decoding', async () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const tape = yield* decodeReplayTape(
          MessageVersioningProgram,
          JSON.stringify(replayTapeV0),
        )
        const model = yield* replayToFrame(MessageVersioningProgram, tape, 1)

        expect(tape.programVersion).toBe(2)
        expect(tape.transitions).toStrictEqual([
          expect.objectContaining({
            message: AdjustedCounter({
              eventId: counterAdjustedEventId,
              version: 2,
              amount: 3,
              origin: 'Legacy',
            }),
          }),
        ])
        expect(model).toStrictEqual({ count: 3 })
      }),
    ))
})
