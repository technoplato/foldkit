import type { Result } from 'effect'

import type { InteractionOccurrenceId } from '../interactionGraph/interactionNode.js'
import type { Ports } from '../port/port.js'
import type { Program, ProgramSchema } from './program.js'

/** Program-owned reconstruction of one authenticated Message claim. */
export type MessageAdmissionDefinition<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Claim,
  DecodeError,
  ResolutionError,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
> = Readonly<{
  program: Program<Model, Message, Resources, ManagedResourceServices, P>
  Claim: ProgramSchema<Claim>
  decodeClaim: (input: unknown) => Result.Result<Claim, DecodeError>
  occurrenceId: (claim: Claim) => InteractionOccurrenceId
  resolve: (
    model: Model,
    claim: Claim,
    invocationFacts: unknown,
  ) => Result.Result<Message, ResolutionError>
}>

/** Defines portable Program Message admission while preserving inferred types. */
export const makeMessageAdmission = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Claim,
  DecodeError,
  ResolutionError,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  definition: MessageAdmissionDefinition<
    Model,
    Message,
    Claim,
    DecodeError,
    ResolutionError,
    Resources,
    ManagedResourceServices,
    P
  >,
): MessageAdmissionDefinition<
  Model,
  Message,
  Claim,
  DecodeError,
  ResolutionError,
  Resources,
  ManagedResourceServices,
  P
> => definition
