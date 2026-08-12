import {
  Array,
  Data,
  Match as M,
  Option,
  Result,
  Schema as S,
  SchemaParser,
} from 'effect'

import type { Ports } from '../port/port.js'
import { ClientId, ProcessorId } from '../processor/processor.js'
import type { Program, ProgramSchema } from '../program/program.js'
import {
  type InteractionAction,
  InteractionAdmissionOccurrence,
  type InteractionEditableText,
  type InteractionGroup,
  type InteractionId,
  type InteractionNode,
  InteractionOccurrence,
  InteractionOccurrenceId,
  type InteractionProjection,
  type InteractionReference,
  type InteractionSelection,
  type InteractionSource,
  type ResolvedInteractionOccurrence,
  interactionAdmissionLimits,
  makeSchemas,
} from './interactionNode.js'

/** A projected interaction tree did not satisfy its Schema. */
export class InvalidInteractionProjectionError extends Data.TaggedError(
  'InvalidInteractionProjectionError',
)<{ readonly cause: unknown }> {}

/** A Program projection callback threw before returning an interaction tree. */
export class InteractionProjectionDefectError extends Data.TaggedError(
  'InteractionProjectionDefectError',
)<{ readonly cause: unknown }> {}

/** A claimed interaction occurrence did not satisfy its Schema. */
export class InvalidInteractionOccurrenceError extends Data.TaggedError(
  'InvalidInteractionOccurrenceError',
)<{ readonly cause: unknown }> {}

/** A resolved Message did not satisfy the Program Message Schema. */
export class InvalidInteractionMessageError extends Data.TaggedError(
  'InvalidInteractionMessageError',
)<{ readonly cause: unknown }> {}

/** A Program occurrence resolver threw before returning a Message decision. */
export class InteractionResolverDefectError extends Data.TaggedError(
  'InteractionResolverDefectError',
)<{ readonly cause: unknown }> {}

/** Two nodes projected the same Program-owned interaction identity. */
export class DuplicateInteractionIdError extends Data.TaggedError(
  'DuplicateInteractionIdError',
)<{ readonly interactionId: InteractionId }> {}

/** A node claimed an interaction source owned by another Program. */
export class ForeignInteractionSourceError extends Data.TaggedError(
  'ForeignInteractionSourceError',
)<{
  readonly actualProgramId: string
  readonly expectedProgramId: string
  readonly interactionId: InteractionId
}> {}

/** A projected reference named a different destination from its projection. */
export class MismatchedInteractionDestinationError extends Data.TaggedError(
  'MismatchedInteractionDestinationError',
)<{
  readonly actualDestinationUri: string
  readonly expectedDestinationUri: string
  readonly interactionId: InteractionId
}> {}

/** A group primary reference did not name an interactive descendant. */
export class MissingPrimaryInteractionError extends Data.TaggedError(
  'MissingPrimaryInteractionError',
)<{
  readonly groupInteractionId: InteractionId
  readonly primaryReference: InteractionReference
}> {}

/** A projected selection named a choice absent from its current choice set. */
export class InvalidSelectedInteractionChoiceError extends Data.TaggedError(
  'InvalidSelectedInteractionChoiceError',
)<{
  readonly choiceId: string
  readonly interactionId: InteractionId
}> {}

/** Two projected selection choices used the same identity. */
export class DuplicateInteractionChoiceError extends Data.TaggedError(
  'DuplicateInteractionChoiceError',
)<{
  readonly choiceId: string
  readonly interactionId: InteractionId
}> {}

/** A claim named an interaction source owned by another Program. */
export class ForeignInteractionClaimProgramError extends Data.TaggedError(
  'ForeignInteractionClaimProgramError',
)<{
  readonly actualProgramId: string
  readonly expectedProgramId: string
  readonly reference: InteractionReference
}> {}

/** A claim named a destination other than the Program's current destination. */
export class StaleInteractionDestinationError extends Data.TaggedError(
  'StaleInteractionDestinationError',
)<{
  readonly actualDestinationUri: string
  readonly expectedDestinationUri: string
  readonly reference: InteractionReference
}> {}

/** A claim named an interaction absent from the Program's current projection. */
export class MissingInteractionReferenceError extends Data.TaggedError(
  'MissingInteractionReferenceError',
)<{ readonly reference: InteractionReference }> {}

