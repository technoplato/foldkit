import { Array, Option, Order, Schema } from 'effect'

const PositiveVersion = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))
const NonNegativeVersion = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const MaximumIdentityLength = 128
const CanonicalIdentity = Schema.String.check(
  Schema.isLengthBetween(1, MaximumIdentityLength),
  Schema.isPattern(/^[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)*$/u),
)

/** A canonical Processor occurrence identifier in the Processor namespace. */
export const ProcessorId = CanonicalIdentity.annotate({
  identifier: 'ProcessorId',
  description:
    'A 1-128 character identifier of colon-delimited base64url-form segments whose generator must provide collision-resistant uniqueness in the Processor namespace.',
})
/** A canonical Processor occurrence identifier in the Processor namespace. */
export type ProcessorId = typeof ProcessorId.Type

/** A canonical Client occurrence identifier in the Client namespace. */
export const ClientId = CanonicalIdentity.annotate({
  identifier: 'ClientId',
  description:
    'A 1-128 character identifier of colon-delimited base64url-form segments whose generator must provide collision-resistant uniqueness in the Client namespace.',
})
/** A canonical Client occurrence identifier in the Client namespace. */
export type ClientId = typeof ClientId.Type

/** A canonical installation identifier in the Device namespace. */
export const DeviceId = CanonicalIdentity.annotate({
  identifier: 'DeviceId',
  description:
    'A 1-128 character identifier of colon-delimited base64url-form segments whose generator must provide collision-resistant uniqueness in the Device namespace.',
})
/** A canonical installation identifier in the Device namespace. */
export type DeviceId = typeof DeviceId.Type

/** A stable, nested capability identifier such as Banking / SWIFT / Write. */
export const CapabilityId = Schema.NonEmptyArray(Schema.String)

/** A stable, nested capability identifier such as Banking / SWIFT / Write. */
export type CapabilityId = typeof CapabilityId.Type

/** One capability and the protocol version a Processor implements. */
export const Capability = Schema.Struct({
  id: CapabilityId,
  version: PositiveVersion,
})

/** One capability and the protocol version a Processor implements. */
export type Capability = typeof Capability.Type

/** The minimum capability version required to execute an effect. */
export const CapabilityRequirement = Schema.Struct({
  id: CapabilityId,
  minimumVersion: PositiveVersion,
})

/** The minimum capability version required to execute an effect. */
export type CapabilityRequirement = typeof CapabilityRequirement.Type

