import {
  CancelledDeleteCounter,
  ClickedDeleteCounter,
  DismissedCounterDetail,
  InvalidNavigationCarrierUriError,
  MissingNavigationCarrierDestinationError,
  MultipleCountersInteractionGraph,
  NonCanonicalNavigationCarrierUriError,
  SelectedCounter,
  init,
  update,
} from 'counters-core-example'
import {
  type MultipleCountersAction,
  MultipleCountersProgramRouteProvider,
  MultipleCountersProvider,
  resolveMultipleCountersAction,
  resolveMultipleCountersNavigation,
  useMultipleCountersActions,
  useMultipleCountersModel,
  useMultipleCountersReplay,
  useMultipleCountersResolutionError,
} from 'counters-react-bindings-example'
import { Array, Option, Result } from 'effect'
import { InteractionGraph, Program } from 'foldkit'
import { type ReactNode, createElement } from 'react'
import { describe, expect, it } from 'vitest'

import { act, renderHook, waitFor } from '@testing-library/react'

const actionForToken = (
  model: Parameters<typeof MultipleCountersInteractionGraph.project>[0],
  token: string,
): MultipleCountersAction => {
  const projected = MultipleCountersInteractionGraph.project(model)
  if (Result.isFailure(projected)) {
    throw projected.failure
  }
  const maybeAction = Array.findFirst(
    InteractionGraph.interactiveNodes(projected.success.root),
    (node): node is MultipleCountersAction =>
      node._tag === 'InteractionAction' &&
      node.reference.interactionId.token === token,
  )
  if (Option.isNone(maybeAction)) {
    throw new Error(`Missing action ${token}`)
  }
  return maybeAction.value
}