/** A claim named an interaction the Program currently marks unavailable. */
export class UnavailableInteractionError extends Data.TaggedError(
  'UnavailableInteractionError',
)<{
  readonly code: string
  readonly reason: string
  readonly reference: InteractionReference
}> {}

/** A claim kind did not match the referenced interaction node kind. */
export class InteractionOccurrenceKindMismatchError extends Data.TaggedError(
  'InteractionOccurrenceKindMismatchError',
)<{
  readonly actualOccurrenceTag: (typeof InteractionOccurrence.Type)['_tag']
  readonly expectedOccurrenceTag: (typeof InteractionOccurrence.Type)['_tag']
  readonly reference: InteractionReference
}> {}

/** A selection claim named a choice absent from the current selection. */
export class MissingInteractionSelectionChoiceError extends Data.TaggedError(
  'MissingInteractionSelectionChoiceError',
)<{
  readonly choiceId: string
  readonly reference: InteractionReference
}> {}

/** A selection claim named a choice the Program currently marks unavailable. */
export class UnavailableInteractionSelectionChoiceError extends Data.TaggedError(
  'UnavailableInteractionSelectionChoiceError',
)<{
  readonly choiceId: string
  readonly code: string
  readonly reason: string
  readonly reference: InteractionReference
}> {}

/** The Program declined to produce a Message for an otherwise current claim. */
export class InteractionResolverDeclinedError extends Data.TaggedError(
  'InteractionResolverDeclinedError',
)<{ readonly reference: InteractionReference }> {}

/** Authenticated invocation facts did not satisfy their authority-boundary Schema. */
export class InvalidInteractionInvocationFactsError extends Data.TaggedError(
  'InvalidInteractionInvocationFactsError',
)<{ readonly cause: unknown }> {}

/** An interaction claim did not carry its authenticated occurrence identity. */
export class MismatchedInteractionInvocationOccurrenceIdError extends Data.TaggedError(
  'MismatchedInteractionInvocationOccurrenceIdError',
)<{
  readonly authenticatedOccurrenceId: string
  readonly claimedOccurrenceId: string
}> {}

/** A Program admission-context callback threw before returning its context. */
export class InteractionInvocationContextDefectError extends Data.TaggedError(
  'InteractionInvocationContextDefectError',
)<{ readonly cause: unknown }> {}

/** Every typed failure produced while projecting or resolving interactions. */
export type InteractionGraphError =
  | InvalidInteractionProjectionError
  | InteractionProjectionDefectError
  | InvalidInteractionOccurrenceError
  | InvalidInteractionMessageError
  | InteractionResolverDefectError
  | DuplicateInteractionIdError
  | ForeignInteractionSourceError
  | MismatchedInteractionDestinationError
  | MissingPrimaryInteractionError
  | InvalidSelectedInteractionChoiceError
  | DuplicateInteractionChoiceError

/** Every expected current-state rejection of a well-formed interaction claim. */
export type InteractionClaimError =
  | ForeignInteractionClaimProgramError
  | StaleInteractionDestinationError
  | MissingInteractionReferenceError
  | UnavailableInteractionError
  | InteractionOccurrenceKindMismatchError
  | MissingInteractionSelectionChoiceError
  | UnavailableInteractionSelectionChoiceError
  | InteractionResolverDeclinedError

/** Every typed failure produced at an authenticated interaction-admission boundary. */
export type InteractionAdmissionError =
  | InteractionGraphError
  | InteractionClaimError
  | InvalidInteractionInvocationFactsError
  | MismatchedInteractionInvocationOccurrenceIdError
  | InteractionInvocationContextDefectError

const InvocationFactIdentity = S.String.check(
  S.isLengthBetween(1, interactionAdmissionLimits.invocationFactIdentityLength),
  S.isPattern(/^[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)*$/u),
)

/** Authenticated transport facts available to deterministic Program admission. */
export const InteractionInvocationFacts = S.Struct({
  occurrenceId: InteractionOccurrenceId,
  actorId: InvocationFactIdentity,
  clientId: ClientId,
  originatingProcessorId: ProcessorId,
  sessionId: InvocationFactIdentity,
  subjectId: InvocationFactIdentity,
})
/** Authenticated transport facts available to deterministic Program admission. */
export type InteractionInvocationFacts = typeof InteractionInvocationFacts.Type

