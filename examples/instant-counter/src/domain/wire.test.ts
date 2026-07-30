import { Effect, Option, Schema as S } from 'effect'
import { Processor, Program } from 'foldkit'
import { describe, expect, it } from 'vitest'

import { RequestedEffect } from './message.js'
import { EventRegistry, encodeMessage } from './wire.js'

const makeEnvelope = (eventVersion: number) =>
  S.encodeSync(Processor.MessageEnvelope)(
    Processor.MessageEnvelope.make({
      acceptedAtMs: Option.some(2),
      acceptedSequence: Option.some(1),
      actor: Processor.AuthenticatedActor.make({ subjectId: 'subject-1' }),
      causationOccurrenceId: Option.none(),
      correlationId: Option.none(),
      createdAtMs: 1,
      eventId: 'InstantCounter.AdjustedCounter',
      eventVersion,
      formatVersion: 1,
      ingressProcessorId: 'processor-authority',
      occurrenceId: `occurrence-${eventVersion}`,
      originClientId: 'client-browser',
      originDeviceId: 'device-laptop',
      originSequence: 1,
      programId: 'instant-counter',
      programVersion: 1,
      sessionId: 'session-1',
    }),
  )

describe('Instant counter event protocol', () => {
  it('migrates the historical counter payload into the current Message', async () => {
    const envelope = makeEnvelope(0)
    const payload = { delta: -1 }

    const decoded = await Effect.runPromise(
      Program.decodeVersionedEvent(EventRegistry, { envelope, payload }),
    )

    expect(decoded.message).toStrictEqual({ _tag: 'ClickedDecrement' })
    expect(decoded.upgradedPayload).toStrictEqual({
      amount: -1,
      control: 'Decrement',
    })
    expect(decoded.original.envelope).toBe(envelope)
    expect(decoded.original.payload).toBe(payload)
  })

  it('migrates the historical reset payload into the canonical Reset Message', async () => {
    const decoded = await Effect.runPromise(
      Program.decodeVersionedEvent(EventRegistry, {
        envelope: makeEnvelope(0),
        payload: { delta: 0 },
      }),
    )

    expect(decoded.message).toStrictEqual({ _tag: 'ClickedReset' })
    expect(decoded.upgradedPayload).toStrictEqual({
      amount: 0,
      control: 'Reset',
    })
  })

  it('rejects a delta outside the historical one-step contract', async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        Program.decodeVersionedEvent(EventRegistry, {
          envelope: makeEnvelope(0),
          payload: { delta: -2 },
        }),
      ),
    )

    expect(error._tag).toBe('VersionedEventMigrationError')
  })

  it('rejects event versions newer than the current Processor understands', async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        Program.decodeVersionedEvent(EventRegistry, {
          envelope: makeEnvelope(2),
          payload: { amount: 1, control: 'Increment' },
        }),
      ),
    )

    expect(error).toMatchObject({
      _tag: 'UnsupportedVersionedEventVersionError',
      actualVersion: 2,
      currentVersion: 1,
      minimumVersion: 0,
    })
  })

  it('encodes portable public arguments without credentials or executable code', () => {
    const encoded = encodeMessage(
      RequestedEffect({
        durationMs: Option.some(500),
        kind: 'AudioTranscription',
        requestId: 'transcription-1',
      }),
    )
    const serialized = S.encodeSync(S.fromJsonString(S.Json))(encoded.payload)

    expect(encoded).toStrictEqual({
      eventId: 'InstantCounter.RequestedEffect',
      eventVersion: 1,
      payload: {
        durationMs: 500,
        kind: 'AudioTranscription',
        requestId: 'transcription-1',
      },
    })
    expect(serialized).not.toMatch(
      /refreshToken|adminToken|magicCode|authorizationCode|function|closure/i,
    )
  })
})
