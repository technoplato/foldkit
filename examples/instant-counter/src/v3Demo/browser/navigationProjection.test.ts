import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  beganMultipleCountersV3BrowserNavigation,
  makeMultipleCountersV3BrowserNavigationState,
  projectedMultipleCountersV3BrowserNavigation,
  settledMultipleCountersV3BrowserNavigation,
} from './navigationProjection.js'

describe('Multiple Counters v3 browser navigation projection', () => {
  it('does not rewrite a popstate carrier while an older Model is observed', () => {
    const pending = beganMultipleCountersV3BrowserNavigation(
      makeMultipleCountersV3BrowserNavigationState('/counters'),
      {
        expectedDestinationUri: '/counters/counter-2',
        kind: 'Carrier',
        token: 1,
      },
    )

    const oldModel = projectedMultipleCountersV3BrowserNavigation(
      pending,
      '/counters',
      '/counters/counter-2',
    )
    expect(oldModel.historyMutation._tag).toBe('NoBrowserHistoryMutation')
    expect(Option.isSome(oldModel.state.maybePendingIntent)).toBe(true)

    const requestedModel = projectedMultipleCountersV3BrowserNavigation(
      oldModel.state,
      '/counters/counter-2',
      '/counters/counter-2',
    )
    expect(requestedModel.historyMutation._tag).toBe('NoBrowserHistoryMutation')
    expect(Option.isNone(requestedModel.state.maybePendingIntent)).toBe(true)
  })

  it('pushes an interaction destination only after its exact Model arrives', () => {
    const pending = beganMultipleCountersV3BrowserNavigation(
      makeMultipleCountersV3BrowserNavigationState('/counters'),
      {
        expectedDestinationUri: '/counters/counter-1',
        kind: 'Interaction',
        token: 4,
      },
    )

    const oldModel = projectedMultipleCountersV3BrowserNavigation(
      pending,
      '/counters',
      '/counters',
    )
    expect(oldModel.historyMutation._tag).toBe('NoBrowserHistoryMutation')

    const requestedModel = projectedMultipleCountersV3BrowserNavigation(
      oldModel.state,
      '/counters/counter-1',
      '/counters',
    )
    expect(requestedModel.historyMutation).toEqual({
      _tag: 'PushedBrowserHistory',
      destinationUri: '/counters/counter-1',
    })
  })

  it('does not let an older completion clear a newer intent', () => {
    const first = beganMultipleCountersV3BrowserNavigation(
      makeMultipleCountersV3BrowserNavigationState('/counters'),
      {
        expectedDestinationUri: '/counters/counter-1',
        kind: 'Interaction',
        token: 1,
      },
    )
    const second = beganMultipleCountersV3BrowserNavigation(first, {
      expectedDestinationUri: '/counters/counter-2',
      kind: 'Interaction',
      token: 2,
    })

    const staleFirst = settledMultipleCountersV3BrowserNavigation(
      second,
      1,
      false,
      '/counters',
      '/counters',
    )
    expect(staleFirst.state).toEqual(second)
  })

  it('preserves a rejected carrier but restores a rejected interaction URL', () => {
    const base = makeMultipleCountersV3BrowserNavigationState('/counters')
    const carrier = beganMultipleCountersV3BrowserNavigation(base, {
      expectedDestinationUri: '/missing',
      kind: 'Carrier',
      token: 5,
    })
    const rejectedCarrier = settledMultipleCountersV3BrowserNavigation(
      carrier,
      5,
      false,
      '/counters',
      '/missing',
    )
    expect(rejectedCarrier.historyMutation._tag).toBe(
      'NoBrowserHistoryMutation',
    )
    expect(rejectedCarrier.state.isPreservingRejectedCarrier).toBe(true)

    const interaction = beganMultipleCountersV3BrowserNavigation(base, {
      expectedDestinationUri: '/counters/counter-1',
      kind: 'Interaction',
      token: 6,
    })
    const rejectedInteraction = settledMultipleCountersV3BrowserNavigation(
      interaction,
      6,
      false,
      '/counters',
      '/counters/counter-1',
    )
    expect(rejectedInteraction.historyMutation).toEqual({
      _tag: 'ReplacedBrowserHistory',
      destinationUri: '/counters',
    })
  })

  it('supersedes a local intent when Observe begins following its leader', () => {
    const pending = beganMultipleCountersV3BrowserNavigation(
      makeMultipleCountersV3BrowserNavigationState('/counters/counter-local'),
      {
        expectedDestinationUri: '/counters/counter-a',
        kind: 'Interaction',
        token: 9,
      },
    )
    expect(Option.isSome(pending.maybePendingIntent)).toBe(true)

    const observeState = makeMultipleCountersV3BrowserNavigationState(
      '/counters/counter-b',
    )
    const followedLeader = projectedMultipleCountersV3BrowserNavigation(
      observeState,
      '/counters/counter-b',
      '/counters/counter-local',
    )

    expect(Option.isNone(followedLeader.state.maybePendingIntent)).toBe(true)
    expect(followedLeader.historyMutation).toEqual({
      _tag: 'ReplacedBrowserHistory',
      destinationUri: '/counters/counter-b',
    })
  })
})