/** Formats any valid Program Model through its declared Schema. */
export const formatProgramModel = <Model>(
  program: Readonly<{ Model: ProgramSchema<Model> }>,
  model: Model,
): string => S.toFormatter(program.Model)(model)

const lengthPrefixed = (value: string): string =>
  `${value.length.toString()}:${value}`

/** Returns a collision-safe key for one Program and Submodel interaction source. */
export const interactionSourceKey = (source: InteractionSource): string =>
  [
    lengthPrefixed(source.programId),
    ...Array.flatMap(source.instancePath, segment => [
      lengthPrefixed(segment.submodelId),
      lengthPrefixed(segment.instanceId),
    ]),
  ].join('')

/** Returns a collision-safe key for one structural semantic interaction identity. */
export const interactionIdKey = (interactionId: InteractionId): string =>
  `${interactionSourceKey(interactionId.source)}${lengthPrefixed(
    interactionId.token,
  )}`

/** Returns a collision-safe key for one destination-qualified interaction reference. */
export const interactionReferenceKey = (
  reference: InteractionReference,
): string =>
  `${lengthPrefixed(reference.destinationUri)}${interactionIdKey(
    reference.interactionId,
  )}`

const nodeInteractionId = <Descriptor>(
  node: InteractionNode<Descriptor>,
): InteractionId =>
  M.value(node).pipe(
    M.withReturnType<InteractionId>(),
    M.tagsExhaustive({
      InteractionGroup: ({ interactionId }) => interactionId,
      InteractionInspection: ({ interactionId }) => interactionId,
      InteractionAction: ({ reference }) => reference.interactionId,
      InteractionEditableText: ({ reference }) => reference.interactionId,
      InteractionSelection: ({ reference }) => reference.interactionId,
    }),
  )

const maybeNodeReference = <Descriptor>(
  node: InteractionNode<Descriptor>,
): Option.Option<InteractionReference> =>
  M.value(node).pipe(
    M.withReturnType<Option.Option<InteractionReference>>(),
    M.tagsExhaustive({
      InteractionGroup: () => Option.none(),
      InteractionInspection: () => Option.none(),
      InteractionAction: ({ reference }) => Option.some(reference),
      InteractionEditableText: ({ reference }) => Option.some(reference),
      InteractionSelection: ({ reference }) => Option.some(reference),
    }),
  )

const descendants = <Descriptor>(
  node: InteractionNode<Descriptor>,
): ReadonlyArray<InteractionNode<Descriptor>> =>
  node._tag === 'InteractionGroup'
    ? [node, ...Array.flatMap(node.children, descendants)]
    : [node]

/** Returns every node in depth-first Program-projected order. */
export const interactionNodes = <Descriptor>(
  root: InteractionGroup<Descriptor>,
): ReadonlyArray<InteractionNode<Descriptor>> => descendants(root)

/** Returns whether a node accepts a Client interaction occurrence. */
export const isInteractiveNode = <Descriptor>(
  node: InteractionNode<Descriptor>,
): node is
  | InteractionAction<Descriptor>
  | InteractionEditableText<Descriptor>
  | InteractionSelection<Descriptor> =>
  node._tag === 'InteractionAction' ||
  node._tag === 'InteractionEditableText' ||
  node._tag === 'InteractionSelection'

/** Returns every occurrence-bearing node in depth-first projected order. */
export const interactiveNodes = <Descriptor>(
  root: InteractionGroup<Descriptor>,
): ReadonlyArray<
  | InteractionAction<Descriptor>
  | InteractionEditableText<Descriptor>
  | InteractionSelection<Descriptor>
> => Array.filter(interactionNodes(root), isInteractiveNode)

/** Finds a current interactive node by its destination-qualified reference. */
export const findInteractionNode = <Descriptor>(
  root: InteractionGroup<Descriptor>,
  reference: InteractionReference,
): Option.Option<
  | InteractionAction<Descriptor>
  | InteractionEditableText<Descriptor>
  | InteractionSelection<Descriptor>
> => {
  const expectedKey = interactionReferenceKey(reference)
  return Array.findFirst(
    interactiveNodes(root),
    node => interactionReferenceKey(node.reference) === expectedKey,
  )
}

