import { Schema } from 'effect'

import { Placement } from '../processor/processor.js'

const PositiveVersion = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))

/** Portable metadata that lets a Processor schedule one Command Effect. */
export const EffectManifest = Schema.Struct({
  formatVersion: Schema.Literal(1),
  id: Schema.String,
  version: PositiveVersion,
  publicArguments: Schema.Record(Schema.String, Schema.Json),
  placement: Placement,
})

/** Portable metadata that lets a Processor schedule one Command Effect. */
export type EffectManifest = typeof EffectManifest.Type
