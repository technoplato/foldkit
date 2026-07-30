import { Effect, Schema } from 'effect'
import { describe, expect, it } from 'vitest'

import { make } from './program.js'
import {
  decodeVersionedEvent,
  makeVersionedEventFamily,
  makeVersionedEventRegistry,
} from './versionedEvent.js'

const TransferredFunds = Schema.TaggedStruct('TransferredFunds', {
  amountMinorUnits: Schema.Int,
  currency: Schema.String,
})

const HistoricalTransferV0 = Schema.Struct({
  amountDollars: Schema.Number,
})

const HistoricalTransferV1 = Schema.Struct({
  amountMinorUnits: Schema.Int,
})

const CurrentTransferV2 = Schema.Struct({
  amountMinorUnits: Schema.Int,
  currency: Schema.String,
})

const makeTransferFamily = () =>
  makeVersionedEventFamily({
    eventId: 'TransferredFunds',
    minimumVersion: 0,
    currentVersion: 2,
    CurrentPayload: CurrentTransferV2,
    toMessage: TransferredFunds.make,
    migrations: [
      {
        fromVersion: 0,
        toVersion: 1,
        migrate: payload => {
          const historical =
            Schema.decodeUnknownSync(HistoricalTransferV0)(payload)
          return {
            amountMinorUnits: historical.amountDollars * 100,
          }
        },
      },
      {
        fromVersion: 1,
        toVersion: 2,
        migrate: payload => {
          const historical =
            Schema.decodeUnknownSync(HistoricalTransferV1)(payload)
          return {
            amountMinorUnits: historical.amountMinorUnits,
            currency: 'USD',
          }
        },
      },
    ],
  })

const makeTransferRegistry = () =>
  Effect.gen(function* () {
    const family = yield* makeTransferFamily()
    return yield* makeVersionedEventRegistry({
      programId: 'wallet',
      currentProgramVersion: 2,
      families: [family],
    })
  })

const makeEnvelope = (eventVersion: number) => ({
  formatVersion: 1,
  occurrenceId: `occurrence-${eventVersion}`,
  programId: 'wallet',
  programVersion: 0,
  eventId: 'TransferredFunds',
  eventVersion,
  actor: {
    _tag: 'Authenticated',
    subjectId: 'user-1',
  },
  originClientId: 'client-phone',
  originDeviceId: 'device-phone',
  ingressProcessorId: 'processor-phone',
  sessionId: 'session-1',
  originSequence: 1,
  acceptedSequence: 1,
  causationOccurrenceId: null,
  correlationId: 'transfer-1',
  createdAtMs: 1,
  acceptedAtMs: 2,
})