const validateSelection = <Descriptor>(
  selection: InteractionSelection<Descriptor>,
): Option.Option<InteractionGraphError> => {
  const choiceIds = new Set<string>()
  for (const choice of selection.choices) {
    if (choiceIds.has(choice.id)) {
      return Option.some(
        new DuplicateInteractionChoiceError({
          choiceId: choice.id,
          interactionId: selection.reference.interactionId,
        }),
      )
    }
    choiceIds.add(choice.id)
  }
  if (
    Option.isSome(selection.maybeSelectedChoiceId) &&
    !choiceIds.has(selection.maybeSelectedChoiceId.value)
  ) {
    return Option.some(
      new InvalidSelectedInteractionChoiceError({
        choiceId: selection.maybeSelectedChoiceId.value,
        interactionId: selection.reference.interactionId,
      }),
    )
  }
  return Option.none()
}

const validateGroupPrimary = <Descriptor>(
  group: InteractionGroup<Descriptor>,
): Option.Option<InteractionGraphError> => {
  if (Option.isNone(group.maybePrimaryInteractionReference)) {
    return Option.none()
  }
  const primaryKey = interactionReferenceKey(
    group.maybePrimaryInteractionReference.value,
  )
  const hasPrimaryDescendant = Array.some(
    Array.flatMap(group.children, descendants),
    node => {
      const maybeReference = maybeNodeReference(node)
      return (
        Option.isSome(maybeReference) &&
        interactionReferenceKey(maybeReference.value) === primaryKey
      )
    },
  )
  return hasPrimaryDescendant
    ? Option.none()
    : Option.some(
        new MissingPrimaryInteractionError({
          groupInteractionId: group.interactionId,
          primaryReference: group.maybePrimaryInteractionReference.value,
        }),
      )
}

const validateProjection = <Descriptor>(
  programId: string,
  projection: InteractionProjection<Descriptor>,
): Result.Result<InteractionProjection<Descriptor>, InteractionGraphError> => {
  const ids = new Set<string>()
  const nodes = interactionNodes(projection.root)
  for (const node of nodes) {
    const interactionId = nodeInteractionId(node)
    if (interactionId.source.programId !== programId) {
      return Result.fail(
        new ForeignInteractionSourceError({
          actualProgramId: interactionId.source.programId,
          expectedProgramId: programId,
          interactionId,
        }),
      )
    }
    const key = interactionIdKey(interactionId)
    if (ids.has(key)) {
      return Result.fail(new DuplicateInteractionIdError({ interactionId }))
    }
    ids.add(key)
    const maybeReference = maybeNodeReference(node)
    if (
      Option.isSome(maybeReference) &&
      maybeReference.value.destinationUri !== projection.destinationUri
    ) {
      return Result.fail(
        new MismatchedInteractionDestinationError({
          actualDestinationUri: maybeReference.value.destinationUri,
          expectedDestinationUri: projection.destinationUri,
          interactionId,
        }),
      )
    }
    if (node._tag === 'InteractionGroup') {
      const maybeError = validateGroupPrimary(node)
      if (Option.isSome(maybeError)) {
        return Result.fail(maybeError.value)
      }
    }
    if (node._tag === 'InteractionSelection') {
      const maybeError = validateSelection(node)
      if (Option.isSome(maybeError)) {
        return Result.fail(maybeError.value)
      }
    }
  }
  return Result.succeed(projection)
}

const expectedOccurrenceTag = <Descriptor>(
  node:
    | InteractionAction<Descriptor>
    | InteractionEditableText<Descriptor>
    | InteractionSelection<Descriptor>,
): (typeof InteractionOccurrence.Type)['_tag'] =>
  M.value(node).pipe(
    M.withReturnType<(typeof InteractionOccurrence.Type)['_tag']>(),
    M.tagsExhaustive({
      InteractionAction: () => 'ActivatedInteraction',
      InteractionEditableText: () => 'ChangedInteractionText',
      InteractionSelection: () => 'SelectedInteractionChoice',
    }),
  )

const occurrenceKindMismatch = <Descriptor>(
  node:
    | InteractionAction<Descriptor>
    | InteractionEditableText<Descriptor>
    | InteractionSelection<Descriptor>,
  occurrence: typeof InteractionOccurrence.Type,
): InteractionOccurrenceKindMismatchError =>
  new InteractionOccurrenceKindMismatchError({
    actualOccurrenceTag: occurrence._tag,
    expectedOccurrenceTag: expectedOccurrenceTag(node),
    reference: occurrence.reference,
  })