describe('Multiple Counters React Client boundary', () => {
  it('opens explicit Program state routes without a private navigation boot', () => {
    const [listModel] = init()
    const [detailModel] = update(
      listModel,
      SelectedCounter({
        counterId: 'counter-1',
        detailPresentationId: 'detail-react-route',
      }),
    )
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) =>
      createElement(MultipleCountersProgramRouteProvider, {
        children,
        initialRoute: Program.state(detailModel),
      })
    const client = renderHook(
      () => ({
        model: useMultipleCountersModel(),
        replay: useMultipleCountersReplay(),
      }),
      { wrapper },
    )

    expect(client.result.current.model.navigation._tag).toBe('CounterDetail')
    expect(client.result.current.replay.transitions).toHaveLength(0)
  })

  it('preserves invalid, noncanonical, missing, and overlong carrier failures', () => {
    const [model] = init()
    const overlongCarrier = `/${'x'.repeat(
      InteractionGraph.interactionAdmissionLimits.destinationUriLength,
    )}`
    const invalid = resolveMultipleCountersNavigation(
      model,
      '/missing',
      'react:invalid-carrier',
    )
    const noncanonical = resolveMultipleCountersNavigation(
      model,
      'https://counters.invalid/counters/counter-1',
      'react:noncanonical-carrier',
    )
    const missing = resolveMultipleCountersNavigation(
      model,
      '/counters/counter-missing',
      'react:missing-carrier',
    )
    const overlong = resolveMultipleCountersNavigation(
      model,
      overlongCarrier,
      'react:overlong-carrier',
    )

    expect(Result.isFailure(invalid) && invalid.failure).toBeInstanceOf(
      InvalidNavigationCarrierUriError,
    )
    expect(
      Result.isFailure(noncanonical) && noncanonical.failure,
    ).toBeInstanceOf(NonCanonicalNavigationCarrierUriError)
    expect(Result.isFailure(missing) && missing.failure).toBeInstanceOf(
      MissingNavigationCarrierDestinationError,
    )
    expect(Result.isFailure(overlong) && overlong.failure).toBeInstanceOf(
      InvalidNavigationCarrierUriError,
    )
  })

  it('rejects an old destructive Action after reopening its destination', () => {
    const [listModel] = init()
    const [oldDetailModel] = update(
      listModel,
      SelectedCounter({
        counterId: 'counter-1',
        detailPresentationId: 'detail-react-old',
      }),
    )
    const [oldDeleteModel] = update(
      oldDetailModel,
      ClickedDeleteCounter({
        confirmationId: 'delete-react-old',
        counterId: 'counter-1',
        detailPresentationId: 'detail-react-old',
      }),
    )
    const oldConfirmAction = actionForToken(
      oldDeleteModel,
      'ConfirmDeleteCounter',
    )
    const [cancelledModel] = update(
      oldDeleteModel,
      CancelledDeleteCounter({
        confirmationId: 'delete-react-old',
        counterId: 'counter-1',
        detailPresentationId: 'detail-react-old',
      }),
    )
    const [returnedListModel] = update(
      cancelledModel,
      DismissedCounterDetail({
        counterId: 'counter-1',
        detailPresentationId: 'detail-react-old',
      }),
    )
    const [newDetailModel] = update(
      returnedListModel,
      SelectedCounter({
        counterId: 'counter-1',
        detailPresentationId: 'detail-react-new',
      }),
    )
    const [newDeleteModel] = update(
      newDetailModel,
      ClickedDeleteCounter({
        confirmationId: 'delete-react-new',
        counterId: 'counter-1',
        detailPresentationId: 'detail-react-new',
      }),
    )
    const resolved = resolveMultipleCountersAction(
      newDeleteModel,
      oldConfirmAction,
      'react:stale-confirm',
    )

    expect(Result.isFailure(resolved) && resolved.failure).toBeInstanceOf(
      InteractionGraph.MissingInteractionReferenceError,
    )
  })

  it('resolves a retained event handler against the latest live Model', async () => {
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) =>
      createElement(MultipleCountersProvider, {
        children,
        initialDestinationUri: '/counters',
      })
    const client = renderHook(
      () => ({
        actions: useMultipleCountersActions(),
        maybeResolutionError: useMultipleCountersResolutionError(),
        model: useMultipleCountersModel(),
        replay: useMultipleCountersReplay(),
      }),
      { wrapper },
    )
    await waitFor(() => {
      expect(client.result.current.replay.transitions).toHaveLength(1)
    })

    act(() => {
      client.result.current.actions.selectedCounter('counter-1')
    })
    await waitFor(() => {
      expect(
        actionForToken(client.result.current.model, 'DeleteCounter'),
      ).toBeDefined()
    })
    act(() => {
      client.result.current.actions.clickedDeleteCounter()
    })
    let oldConfirmAction: MultipleCountersAction | undefined
    await waitFor(() => {
      oldConfirmAction = actionForToken(
        client.result.current.model,
        'ConfirmDeleteCounter',
      )
    })
    if (oldConfirmAction === undefined) {
      throw new Error('Missing old confirm Action')
    }
    const retainedConfirmAction = oldConfirmAction
    const retainedPerformed = client.result.current.actions.performed

    act(() => {
      client.result.current.actions.cancelledDeleteCounter()
    })
    await waitFor(() => {
      expect(
        actionForToken(client.result.current.model, 'BackToCounters'),
      ).toBeDefined()
    })
    act(() => {
      client.result.current.actions.dismissedCounterDetail()
    })
    await waitFor(() => {
      expect(
        actionForToken(client.result.current.model, 'OpenCounter'),
      ).toBeDefined()
    })
    act(() => {
      client.result.current.actions.selectedCounter('counter-1')
    })
    await waitFor(() => {
      expect(
        actionForToken(client.result.current.model, 'DeleteCounter'),
      ).toBeDefined()
    })
    act(() => {
      client.result.current.actions.clickedDeleteCounter()
    })
    await waitFor(() => {
      expect(
        actionForToken(client.result.current.model, 'ConfirmDeleteCounter'),
      ).toBeDefined()
    })

    const transitionCount = Array.length(
      client.result.current.replay.transitions,
    )
    let staleResolution: ReturnType<typeof retainedPerformed> | undefined
    act(() => {
      staleResolution = retainedPerformed(retainedConfirmAction)
    })
    if (staleResolution === undefined) {
      throw new Error('Missing stale Action resolution')
    }
    expect(Result.isFailure(staleResolution)).toBe(true)
    expect(client.result.current.replay.transitions).toHaveLength(
      transitionCount,
    )
    expect(
      Option.isSome(client.result.current.maybeResolutionError) &&
        client.result.current.maybeResolutionError.value,
    ).toBeInstanceOf(InteractionGraph.MissingInteractionReferenceError)

    client.unmount()
  })
})
