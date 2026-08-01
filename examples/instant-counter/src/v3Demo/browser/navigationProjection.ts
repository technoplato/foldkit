import { Option } from 'effect'

/** A Client-local navigation submission awaiting its exact Program projection. */
export type MultipleCountersV3PendingNavigationIntent = Readonly<{
  expectedDestinationUri: string
  kind: 'Carrier' | 'Interaction'
  token: number
}>

/** Browser-history state projected from Program-owned navigation. */
export type MultipleCountersV3BrowserNavigationState = Readonly<{
  isPreservingRejectedCarrier: boolean
  lastProgramDestinationUri: string
  maybePendingIntent: Option.Option<MultipleCountersV3PendingNavigationIntent>
}>

/** One browser-history mutation selected by Program navigation projection. */
export type MultipleCountersV3BrowserHistoryMutation =
  | Readonly<{ _tag: 'NoBrowserHistoryMutation' }>
  | Readonly<{ _tag: 'PushedBrowserHistory'; destinationUri: string }>
  | Readonly<{ _tag: 'ReplacedBrowserHistory'; destinationUri: string }>

/** Result of reconciling one Program destination with browser history. */
export type MultipleCountersV3BrowserNavigationDecision = Readonly<{
  historyMutation: MultipleCountersV3BrowserHistoryMutation
  state: MultipleCountersV3BrowserNavigationState
}>

const noMutation = (): MultipleCountersV3BrowserHistoryMutation => ({
  _tag: 'NoBrowserHistoryMutation',
})

const decision = (
  state: MultipleCountersV3BrowserNavigationState,
  historyMutation: MultipleCountersV3BrowserHistoryMutation = noMutation(),
): MultipleCountersV3BrowserNavigationDecision => ({ historyMutation, state })

/** Creates browser projection state for the canonical Program destination. */
export const makeMultipleCountersV3BrowserNavigationState = (
  destinationUri: string,
): MultipleCountersV3BrowserNavigationState => ({
  isPreservingRejectedCarrier: false,
  lastProgramDestinationUri: destinationUri,
  maybePendingIntent: Option.none(),
})

/** Starts one tokenized local navigation intent and supersedes any older intent. */
export const beganMultipleCountersV3BrowserNavigation = (
  state: MultipleCountersV3BrowserNavigationState,
  intent: MultipleCountersV3PendingNavigationIntent,
): MultipleCountersV3BrowserNavigationState => ({
  ...state,
  isPreservingRejectedCarrier: false,
  maybePendingIntent: Option.some(intent),
})

/** Keeps a rejected carrier in browser history while the Program remains unchanged. */
export const preservedMultipleCountersV3RejectedCarrier = (
  state: MultipleCountersV3BrowserNavigationState,
  programDestinationUri: string,
): MultipleCountersV3BrowserNavigationState => ({
  ...state,
  isPreservingRejectedCarrier: true,
  lastProgramDestinationUri: programDestinationUri,
  maybePendingIntent: Option.none(),
})

/** Projects one observed Program destination into browser history. */
export const projectedMultipleCountersV3BrowserNavigation = (
  state: MultipleCountersV3BrowserNavigationState,
  programDestinationUri: string,
  browserDestinationUri: string,
): MultipleCountersV3BrowserNavigationDecision => {
  if (Option.isSome(state.maybePendingIntent)) {
    const intent = state.maybePendingIntent.value
    if (programDestinationUri !== intent.expectedDestinationUri) {
      return decision({
        ...state,
        lastProgramDestinationUri: programDestinationUri,
      })
    }

    const nextState = {
      isPreservingRejectedCarrier: false,
      lastProgramDestinationUri: programDestinationUri,
      maybePendingIntent: Option.none(),
    }
    if (browserDestinationUri === programDestinationUri) {
      return decision(nextState)
    }
    return decision(nextState, {
      _tag:
        intent.kind === 'Interaction'
          ? 'PushedBrowserHistory'
          : 'ReplacedBrowserHistory',
      destinationUri: programDestinationUri,
    })
  }

  if (
    state.isPreservingRejectedCarrier &&
    state.lastProgramDestinationUri === programDestinationUri
  ) {
    return decision(state)
  }

  const nextState = {
    isPreservingRejectedCarrier: false,
    lastProgramDestinationUri: programDestinationUri,
    maybePendingIntent: Option.none(),
  }
  if (browserDestinationUri === programDestinationUri) {
    return decision(nextState)
  }
  return decision(nextState, {
    _tag: 'ReplacedBrowserHistory',
    destinationUri: programDestinationUri,
  })
}

/** Settles only the matching intent, preserving applied intents until Model observation. */
export const settledMultipleCountersV3BrowserNavigation = (
  state: MultipleCountersV3BrowserNavigationState,
  token: number,
  isApplied: boolean,
  programDestinationUri: string,
  browserDestinationUri: string,
): MultipleCountersV3BrowserNavigationDecision => {
  if (
    Option.isNone(state.maybePendingIntent) ||
    state.maybePendingIntent.value.token !== token ||
    isApplied
  ) {
    return decision(state)
  }

  const intent = state.maybePendingIntent.value
  if (intent.kind === 'Carrier') {
    return decision(
      preservedMultipleCountersV3RejectedCarrier(state, programDestinationUri),
    )
  }

  const nextState = {
    isPreservingRejectedCarrier: false,
    lastProgramDestinationUri: programDestinationUri,
    maybePendingIntent: Option.none(),
  }
  if (browserDestinationUri === programDestinationUri) {
    return decision(nextState)
  }
  return decision(nextState, {
    _tag: 'ReplacedBrowserHistory',
    destinationUri: programDestinationUri,
  })
}