const pairOccurrenceForAdmission = <Descriptor>(
  node:
    | InteractionAction<Descriptor>
    | InteractionEditableText<Descriptor>
    | InteractionSelection<Descriptor>,
  occurrence: typeof InteractionOccurrence.Type,
): Result.Result<
  ResolvedInteractionOccurrence<Descriptor>,
  InteractionClaimError
> =>
  M.value(occurrence).pipe(
    M.withReturnType<
      Result.Result<
        ResolvedInteractionOccurrence<Descriptor>,
        InteractionClaimError
      >
    >(),
    M.tagsExhaustive({
      ActivatedInteraction: occurrence => {
        if (node._tag === 'InteractionAction') {
          return Result.succeed({ node, occurrence })
        } else {
          return Result.fail(occurrenceKindMismatch(node, occurrence))
        }
      },
      ChangedInteractionText: occurrence => {
        if (node._tag === 'InteractionEditableText') {
          return Result.succeed({ node, occurrence })
        } else {
          return Result.fail(occurrenceKindMismatch(node, occurrence))
        }
      },
      SelectedInteractionChoice: occurrence => {
        if (node._tag !== 'InteractionSelection') {
          return Result.fail(occurrenceKindMismatch(node, occurrence))
        }
        const maybeChoice = Array.findFirst(
          node.choices,
          choice => choice.id === occurrence.choiceId,
        )
        if (Option.isNone(maybeChoice)) {
          return Result.fail(
            new MissingInteractionSelectionChoiceError({
              choiceId: occurrence.choiceId,
              reference: occurrence.reference,
            }),
          )
        }
        if (maybeChoice.value.availability._tag === 'Unavailable') {
          return Result.fail(
            new UnavailableInteractionSelectionChoiceError({
              choiceId: occurrence.choiceId,
              code: maybeChoice.value.availability.code,
              reason: maybeChoice.value.availability.reason,
              reference: occurrence.reference,
            }),
          )
        }
        return Result.succeed({ node, occurrence })
      },
    }),
  )

const claimErrorTags = new Set([
  'ForeignInteractionClaimProgramError',
  'StaleInteractionDestinationError',
  'MissingInteractionReferenceError',
  'UnavailableInteractionError',
  'InteractionOccurrenceKindMismatchError',
  'MissingInteractionSelectionChoiceError',
  'UnavailableInteractionSelectionChoiceError',
  'InteractionResolverDeclinedError',
])

const isInteractionClaimError = (
  error: InteractionClaimError | InteractionGraphError,
): error is InteractionClaimError => claimErrorTags.has(error._tag)

/** A standalone renderer-free semantic interaction graph for one Program. */
export type InteractionGraph<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Descriptor,
  InvocationContext,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
> = Readonly<{
  program: Program<Model, Message, Resources, ManagedResourceServices, P>
  Descriptor: ProgramSchema<Descriptor>
  InteractionProjection: ProgramSchema<InteractionProjection<Descriptor>>
  InteractionOccurrence: typeof InteractionOccurrence
  project: (
    model: Model,
  ) => Result.Result<InteractionProjection<Descriptor>, InteractionGraphError>
  resolve: (
    model: Model,
    occurrence: unknown,
    context: InvocationContext,
  ) => Result.Result<Option.Option<Message>, InteractionGraphError>
  /**
   * Resolves a trusted local occurrence with an already-derived context.
   * Network authorities use `InteractionAdmissionDefinition.resolve`.
   */
  resolveWithContext: (
    model: Model,
    occurrence: unknown,
    context: InvocationContext,
  ) => Result.Result<Message, InteractionClaimError | InteractionGraphError>
}>

/** A Program InteractionGraph paired with deterministic authenticated context. */
export type InteractionAdmissionDefinition<
  Model,
  Message extends Readonly<{ _tag: string }>,
  InvocationContext,
  Descriptor,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
> = Readonly<{
  /** The Program-owned graph used for both Client and authority resolution. */
  graph: InteractionGraph<
    Model,
    Message,
    Descriptor,
    InvocationContext,
    Resources,
    ManagedResourceServices,
    P
  >
  /** Resolves one bounded claim from its matching authenticated invocation facts. */
  resolve: (
    model: Model,
    occurrence: unknown,
    invocationFacts: unknown,
  ) => Result.Result<Message, InteractionAdmissionError>
}>