/** The shared-Program protocol range understood by one Processor. */
export const ProtocolRange = Schema.Struct({
  minimumVersion: PositiveVersion,
  maximumVersion: PositiveVersion,
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

/** The shared-Program protocol range understood by one Processor. */
export type ProtocolRange = typeof ProtocolRange.Type

/** The inclusive versions of one portable effect implemented by a Processor. */
export const EffectSupportRange = Schema.Struct({
  id: Schema.String,
  minimumVersion: PositiveVersion,
  maximumVersion: PositiveVersion,
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

/** The inclusive versions of one portable effect implemented by a Processor. */
export type EffectSupportRange = typeof EffectSupportRange.Type

/** Transport-neutral identity and advertised capabilities for one Processor. */
export const Descriptor = Schema.Struct({
  processorId: ProcessorId,
  clientId: ClientId,
  protocol: ProtocolRange,
  capabilities: Schema.Array(Capability),
  effectSupport: Schema.optionalKey(Schema.Array(EffectSupportRange)),
})

/** Transport-neutral identity and advertised capabilities for one Processor. */
export type Descriptor = typeof Descriptor.Type

/** Prefer a capable Processor hosted by the originating Client. */
export const OriginClient = Schema.TaggedStruct('OriginClient', {})

/** Prefer a capable Processor hosted by the originating Client. */
export type OriginClient = typeof OriginClient.Type

/** Prefer the Processor that admitted the causative Message. */
export const IngressProcessor = Schema.TaggedStruct('IngressProcessor', {})

/** Prefer the Processor that admitted the causative Message. */
export type IngressProcessor = typeof IngressProcessor.Type

/** Require one specifically identified capable Processor. */
export const SpecificProcessor = Schema.TaggedStruct('Processor', {
  processorId: ProcessorId,
})

/** Require one specifically identified capable Processor. */
export type SpecificProcessor = typeof SpecificProcessor.Type

/** Prefer the Processor assigned to an earlier effect request. */
export const PreviousProcessor = Schema.TaggedStruct('Previous', {
  requestId: Schema.String,
})

/** Prefer the Processor assigned to an earlier effect request. */
export type PreviousProcessor = typeof PreviousProcessor.Type

/** Select any capable Processor deterministically. */
export const AnyProcessor = Schema.TaggedStruct('Any', {})

/** Select any capable Processor deterministically. */
export type AnyProcessor = typeof AnyProcessor.Type

/** Processor affinity for one capability-driven effect placement. */
export const Affinity = Schema.Union([
  OriginClient,
  IngressProcessor,
  SpecificProcessor,
  PreviousProcessor,
  AnyProcessor,
])

/** Processor affinity for one capability-driven effect placement. */
export type Affinity = typeof Affinity.Type

/** Policy applied when the preferred capable Processor is unavailable. */
export const UnavailablePolicy = Schema.Literals([
  'Wait',
  'UseAnyCapable',
  'Fail',
  'Ignore',
])

/** Policy applied when the preferred capable Processor is unavailable. */
export type UnavailablePolicy = typeof UnavailablePolicy.Type

/** Version-one placement for an effect executed by exactly one Processor. */
export const Placement = Schema.Struct({
  version: Schema.Literal(1),
  cardinality: Schema.Literal('One'),
  capability: CapabilityRequirement,
  affinity: Affinity,
  unavailable: UnavailablePolicy,
})

/** Version-one placement for an effect executed by exactly one Processor. */
export type Placement = typeof Placement.Type

/** An authenticated application user who originated a Message occurrence. */
export const AuthenticatedActor = Schema.TaggedStruct('Authenticated', {
  subjectId: Schema.String,
})

/** An authenticated application user who originated a Message occurrence. */
export type AuthenticatedActor = typeof AuthenticatedActor.Type

/** A guest admitted through a scoped pairing session. */
export const GuestActor = Schema.TaggedStruct('Guest', {
  guestId: Schema.String,
  pairingId: Schema.String,
})

/** A guest admitted through a scoped pairing session. */
export type GuestActor = typeof GuestActor.Type

/** A trusted system actor acting through one Processor. */
export const SystemActor = Schema.TaggedStruct('System', {
  processorId: ProcessorId,
})

/** A trusted system actor acting through one Processor. */
export type SystemActor = typeof SystemActor.Type

/** The authenticated or paired subject that originated one Message. */
export const Actor = Schema.Union([AuthenticatedActor, GuestActor, SystemActor])

/** The authenticated or paired subject that originated one Message. */
export type Actor = typeof Actor.Type

/** Transport provenance for one immutable, versioned Message occurrence. */
export const MessageEnvelope = Schema.Struct({
  formatVersion: Schema.Literal(1),
  occurrenceId: Schema.String,
  programId: Schema.String,
  programVersion: NonNegativeVersion,
  eventId: Schema.String,
  eventVersion: NonNegativeVersion,
  actor: Actor,
  originClientId: ClientId,
  originDeviceId: DeviceId,
  ingressProcessorId: ProcessorId,
  sessionId: Schema.String,
  originSequence: Schema.Int,
  acceptedSequence: Schema.OptionFromNullOr(Schema.Int),
  causationOccurrenceId: Schema.OptionFromNullOr(Schema.String),
  correlationId: Schema.OptionFromNullOr(Schema.String),
  createdAtMs: Schema.Number,
  acceptedAtMs: Schema.OptionFromNullOr(Schema.Number),
})

/** Transport provenance for one immutable, versioned Message occurrence. */
export type MessageEnvelope = typeof MessageEnvelope.Type

/** Why a placement could not select its preferred Processor. */
export const UnavailableReason = Schema.Literals([
  'MissingAffinity',
  'AffinityUnavailable',
  'NoCapableProcessor',
])

/** Why a placement could not select its preferred Processor. */
export type UnavailableReason = typeof UnavailableReason.Type

/** A Processor was selected through the requested affinity. */
export const AssignedPreferred = Schema.TaggedStruct('AssignedPreferred', {
  processorId: ProcessorId,
})

/** A Processor was selected through the requested affinity. */
export type AssignedPreferred = typeof AssignedPreferred.Type

/** A Processor was selected through the allowed capable fallback. */
export const AssignedFallback = Schema.TaggedStruct('AssignedFallback', {
  processorId: ProcessorId,
})

/** A Processor was selected through the allowed capable fallback. */
export type AssignedFallback = typeof AssignedFallback.Type

/** Placement is waiting for a compatible Processor. */
export const Waiting = Schema.TaggedStruct('Waiting', {
  reason: UnavailableReason,
})

/** Placement is waiting for a compatible Processor. */
export type Waiting = typeof Waiting.Type

/** Placement failed according to its explicit unavailable policy. */
export const Failed = Schema.TaggedStruct('Failed', {
  reason: UnavailableReason,
})

/** Placement failed according to its explicit unavailable policy. */
export type Failed = typeof Failed.Type

/** Placement was intentionally ignored according to policy. */
export const Ignored = Schema.TaggedStruct('Ignored', {
  reason: UnavailableReason,
})

/** Placement was intentionally ignored according to policy. */
export type Ignored = typeof Ignored.Type

/** The deterministic result of capability-driven Processor placement. */
export const PlacementDecision = Schema.Union([
  AssignedPreferred,
  AssignedFallback,
  Waiting,
  Failed,
  Ignored,
])

/** The deterministic result of capability-driven Processor placement. */
export type PlacementDecision = typeof PlacementDecision.Type

/** Dynamic provenance used to resolve a placement affinity. */
export type PlacementContext = Readonly<{
  processors: ReadonlyArray<Descriptor>
  maybeOriginClientId: Option.Option<string>
  maybeIngressProcessorId: Option.Option<string>
  previousAssignments: ReadonlyMap<string, string>
}>

/** Returns whether a Processor advertises support for one portable effect version. */
export const supportsEffectVersion = (
  processor: Descriptor,
  effectId: string,
  version: number,
): boolean =>
  Array.some(
    processor.effectSupport ?? [],
    range =>
      range.id === effectId &&
      version >= range.minimumVersion &&
      version <= range.maximumVersion,
  )

const areCapabilityIdsEqual = Schema.toEquivalence(CapabilityId)
const processorIdOrder = Order.mapInput(
  Order.String,
  (processor: Descriptor) => processor.processorId,
)

const supportsCapability = (
  processor: Descriptor,
  requirement: CapabilityRequirement,
): boolean =>
  Array.some(
    processor.capabilities,
    capability =>
      areCapabilityIdsEqual(capability.id, requirement.id) &&
      capability.version >= requirement.minimumVersion,
  )

const firstProcessor = (
  processors: ReadonlyArray<Descriptor>,
): Option.Option<Descriptor> =>
  Array.head(Array.sort(processors, processorIdOrder))

const selectPreferred = (
  affinity: Affinity,
  capableProcessors: ReadonlyArray<Descriptor>,
  context: PlacementContext,
): Option.Option<Descriptor> => {
  if (affinity._tag === 'Any') {
    return firstProcessor(capableProcessors)
  }
  if (affinity._tag === 'OriginClient') {
    return pipePreferred(context.maybeOriginClientId, clientId =>
      Array.findFirst(
        capableProcessors,
        processor => processor.clientId === clientId,
      ),
    )
  }
  if (affinity._tag === 'IngressProcessor') {
    return pipePreferred(context.maybeIngressProcessorId, processorId =>
      Array.findFirst(
        capableProcessors,
        processor => processor.processorId === processorId,
      ),
    )
  }
  if (affinity._tag === 'Processor') {
    return Array.findFirst(
      capableProcessors,
      processor => processor.processorId === affinity.processorId,
    )
  }
  return pipePreferred(
    Option.fromNullishOr(context.previousAssignments.get(affinity.requestId)),
    processorId =>
      Array.findFirst(
        capableProcessors,
        processor => processor.processorId === processorId,
      ),
  )
}

const pipePreferred = <A>(
  maybeValue: Option.Option<A>,
  select: (value: A) => Option.Option<Descriptor>,
): Option.Option<Descriptor> =>
  Option.isSome(maybeValue) ? select(maybeValue.value) : Option.none()

const unavailableReason = (
  affinity: Affinity,
  capableProcessors: ReadonlyArray<Descriptor>,
  context: PlacementContext,
): UnavailableReason => {
  if (Array.isReadonlyArrayEmpty(capableProcessors)) {
    return 'NoCapableProcessor'
  }
  if (
    (affinity._tag === 'OriginClient' &&
      Option.isNone(context.maybeOriginClientId)) ||
    (affinity._tag === 'IngressProcessor' &&
      Option.isNone(context.maybeIngressProcessorId)) ||
    (affinity._tag === 'Previous' &&
      !context.previousAssignments.has(affinity.requestId))
  ) {
    return 'MissingAffinity'
  }
  return 'AffinityUnavailable'
}

/** Selects one Processor deterministically from capabilities and provenance. */
export const selectProcessor = (
  placement: Placement,
  context: PlacementContext,
): PlacementDecision => {
  const capableProcessors = Array.filter(context.processors, processor =>
    supportsCapability(processor, placement.capability),
  )
  const maybePreferred = selectPreferred(
    placement.affinity,
    capableProcessors,
    context,
  )
  if (Option.isSome(maybePreferred)) {
    return AssignedPreferred.make({
      processorId: maybePreferred.value.processorId,
    })
  }

  const reason = unavailableReason(
    placement.affinity,
    capableProcessors,
    context,
  )
  if (
    placement.unavailable === 'UseAnyCapable' &&
    Array.isReadonlyArrayNonEmpty(capableProcessors)
  ) {
    const processor = Array.headNonEmpty(
      Array.sort(capableProcessors, processorIdOrder),
    )
    return AssignedFallback.make({ processorId: processor.processorId })
  }
  if (placement.unavailable === 'Fail') {
    return Failed.make({ reason })
  }
  if (placement.unavailable === 'Ignore') {
    return Ignored.make({ reason })
  }
  return Waiting.make({ reason })
}
