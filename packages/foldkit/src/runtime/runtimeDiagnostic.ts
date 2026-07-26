import { Cause, Option, Schema } from 'effect'

const StartedSubscription = Schema.TaggedStruct('StartedSubscription', {
  programId: Schema.String,
  name: Schema.String,
  instanceId: Schema.Int,
  timestamp: Schema.Number,
})

const StoppedSubscription = Schema.TaggedStruct('StoppedSubscription', {
  programId: Schema.String,
  name: Schema.String,
  instanceId: Schema.Int,
  timestamp: Schema.Number,
})

const FailedSubscription = Schema.TaggedStruct('FailedSubscription', {
  programId: Schema.String,
  name: Schema.String,
  instanceId: Schema.Int,
  timestamp: Schema.Number,
  cause: Schema.String,
})

const StartedAcquiringManagedResource = Schema.TaggedStruct(
  'StartedAcquiringManagedResource',
  {
    programId: Schema.String,
    name: Schema.String,
    instanceId: Schema.Int,
    timestamp: Schema.Number,
  },
)

const AcquiredManagedResource = Schema.TaggedStruct('AcquiredManagedResource', {
  programId: Schema.String,
  name: Schema.String,
  instanceId: Schema.Int,
  timestamp: Schema.Number,
})

const FailedAcquiringManagedResource = Schema.TaggedStruct(
  'FailedAcquiringManagedResource',
  {
    programId: Schema.String,
    name: Schema.String,
    instanceId: Schema.Int,
    timestamp: Schema.Number,
    cause: Schema.String,
  },
)

const StartedReleasingManagedResource = Schema.TaggedStruct(
  'StartedReleasingManagedResource',
  {
    programId: Schema.String,
    name: Schema.String,
    instanceId: Schema.Int,
    timestamp: Schema.Number,
  },
)

const ReleasedManagedResource = Schema.TaggedStruct('ReleasedManagedResource', {
  programId: Schema.String,
  name: Schema.String,
  instanceId: Schema.Int,
  timestamp: Schema.Number,
})

const FailedReleasingManagedResource = Schema.TaggedStruct(
  'FailedReleasingManagedResource',
  {
    programId: Schema.String,
    name: Schema.String,
    instanceId: Schema.Int,
    timestamp: Schema.Number,
    cause: Schema.String,
  },
)

/** A transport-neutral Subscription or ManagedResource lifecycle fact. */
export const RuntimeDiagnostic = Schema.Union([
  StartedSubscription,
  StoppedSubscription,
  FailedSubscription,
  StartedAcquiringManagedResource,
  AcquiredManagedResource,
  FailedAcquiringManagedResource,
  StartedReleasingManagedResource,
  ReleasedManagedResource,
  FailedReleasingManagedResource,
])

/** A transport-neutral Subscription or ManagedResource lifecycle fact. */
export type RuntimeDiagnostic = typeof RuntimeDiagnostic.Type

type LifecycleInput = Readonly<{
  programId: string
  name: string
  instanceId: number
  timestamp: number
}>

/** Constructs a StartedSubscription diagnostic. */
export const startedSubscription = (input: LifecycleInput): RuntimeDiagnostic =>
  StartedSubscription.make(input)

/** Constructs a StoppedSubscription diagnostic. */
export const stoppedSubscription = (input: LifecycleInput): RuntimeDiagnostic =>
  StoppedSubscription.make(input)

/** Constructs a FailedSubscription diagnostic. */
export const failedSubscription = (
  input: LifecycleInput & Readonly<{ cause: string }>,
): RuntimeDiagnostic => FailedSubscription.make(input)

/** Constructs a StartedAcquiringManagedResource diagnostic. */
export const startedAcquiringManagedResource = (
  input: LifecycleInput,
): RuntimeDiagnostic => StartedAcquiringManagedResource.make(input)

/** Constructs an AcquiredManagedResource diagnostic. */
export const acquiredManagedResource = (
  input: LifecycleInput,
): RuntimeDiagnostic => AcquiredManagedResource.make(input)

/** Constructs a FailedAcquiringManagedResource diagnostic. */
export const failedAcquiringManagedResource = (
  input: LifecycleInput & Readonly<{ cause: string }>,
): RuntimeDiagnostic => FailedAcquiringManagedResource.make(input)

/** Constructs a StartedReleasingManagedResource diagnostic. */
export const startedReleasingManagedResource = (
  input: LifecycleInput,
): RuntimeDiagnostic => StartedReleasingManagedResource.make(input)

/** Constructs a ReleasedManagedResource diagnostic. */
export const releasedManagedResource = (
  input: LifecycleInput,
): RuntimeDiagnostic => ReleasedManagedResource.make(input)

/** Constructs a FailedReleasingManagedResource diagnostic. */
export const failedReleasingManagedResource = (
  input: LifecycleInput & Readonly<{ cause: string }>,
): RuntimeDiagnostic => FailedReleasingManagedResource.make(input)

const UpdateFailureSource = Schema.TaggedStruct('Update', {
  messageTag: Schema.String,
})

const CommandFailureSource = Schema.TaggedStruct('Command', {
  name: Schema.String,
})

const SubscriptionFailureSource = Schema.TaggedStruct('Subscription', {
  name: Schema.String,
})

const ManagedResourceFailureSource = Schema.TaggedStruct('ManagedResource', {
  name: Schema.String,
})

/** The subsystem whose failure terminated a Program runtime. */
export const RuntimeFailureSource = Schema.Union([
  UpdateFailureSource,
  CommandFailureSource,
  SubscriptionFailureSource,
  ManagedResourceFailureSource,
])

/** The subsystem whose failure terminated a Program runtime. */
export type RuntimeFailureSource = typeof RuntimeFailureSource.Type

/** A structured failure emitted when a Program runtime terminates. */
export type RuntimeFailure<Message = never> = Readonly<{
  programId: string
  source: RuntimeFailureSource
  message: Option.Option<Message>
  cause: Cause.Cause<never>
  timestamp: number
}>

/** Constructs Update failure provenance. */
export const updateFailureSource = (messageTag: string): RuntimeFailureSource =>
  UpdateFailureSource.make({ messageTag })

/** Constructs Command failure provenance. */
export const commandFailureSource = (name: string): RuntimeFailureSource =>
  CommandFailureSource.make({ name })

/** Constructs Subscription failure provenance. */
export const subscriptionFailureSource = (name: string): RuntimeFailureSource =>
  SubscriptionFailureSource.make({ name })

/** Constructs ManagedResource failure provenance. */
export const managedResourceFailureSource = (
  name: string,
): RuntimeFailureSource => ManagedResourceFailureSource.make({ name })
