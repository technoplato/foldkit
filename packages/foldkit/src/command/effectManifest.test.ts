import { Effect, Schema } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  AnyProcessor,
  CapabilityId,
  CapabilityRequirement,
  Placement,
} from '../processor/processor.js'
import {
  EffectManifest,
  EffectManifestV2,
  ResultEventRange,
  permitsResultEvent,
} from './effectManifest.js'
import { define, mapEffect, mapMessage, withEffectManifest } from './index.js'

const manifest = EffectManifest.make({
  formatVersion: 1,
  id: 'Banking.SubmitTransfer',
  version: 1,
  publicArguments: {
    transferId: 'transfer-1',
    amountMinorUnits: 4200,
  },
  placement: Placement.make({
    version: 1,
    cardinality: 'One',
    capability: CapabilityRequirement.make({
      id: CapabilityId.make(['Banking', 'SWIFT', 'Write']),
      minimumVersion: 1,
    }),
    affinity: AnyProcessor.make({}),
    unavailable: 'Wait',
  }),
})

describe('EffectManifest', () => {
  it('round trips through its portable Schema', () => {
    const encoded = Schema.encodeSync(EffectManifest)(manifest)
    expect(Schema.decodeUnknownSync(EffectManifest)(encoded)).toStrictEqual(
      manifest,
    )
  })

  it('rejects an invalid effect version', () => {
    expect(() =>
      Schema.decodeUnknownSync(EffectManifest)({
        ...Schema.encodeSync(EffectManifest)(manifest),
        version: 0,
      }),
    ).toThrow()
  })

  it('retains version-one manifests while version two constrains factual results', () => {
    const nextManifest = EffectManifestV2.make({
      formatVersion: 2,
      id: 'Banking.SubmitTransfer',
      version: 2,
      publicArguments: {
        transferId: 'transfer-1',
      },
      placement: manifest.placement,
      permittedResultEvents: [
        ResultEventRange.make({
          eventId: 'SucceededSubmitTransfer',
          minimumVersion: 0,
          maximumVersion: 2,
        }),
        ResultEventRange.make({
          eventId: 'FailedSubmitTransfer',
          minimumVersion: 1,
          maximumVersion: 1,
        }),
      ],
    })

    expect(
      Schema.decodeUnknownSync(EffectManifest)(
        Schema.encodeSync(EffectManifest)(nextManifest),
      ),
    ).toStrictEqual(nextManifest)
    expect(permitsResultEvent(manifest, 'AnyHistoricalResult', 0)).toBe(true)
    expect(
      permitsResultEvent(nextManifest, 'SucceededSubmitTransfer', 0),
    ).toBe(true)
    expect(
      permitsResultEvent(nextManifest, 'SucceededSubmitTransfer', 3),
    ).toBe(false)
    expect(permitsResultEvent(nextManifest, 'UnexpectedResult', 1)).toBe(false)
  })

  it('rejects an inverted permitted result version range', () => {
    expect(() =>
      Schema.decodeUnknownSync(ResultEventRange)({
        eventId: 'SucceededSubmitTransfer',
        minimumVersion: 2,
        maximumVersion: 1,
      }),
    ).toThrow()
  })

  it('survives Effect and Message mapping with Command identity intact', async () => {
    const Completed = Schema.TaggedStruct('Completed', {
      transferId: Schema.String,
    })
    const Wrapped = Schema.TaggedStruct('Wrapped', { value: Completed })
    const SubmitTransfer = define(
      'SubmitTransfer',
      { transferId: Schema.String },
      Completed,
    )(({ transferId }) => Effect.succeed(Completed.make({ transferId })))
    const command = withEffectManifest(
      SubmitTransfer({ transferId: 'transfer-1' }),
      manifest,
    )
    const mappedEffect = mapEffect(command, Effect.withSpan('submit'))
    const mappedMessage = mapMessage(mappedEffect, value =>
      Wrapped.make({ value }),
    )

    expect(mappedMessage.name).toBe('SubmitTransfer')
    expect(mappedMessage.args).toStrictEqual({ transferId: 'transfer-1' })
    expect(mappedMessage.effectManifest).toStrictEqual(manifest)
    await expect(
      Effect.runPromise(mappedMessage.effect),
    ).resolves.toStrictEqual(
      Wrapped.make({
        value: Completed.make({ transferId: 'transfer-1' }),
      }),
    )
  })
})
