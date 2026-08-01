import {
  CancelledDeleteCounter,
  ClickedDeleteCounter,
  DismissedCounterDetail,
  InvalidNavigationCarrierUriError,
  MissingNavigationCarrierDestinationError,
  MultipleCountersInteractionGraph,
  MultipleCountersProgram,
  NonCanonicalNavigationCarrierUriError,
  SelectedCounter,
  StaticCounterFactClient,
  init,
  navigationToPath,
  update,
} from 'counters-core-example'
import { Array, Effect, Fiber, Option, Result } from 'effect'
import { InteractionGraph, Runtime } from 'foldkit'
import { describe, expect, it } from 'vitest'

import {
  type HtmlInteractionAction,
  resolveHtmlInteraction,
  resolveHtmlNavigationCarrier,
} from './client'
import { makeView } from './main'

const actionForToken = (
  model: Parameters<typeof MultipleCountersInteractionGraph.project>[0],
  token: string,
): HtmlInteractionAction => {
  const projected = MultipleCountersInteractionGraph.project(model)
  if (Result.isFailure(projected)) {
    throw projected.failure
  }
  const maybeAction = Array.findFirst(
    InteractionGraph.interactiveNodes(projected.success.root),
    (node): node is HtmlInteractionAction =>
      node._tag === 'InteractionAction' &&
      node.reference.interactionId.token === token,
  )
  if (Option.isNone(maybeAction)) {
    throw new Error(`Missing action ${token}`)
  }
  return maybeAction.value
}

