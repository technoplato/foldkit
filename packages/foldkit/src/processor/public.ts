export {
  Actor,
  Affinity,
  AnyProcessor,
  AssignedFallback,
  AssignedPreferred,
  AuthenticatedActor,
  Capability,
  CapabilityId,
  CapabilityRequirement,
  ClientId,
  Descriptor,
  DeviceId,
  EffectSupportRange,
  Failed,
  GuestActor,
  Ignored,
  IngressProcessor,
  MessageEnvelope,
  OriginClient,
  Placement,
  PlacementDecision,
  PreviousProcessor,
  ProcessorId,
  ProtocolRange,
  SpecificProcessor,
  SystemActor,
  UnavailablePolicy,
  UnavailableReason,
  Waiting,
  selectProcessor,
  supportsEffectVersion,
} from './processor.js'

export type { PlacementContext } from './processor.js'

/** Provider-neutral contracts for finite audio processing effects. */
export * as Audio from './audio.js'

/** Processor Host ADT. Pass `Processor.Host.React()`, not `'react'`. */
export * as Host from './host.js'
