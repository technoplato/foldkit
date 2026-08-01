import {
  type Interaction,
  type Model,
  MultipleCountersInteractionGraph,
  type NavigationCarrierResolutionError,
  activatedInteraction,
  interactionIdentitySourceForOccurrence,
  resolveNavigationCarrier,
} from 'counters-core-example'
import { InteractionGraph } from 'foldkit'

/** One Program-owned action projected for the Foldkit HTML Client. */
export type HtmlInteractionAction =
  InteractionGraph.InteractionAction<Interaction>

/** Every typed failure surfaced by the Foldkit HTML Client. */
export type HtmlClientResolutionError =
  | InteractionGraph.InteractionClaimError
  | InteractionGraph.InteractionGraphError
  | NavigationCarrierResolutionError

/** Allocates one fresh local occurrence identity at a browser event boundary. */
export const nextHtmlOccurrenceId =
  (): InteractionGraph.InteractionOccurrenceId => {
    const crypto = globalThis.crypto
    if (crypto === undefined) {
      return `html:${Date.now().toString(36)}_${Math.floor(
        Math.random() * Number.MAX_SAFE_INTEGER,
      ).toString(36)}`
    } else {
      return `html:${crypto.randomUUID()}`
    }
  }

const htmlInvocationFacts = (
  occurrenceId: InteractionGraph.InteractionOccurrenceId,
): InteractionGraph.InteractionInvocationFacts =>
  InteractionGraph.InteractionInvocationFacts.make({
    actorId: 'html-local-actor',
    clientId: 'html-local-client',
    occurrenceId,
    originatingProcessorId: 'html-local-processor',
    sessionId: 'html-local-session',
    subjectId: 'html-local-subject',
  })

/** Resolves one raw carrier through the strict Program-owned boundary. */
export const resolveHtmlNavigationCarrier = (
  model: Model,
  carrier: string,
  occurrenceId: InteractionGraph.InteractionOccurrenceId,
) => resolveNavigationCarrier(model, carrier, htmlInvocationFacts(occurrenceId))

/** Resolves one exact projected action against the current live Model. */
export const resolveHtmlInteraction = (
  model: Model,
  action: HtmlInteractionAction,
  occurrenceId: InteractionGraph.InteractionOccurrenceId,
) =>
  MultipleCountersInteractionGraph.resolveWithContext(
    model,
    activatedInteraction(action.reference, occurrenceId),
    interactionIdentitySourceForOccurrence(occurrenceId),
  )

/** Formats one typed Client failure without discarding its failure class. */
export const htmlClientResolutionErrorMessage = (
  error: HtmlClientResolutionError,
): string => error._tag