/** Defines deterministic authenticated context for one Program InteractionGraph. */
export const makeAdmission = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  InvocationContext,
  Descriptor,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  definition: Readonly<{
    graph: InteractionGraph<
      Model,
      Message,
      Descriptor,
      InvocationContext,
      Resources,
      ManagedResourceServices,
      P
    >
    contextForInvocation: (
      facts: InteractionInvocationFacts,
    ) => InvocationContext
  }>,
): InteractionAdmissionDefinition<
  Model,
  Message,
  InvocationContext,
  Descriptor,
  Resources,
  ManagedResourceServices,
  P
> => {
  const resolve = (
    model: Model,
    occurrence: unknown,
    invocationFacts: unknown,
  ): Result.Result<Message, InteractionAdmissionError> => {
    const parsedInvocationFacts = SchemaParser.decodeUnknownResult(
      InteractionInvocationFacts,
    )(invocationFacts)
    if (Result.isFailure(parsedInvocationFacts)) {
      return Result.fail(
        new InvalidInteractionInvocationFactsError({
          cause: parsedInvocationFacts.failure,
        }),
      )
    }
    const parsedOccurrence = SchemaParser.decodeUnknownResult(
      InteractionAdmissionOccurrence,
    )(occurrence)
    if (Result.isFailure(parsedOccurrence)) {
      return Result.fail(
        new InvalidInteractionOccurrenceError({
          cause: parsedOccurrence.failure,
        }),
      )
    }
    if (
      parsedOccurrence.success.occurrenceId !==
      parsedInvocationFacts.success.occurrenceId
    ) {
      return Result.fail(
        new MismatchedInteractionInvocationOccurrenceIdError({
          authenticatedOccurrenceId: parsedInvocationFacts.success.occurrenceId,
          claimedOccurrenceId: parsedOccurrence.success.occurrenceId,
        }),
      )
    }
    const context = Result.try({
      try: () => definition.contextForInvocation(parsedInvocationFacts.success),
      catch: cause => new InteractionInvocationContextDefectError({ cause }),
    })
    if (Result.isFailure(context)) {
      return Result.fail(context.failure)
    }
    return definition.graph.resolveWithContext(
      model,
      parsedOccurrence.success,
      context.success,
    )
  }
  return { graph: definition.graph, resolve }
}

/** Defines a Schema-backed interaction graph without changing Program generics. */
export const make = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources,
  ManagedResourceServices,
  P extends Ports | undefined,
  Descriptor,
  InvocationContext,
>(definition: {
  readonly program: Program<
    Model,
    Message,
    Resources,
    ManagedResourceServices,
    P
  >
  readonly Descriptor: ProgramSchema<Descriptor>
  readonly projectionForModel: (
    model: Model,
  ) => InteractionProjection<Descriptor>
  readonly messageForOccurrence: (
    input: Readonly<{
      model: Model
      resolved: ResolvedInteractionOccurrence<Descriptor>
      context: InvocationContext
    }>,
  ) => Option.Option<Message>
}): InteractionGraph<
  Model,
  Message,
  Descriptor,
  InvocationContext,
  Resources,
  ManagedResourceServices,
  P