describe('Multiple Counters Foldkit HTML Client', () => {
  it('preserves invalid, noncanonical, missing, and overlong carrier failures', () => {
    const [model] = init()
    const overlongCarrier = `/${'x'.repeat(
      InteractionGraph.interactionAdmissionLimits.destinationUriLength,
    )}`
    const invalid = resolveHtmlNavigationCarrier(
      model,
      '/missing',
      'html:invalid-carrier',
    )
    const noncanonical = resolveHtmlNavigationCarrier(
      model,
      'https://counters.invalid/counters/counter-1',
      'html:noncanonical-carrier',
    )
    const missing = resolveHtmlNavigationCarrier(
      model,
      '/counters/counter-missing',
      'html:missing-carrier',
    )
    const overlong = resolveHtmlNavigationCarrier(
      model,
      overlongCarrier,
      'html:overlong-carrier',
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
        detailPresentationId: 'detail-html-old',
      }),
    )
    const [oldDeleteModel] = update(
      oldDetailModel,
      ClickedDeleteCounter({
        confirmationId: 'delete-html-old',
        counterId: 'counter-1',
        detailPresentationId: 'detail-html-old',
      }),
    )
    const oldConfirmAction = actionForToken(
      oldDeleteModel,
      'ConfirmDeleteCounter',
    )
    const [cancelledModel] = update(
      oldDeleteModel,
      CancelledDeleteCounter({
        confirmationId: 'delete-html-old',
        counterId: 'counter-1',
        detailPresentationId: 'detail-html-old',
      }),
    )
    const [returnedListModel] = update(
      cancelledModel,
      DismissedCounterDetail({
        counterId: 'counter-1',
        detailPresentationId: 'detail-html-old',
      }),
    )
    const [newDetailModel] = update(
      returnedListModel,
      SelectedCounter({
        counterId: 'counter-1',
        detailPresentationId: 'detail-html-new',
      }),
    )
    const [newDeleteModel] = update(
      newDetailModel,
      ClickedDeleteCounter({
        confirmationId: 'delete-html-new',
        counterId: 'counter-1',
        detailPresentationId: 'detail-html-new',
      }),
    )
    const resolved = resolveHtmlInteraction(
      newDeleteModel,
      oldConfirmAction,
      'html:stale-confirm',
    )

    expect(Result.isFailure(resolved) && resolved.failure).toBeInstanceOf(
      InteractionGraph.MissingInteractionReferenceError,
    )
  })

  it('derives a fresh canonical Message from each event occurrence', () => {
    const [model] = init()
    const addAction = actionForToken(model, 'AddCounter')
    const first = resolveHtmlInteraction(model, addAction, 'html:first-click')
    const second = resolveHtmlInteraction(model, addAction, 'html:second-click')

    expect(Result.isSuccess(first)).toBe(true)
    expect(Result.isSuccess(second)).toBe(true)
    if (Result.isSuccess(first) && Result.isSuccess(second)) {
      expect(first.success).not.toStrictEqual(second.success)
      expect(first.success).toMatchObject({
        _tag: 'ClickedAddCounter',
        counterId: 'counter-html:first-click',
      })
      expect(second.success).toMatchObject({
        _tag: 'ClickedAddCounter',
        counterId: 'counter-html:second-click',
      })
    }
  })

  it('enqueues exactly one Message for valid boot and popstate carriers', async () => {
    window.history.replaceState({}, '', '/counters')
    const container = document.createElement('div')
    container.id = 'valid-carrier-client'
    document.body.append(container)
    const observedDestinations: Array<string> = []
    const application = Runtime.makeFoldkitApplication({
      container,
      onModel: model => {
        observedDestinations.push(navigationToPath(model.navigation))
      },
      program: MultipleCountersProgram,
      resources: StaticCounterFactClient,
      view: makeView(),
    })
    const fiber = Effect.runFork(application.start())

    try {
      await expect.poll(() => Array.length(observedDestinations)).toBe(2)
      expect(observedDestinations).toStrictEqual(['/counters', '/counters'])

      window.history.pushState({}, '', '/counters/counter-1/delete')
      window.dispatchEvent(new PopStateEvent('popstate'))

      await expect.poll(() => Array.length(observedDestinations)).toBe(3)
      expect(Array.last(observedDestinations)).toStrictEqual(
        Option.some('/counters/counter-1/delete'),
      )
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
      container.remove()
      window.history.replaceState({}, '', '/counters')
    }
  })

  it('preserves an invalid boot carrier without enqueuing a Message', async () => {
    window.history.replaceState({}, '', '/missing')
    const container = document.createElement('div')
    container.id = 'invalid-carrier-client'
    document.body.append(container)
    const observedDestinations: Array<string> = []
    const application = Runtime.makeFoldkitApplication({
      container,
      onModel: model => {
        observedDestinations.push(navigationToPath(model.navigation))
      },
      program: MultipleCountersProgram,
      resources: StaticCounterFactClient,
      view: makeView(),
    })
    const fiber = Effect.runFork(application.start())

    try {
      await expect
        .poll(
          () =>
            document.getElementById('multiple-counters-client-resolution-error')
              ?.textContent,
        )
        .toBe('InvalidNavigationCarrierUriError')
      expect(observedDestinations).toStrictEqual(['/counters'])
      expect(window.location.pathname).toBe('/missing')
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
      container.remove()
      window.history.replaceState({}, '', '/counters')
    }
  })

  it('allocates and resolves occurrence identity at each DOM event boundary', async () => {
    window.history.replaceState({}, '', '/counters')
    const container = document.createElement('div')
    container.id = 'event-boundary-client'
    document.body.append(container)
    const occurrenceIds = ['html:boot', 'html:first-click', 'html:second-click']
    let occurrenceIndex = 0
    const application = Runtime.makeFoldkitApplication({
      container,
      program: MultipleCountersProgram,
      resources: StaticCounterFactClient,
      view: makeView({
        nextOccurrenceId: () => {
          const maybeOccurrenceId = Array.get(occurrenceIds, occurrenceIndex)
          occurrenceIndex += 1
          if (Option.isNone(maybeOccurrenceId)) {
            throw new Error('Missing deterministic occurrence identity')
          }
          return maybeOccurrenceId.value
        },
      }),
    })
    const fiber = Effect.runFork(application.start())

    try {
      await expect
        .poll(() => document.body.textContent)
        .toContain('Add counter')
      await expect.poll(() => occurrenceIndex).toBe(1)
      const firstAddButton = Array.findFirst(
        document.body.querySelectorAll('button'),
        button => button.textContent === 'Add counter',
      )
      if (Option.isNone(firstAddButton)) {
        throw new Error('Missing first Add counter button')
      }
      firstAddButton.value.click()
      await expect.poll(() => occurrenceIndex).toBe(2)
      await expect
        .poll(() => document.body.textContent)
        .toContain('counter-html:first-click')

      const secondAddButton = Array.findFirst(
        document.body.querySelectorAll('button'),
        button => button.textContent === 'Add counter',
      )
      if (Option.isNone(secondAddButton)) {
        throw new Error('Missing second Add counter button')
      }
      secondAddButton.value.click()
      await expect
        .poll(() => document.body.textContent)
        .toContain('counter-html:second-click')
      expect(occurrenceIndex).toBe(3)
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
      container.remove()
      window.history.replaceState({}, '', '/counters')
    }
  })
})
