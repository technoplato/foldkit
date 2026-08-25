import { Equal, Option, Result } from 'effect'
import { describe, expect, it } from 'vitest'

import { init } from './init.js'
import {
  CancelledDeleteCounter,
  ClickedAddCounter,
  ClickedDeleteCounter,
  ClickedShowCounterFact,
  DismissedCounterDetail,
  DismissedCounterFactAlert,
  type Message,
  SelectedCounter,
} from './message.js'
import {
  CounterDetail,
  CounterFactAlert,
  CounterList,
  DeleteCounterConfirmation,
  LoadingCounterFact,
  type Navigation,
} from './model.js'
import { update } from './update.js'
import {
  type NavigationSkeleton,
  canonicalNavigationUri,
  navigationFromUri,
  sameAddress,
} from './uriProjection.js'

const counterId = 'counter-a1'
const detailPresentationId = 'detail-a1'

type CountersModel = ReturnType<typeof init>[0]

const send = (model: CountersModel, message: Message): CountersModel =>
  update(model, message)[0]

const navigationOf = (model: CountersModel): Navigation => model.navigation

const seeded = (): CountersModel =>
  send(init()[0], ClickedAddCounter({ counterId }))

const plainDetail = (): Navigation =>
  CounterDetail.make({
    counterId,
    maybeMode: Option.none(),
    presentationId: detailPresentationId,
  })

const factDetail = (): Navigation =>
  CounterDetail.make({
    counterId,
    maybeMode: Option.some(
      CounterFactAlert.make({
        requestId: 'fact-1',
        status: LoadingCounterFact.make({}),
      }),
    ),
    presentationId: detailPresentationId,
  })

const confirmDetail = (): Navigation =>
  CounterDetail.make({
    counterId,
    maybeMode: Option.some(
      DeleteCounterConfirmation.make({ confirmationId: 'delete-1' }),
    ),
    presentationId: detailPresentationId,
  })

describe('canonicalNavigationUri', () => {
  it('prints one stable URI per representable state', () => {
    expect(canonicalNavigationUri(CounterList.make({}))).toBe('/counters')
    expect(canonicalNavigationUri(plainDetail())).toBe(`/counters/${counterId}`)
    expect(canonicalNavigationUri(factDetail())).toBe(
      `/counters/${counterId}/fact`,
    )
    expect(canonicalNavigationUri(confirmDetail())).toBe(
      `/counters/${counterId}/delete`,
    )
  })

  it('round-trips every printed URI back to the same address', () => {
    const states: ReadonlyArray<readonly [Navigation, NavigationSkeleton]> = [
      [CounterList.make({}), { _tag: 'List' }],
      [plainDetail(), { _tag: 'Detail', counterId }],
      [factDetail(), { _tag: 'Detail', counterId }],
      [confirmDetail(), { _tag: 'Detail', counterId }],
    ]
    for (const [state, skeleton] of states) {
      const uri = canonicalNavigationUri(state)
      const reparsed = navigationFromUri(uri)
      expect(Result.isSuccess(reparsed)).toBe(true)
      if (Result.isSuccess(reparsed)) {
        expect(reparsed.success).toStrictEqual(skeleton)
      }
    }
  })

  it('rejects relative and unclaimed URIs', () => {
    const unparsed = navigationFromUri('counters')
    expect(Result.isFailure(unparsed)).toBe(true)
    if (Result.isFailure(unparsed)) {
      expect(unparsed.failure._tag).toBe('UnparseableUriError')
    }
    const unknownPath = navigationFromUri('/counters/counter-a1/unknown')
    expect(Result.isFailure(unknownPath)).toBe(true)
    if (Result.isFailure(unknownPath)) {
      expect(unknownPath.failure._tag).toBe('NonCanonicalUriError')
    }
  })

  it('compares addresses across transient identities', () => {
    const otherPresentation = CounterDetail.make({
      counterId,
      maybeMode: Option.none(),
      presentationId: 'detail-other',
    })
    expect(sameAddress(plainDetail(), otherPresentation)).toBe(true)
    expect(sameAddress(plainDetail(), CounterList.make({}))).toBe(false)
  })
})

describe('every interaction reflects to exactly one URI', () => {
  it('walks select, fact, delete, cancel, and dismiss', () => {
    let model = seeded()
    let uri = canonicalNavigationUri(navigationOf(model))
    expect(uri).toBe('/counters')

    const step = (message: Message, expectedUri: string): void => {
      const next = send(model, message)
      const nextUri = canonicalNavigationUri(navigationOf(next))
      if (Equal.equals(navigationOf(model), navigationOf(next))) {
        expect(nextUri).toBe(uri)
      } else {
        expect(nextUri).not.toBe(uri)
      }
      model = next
      uri = nextUri
      expect(uri).toBe(expectedUri)
      expect(Result.isSuccess(navigationFromUri(uri))).toBe(true)
    }

    step(
      SelectedCounter({ counterId, detailPresentationId }),
      `/counters/${counterId}`,
    )
    step(
      ClickedShowCounterFact({
        counterId,
        detailPresentationId,
        requestId: 'fact-1',
      }),
      `/counters/${counterId}/fact`,
    )
    step(
      DismissedCounterFactAlert({
        counterId,
        detailPresentationId,
        requestId: 'fact-1',
      }),
      `/counters/${counterId}`,
    )
    step(
      ClickedDeleteCounter({
        confirmationId: 'delete-1',
        counterId,
        detailPresentationId,
      }),
      `/counters/${counterId}/delete`,
    )
    step(
      CancelledDeleteCounter({
        confirmationId: 'delete-1',
        counterId,
        detailPresentationId,
      }),
      `/counters/${counterId}`,
    )
    step(
      DismissedCounterDetail({ counterId, detailPresentationId }),
      '/counters',
    )
  })
})
