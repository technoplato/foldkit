import { Array, Schema } from 'effect'

import { Placement } from '../processor/processor.js'

const PositiveVersion = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))
const NonNegativeVersion = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

/** An inclusive version range for one factual event an effect may return. */
export const ResultEventRange = Schema.Struct({
  eventId: Schema.String,
  minimumVersion: NonNegativeVersion,
  maximumVersion: NonNegativeVersion,
}).check(
  Schema.makeFilter(range =>
    range.minimumVersion <= range.maximumVersion
      ? undefined
      : {
          path: ['maximumVersion'],
          issue:
            'maximumVersion must be greater than or equal to minimumVersion',
        },
  ),
)

/** An inclusive version range for one factual event an effect may return. */
export type ResultEventRange = typeof ResultEventRange.Type

/** Version-one portable scheduling metadata retained for wire compatibility. */
export const EffectManifestV1 = Schema.Struct({
  formatVersion: Schema.Literal(1),
  id: Schema.String,
  version: PositiveVersion,
  publicArguments: Schema.Record(Schema.String, Schema.Json),
  placement: Placement,
})

/** Version-one portable scheduling metadata retained for wire compatibility. */
export type EffectManifestV1 = typeof EffectManifestV1.Type

/** Version-two scheduling metadata with explicit permitted result events. */
export const EffectManifestV2 = Schema.Struct({
  formatVersion: Schema.Literal(2),
  id: Schema.String,
  version: PositiveVersion,
  publicArguments: Schema.Record(Schema.String, Schema.Json),
  placement: Placement,
  permittedResultEvents: Schema.NonEmptyArray(ResultEventRange),
})

/** Version-two scheduling metadata with explicit permitted result events. */
export type EffectManifestV2 = typeof EffectManifestV2.Type

/** Portable metadata that lets a Processor schedule one Command Effect. */
export const EffectManifest = Schema.Union([EffectManifestV1, EffectManifestV2])

/** Portable metadata that lets a Processor schedule one Command Effect. */
export type EffectManifest = typeof EffectManifest.Type

/** Returns whether an effect manifest permits one result event occurrence. */
export const permitsResultEvent = (
  manifest: EffectManifest,
  eventId: string,
  eventVersion: number,
): boolean => {
  if (manifest.formatVersion === 1) {
    return true
  }
  return Array.some(
    manifest.permittedResultEvents,
    range =>
      range.eventId === eventId &&
      eventVersion >= range.minimumVersion &&
      eventVersion <= range.maximumVersion,
  )
}