> => {
  const schemas = makeSchemas(definition.Descriptor)
  const project = (
    model: Model,
  ): Result.Result<
    InteractionProjection<Descriptor>,
    InteractionGraphError
  > => {
    const candidateProjection = Result.try({
      try: () => definition.projectionForModel(model),
      catch: cause => new InteractionProjectionDefectError({ cause }),
    })
    if (Result.isFailure(candidateProjection)) {
      return Result.fail(candidateProjection.failure)
    }
    const encoded = SchemaParser.encodeUnknownResult(
      schemas.InteractionProjection,
    )(candidateProjection.success)
    if (Result.isFailure(encoded)) {
      return Result.fail(
        new InvalidInteractionProjectionError({ cause: encoded.failure }),
      )
    }
    const parsed = SchemaParser.decodeUnknownResult(
      schemas.InteractionProjection,
    )(encoded.success)
    if (Result.isFailure(parsed)) {
      return Result.fail(
        new InvalidInteractionProjectionError({ cause: parsed.failure }),
      )
    }
    return validateProjection(definition.program.id, parsed.success)
  }
  const resolveWithContext = (
    model: Model,
    occurrence: unknown,
    context: InvocationContext,
  ): Result.Result<Message, InteractionClaimError | InteractionGraphError> => {
    const parsedOccurrence = SchemaParser.decodeUnknownResult(
      InteractionOccurrence,
    )(occurrence)
    if (Result.isFailure(parsedOccurrence)) {
      return Result.fail(
        new InvalidInteractionOccurrenceError({
          cause: parsedOccurrence.failure,
        }),
      )
    }
    const projected = project(model)
    if (Result.isFailure(projected)) {
      return Result.fail(projected.failure)
    }
    if (
      parsedOccurrence.success.reference.interactionId.source.programId !==
      definition.program.id
    ) {
      return Result.fail(
        new ForeignInteractionClaimProgramError({
          actualProgramId:
            parsedOccurrence.success.reference.interactionId.source.programId,
          expectedProgramId: definition.program.id,
          reference: parsedOccurrence.success.reference,
        }),
      )
    }
    if (
      parsedOccurrence.success.reference.destinationUri !==
      projected.success.destinationUri
    ) {
      return Result.fail(
        new StaleInteractionDestinationError({
          actualDestinationUri:
            parsedOccurrence.success.reference.destinationUri,
          expectedDestinationUri: projected.success.destinationUri,
          reference: parsedOccurrence.success.reference,
        }),
      )
    }
    const maybeNode = findInteractionNode(
      projected.success.root,
      parsedOccurrence.success.reference,
    )
    if (Option.isNone(maybeNode)) {
      return Result.fail(
        new MissingInteractionReferenceError({
          reference: parsedOccurrence.success.reference,
        }),
      )
    }
    if (maybeNode.value.availability._tag === 'Unavailable') {
      return Result.fail(
        new UnavailableInteractionError({
          code: maybeNode.value.availability.code,
          reason: maybeNode.value.availability.reason,
          reference: parsedOccurrence.success.reference,
        }),
      )
    }
    const resolved = pairOccurrenceForAdmission(
      maybeNode.value,
      parsedOccurrence.success,
    )
    if (Result.isFailure(resolved)) {
      return Result.fail(resolved.failure)
    }
    const resolvedMessage = Result.try({
      try: () =>
        definition.messageForOccurrence({
          model,
          resolved: resolved.success,
          context,
        }),
      catch: cause => new InteractionResolverDefectError({ cause }),
    })
    if (Result.isFailure(resolvedMessage)) {
      return Result.fail(resolvedMessage.failure)
    }
    const maybeMessage = resolvedMessage.success
    if (Option.isNone(maybeMessage)) {
      return Result.fail(
        new InteractionResolverDeclinedError({
          reference: parsedOccurrence.success.reference,
        }),
      )
    }
    const encodedMessage = SchemaParser.encodeUnknownResult(
      definition.program.Message,
    )(maybeMessage.value)
    if (Result.isFailure(encodedMessage)) {
      return Result.fail(
        new InvalidInteractionMessageError({ cause: encodedMessage.failure }),
      )
    }
    const parsedMessage = SchemaParser.decodeUnknownResult(
      definition.program.Message,
    )(encodedMessage.success)
    if (Result.isFailure(parsedMessage)) {
      return Result.fail(
        new InvalidInteractionMessageError({ cause: parsedMessage.failure }),
      )
    }
    return Result.succeed(parsedMessage.success)
  }
  const resolve = (
    model: Model,
    occurrence: unknown,
    context: InvocationContext,
  ): Result.Result<Option.Option<Message>, InteractionGraphError> => {
    const resolved = resolveWithContext(model, occurrence, context)
    if (Result.isSuccess(resolved)) {
      return Result.succeed(Option.some(resolved.success))
    }
    if (isInteractionClaimError(resolved.failure)) {
      return Result.succeed(Option.none())
    } else {
      return Result.fail(resolved.failure)
    }
  }
  return {
    program: definition.program,
    Descriptor: definition.Descriptor,
    InteractionProjection: schemas.InteractionProjection,
    InteractionOccurrence,
    project,
    resolve,
    resolveWithContext,
  }
}