describe('VersionedEventRegistry', () => {
  it('upgrades adjacent historical event versions into the current Message', async () => {
    const registry = await Effect.runPromise(makeTransferRegistry())
    const envelope = makeEnvelope(0)
    const payload = { amountDollars: 42 }

    const decoded = await Effect.runPromise(
      decodeVersionedEvent(registry, { envelope, payload }),
    )

    expect(decoded.message).toStrictEqual(
      TransferredFunds.make({
        amountMinorUnits: 4200,
        currency: 'USD',
      }),
    )
    expect(decoded.upgradedPayload).toStrictEqual({
      amountMinorUnits: 4200,
      currency: 'USD',
    })
    expect(decoded.envelope.programVersion).toBe(0)
    expect(decoded.envelope.eventVersion).toBe(0)
    expect(decoded.original.envelope).toBe(envelope)
    expect(decoded.original.payload).toBe(payload)
    expect(Object.isFrozen(decoded.original)).toBe(true)
  })

  it('can be owned directly by a Program definition', async () => {
    const registry = await Effect.runPromise(makeTransferRegistry())
    const Model = Schema.Struct({ balance: Schema.Int })
    const program = make({
      id: 'wallet',
      version: 2,
      Model,
      Message: TransferredFunds,
      init: () => [Model.make({ balance: 0 }), []],
      update: model => [model, []],
      versionedEvents: registry,
    })

    expect(program.versionedEvents).toBe(registry)
    expect(Object.isFrozen(registry.families)).toBe(true)
  })

  it('rejects non-adjacent and incomplete migration chains during construction', async () => {
    const nonAdjacent = await Effect.runPromise(
      Effect.flip(
        makeVersionedEventFamily({
          eventId: 'TransferredFunds',
          minimumVersion: 0,
          currentVersion: 2,
          CurrentPayload: CurrentTransferV2,
          toMessage: TransferredFunds.make,
          migrations: [
            {
              fromVersion: 0,
              toVersion: 2,
              migrate: payload => payload,
            },
          ],
        }),
      ),
    )
    const incomplete = await Effect.runPromise(
      Effect.flip(
        makeVersionedEventFamily({
          eventId: 'TransferredFunds',
          minimumVersion: 0,
          currentVersion: 2,
          CurrentPayload: CurrentTransferV2,
          toMessage: TransferredFunds.make,
          migrations: [
            {
              fromVersion: 0,
              toVersion: 1,
              migrate: payload => payload,
            },
          ],
        }),
      ),
    )

    expect(nonAdjacent._tag).toBe('VersionedEventFamilyConstructionError')
    expect(nonAdjacent.reason).toContain('immediately adjacent')
    expect(incomplete._tag).toBe('VersionedEventFamilyConstructionError')
    expect(incomplete.reason).toContain('must end at version 2')
  })

  it('rejects duplicate event family identifiers in one Program registry', async () => {
    const first = await Effect.runPromise(makeTransferFamily())
    const second = await Effect.runPromise(makeTransferFamily())
    const error = await Effect.runPromise(
      Effect.flip(
        makeVersionedEventRegistry({
          programId: 'wallet',
          currentProgramVersion: 2,
          families: [first, second],
        }),
      ),
    )

    expect(error._tag).toBe('VersionedEventRegistryConstructionError')
    expect(error.reason).toContain('must be unique')
  })

  it('returns a typed current-payload failure with the original wire inputs', async () => {
    const registry = await Effect.runPromise(makeTransferRegistry())
    const envelope = makeEnvelope(2)
    const payload = { amountMinorUnits: 'invalid', currency: 'USD' }
    const error = await Effect.runPromise(
      Effect.flip(decodeVersionedEvent(registry, { envelope, payload })),
    )

    expect(error._tag).toBe('VersionedEventPayloadDecodeError')
    if (error._tag === 'VersionedEventPayloadDecodeError') {
      expect(error.stage).toBe('Current')
      expect(error.original.envelope).toBe(envelope)
      expect(error.original.payload).toBe(payload)
    }
  })

  it('returns a typed migration failure without replacing provenance', async () => {
    const family = await Effect.runPromise(
      makeVersionedEventFamily({
        eventId: 'TransferredFunds',
        minimumVersion: 0,
        currentVersion: 1,
        CurrentPayload: HistoricalTransferV1,
        toMessage: payload =>
          TransferredFunds.make({
            amountMinorUnits: payload.amountMinorUnits,
            currency: 'USD',
          }),
        migrations: [
          {
            fromVersion: 0,
            toVersion: 1,
            migrate: () => {
              throw new Error('provider-specific migration defect')
            },
          },
        ],
      }),
    )
    const registry = await Effect.runPromise(
      makeVersionedEventRegistry({
        programId: 'wallet',
        currentProgramVersion: 1,
        families: [family],
      }),
    )
    const envelope = makeEnvelope(0)
    const payload = { amountDollars: 42 }
    const error = await Effect.runPromise(
      Effect.flip(decodeVersionedEvent(registry, { envelope, payload })),
    )

    expect(error._tag).toBe('VersionedEventMigrationError')
    if (error._tag === 'VersionedEventMigrationError') {
      expect(error.fromVersion).toBe(0)
      expect(error.toVersion).toBe(1)
      expect(error.original.envelope).toBe(envelope)
      expect(error.original.payload).toBe(payload)
    }
  })
})
