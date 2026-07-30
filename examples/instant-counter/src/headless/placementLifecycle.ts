import { Array, Option, Schema as S } from 'effect'
import { Command, Processor } from 'foldkit'

/** One previously appended placement generation for an effect request. */
export type PlacementGeneration = Readonly<{
  assignmentGeneration: number
  cancellationGeneration: number
  decision: Processor.PlacementDecision
}>

/** Dynamic placement inputs retained across room joins and leaves. */
export type PlacementLifecycleInput = Readonly<{
  manifest: Command.EffectManifest
  maybeCurrent: Option.Option<PlacementGeneration>
  originClientId: string
  ingressProcessorId: string
  previousAssignments: ReadonlyMap<string, string>
  processors: ReadonlyArray<Processor.Descriptor>
}>

const decisionEquivalence = S.toEquivalence(Processor.PlacementDecision)

const isAssigned = (
  decision: Processor.PlacementDecision,
): decision is Processor.AssignedPreferred | Processor.AssignedFallback =>
  decision._tag === 'AssignedPreferred' || decision._tag === 'AssignedFallback'

const eligibleProcessors = (
  manifest: Command.EffectManifest,
  processors: ReadonlyArray<Processor.Descriptor>,
): ReadonlyArray<Processor.Descriptor> =>
  Array.filter(processors, processor =>
    Processor.supportsEffectVersion(processor, manifest.id, manifest.version),
  )

/** Produces the next append-only placement generation when liveness changes it. */
export const replanEffectPlacement = (
  input: PlacementLifecycleInput,
): Option.Option<PlacementGeneration> => {
  if (
    Option.isSome(input.maybeCurrent) &&
    isAssigned(input.maybeCurrent.value.decision)
  ) {
    return Option.none()
  }
  if (
    Option.isSome(input.maybeCurrent) &&
    (input.maybeCurrent.value.decision._tag === 'Failed' ||
      input.maybeCurrent.value.decision._tag === 'Ignored')
  ) {
    return Option.none()
  }

  const decision = Processor.selectProcessor(input.manifest.placement, {
    maybeIngressProcessorId: Option.some(input.ingressProcessorId),
    maybeOriginClientId: Option.some(input.originClientId),
    previousAssignments: input.previousAssignments,
    processors: eligibleProcessors(input.manifest, input.processors),
  })
  if (
    Option.isSome(input.maybeCurrent) &&
    decisionEquivalence(input.maybeCurrent.value.decision, decision)
  ) {
    return Option.none()
  }
  return Option.some({
    assignmentGeneration: Option.match(input.maybeCurrent, {
      onNone: () => 1,
      onSome: current => current.assignmentGeneration + 1,
    }),
    cancellationGeneration: Option.match(input.maybeCurrent, {
      onNone: () => 0,
      onSome: current => current.cancellationGeneration,
    }),
    decision,
  })
}
