import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  CounterDetail,
  type CounterDetailMode,
  CounterFactAlert,
  CounterList,
  DeleteCounterConfirmation,
  LoadingCounterFact,
  type Navigation,
} from './model.js'
import {
  DismissCounterFactAlert,
  DismissDeleteConfirmation,
  type NavInstruction,
  type Navigator,
  PopCounterDetail,
  PresentCounterFactAlert,
  PresentDeleteConfirmation,
  PushCounterDetail,
  applyNavigatorInstructions,
  navigatorInstructions,
} from './navigatorInstructions.js'

const counterId = 'counter-a1'
const otherCounterId = 'counter-b2'
const detailId = 'detail-1'

const list = (): Navigation => CounterList.make({})

const plainDetail = (): Navigation =>
  CounterDetail.make({
    counterId,
    maybeMode: Option.none(),
    presentationId: detailId,
  })

const detailWith = (mode: CounterDetailMode): Navigation =>
  CounterDetail.make({
    counterId,
    maybeMode: Option.some(mode),
    presentationId: detailId,
  })

const factAlert = (): CounterDetailMode =>
  CounterFactAlert.make({
    detailPresentationId: detailId,
    requestId: 'fact-r1',
    status: LoadingCounterFact.make({}),
  })

const deleteConfirmation = (): CounterDetailMode =>
  DeleteCounterConfirmation.make({
    confirmationId: 'delete-r1',
    detailPresentationId: detailId,
  })

const tagsOf = (
  instructions: ReadonlyArray<NavInstruction>,
): ReadonlyArray<string> => instructions.map(instruction => instruction._tag)

describe('navigatorInstructions', () => {
  it('yields none when navigation is unchanged', () => {
    expect(tagsOf(navigatorInstructions(list(), list()))).toEqual([])
    expect(tagsOf(navigatorInstructions(plainDetail(), plainDetail()))).toEqual(
      [],
    )
  })

  it('pushes a detail from the list', () => {
    expect(navigatorInstructions(list(), plainDetail())).toEqual([
      PushCounterDetail.make({ counterId }),
    ])
  })

  it('pops back to the list from a plain detail', () => {
    expect(navigatorInstructions(plainDetail(), list())).toEqual([
      PopCounterDetail.make({}),
    ])
  })

  it('dismisses an open mode before popping to the list', () => {
    expect(navigatorInstructions(detailWith(factAlert()), list())).toEqual([
      DismissCounterFactAlert.make({}),
      PopCounterDetail.make({}),
    ])
  })

  it('presents the fact alert over detail', () => {
    expect(
      navigatorInstructions(plainDetail(), detailWith(factAlert())),
    ).toEqual([PresentCounterFactAlert.make({ counterId })])
  })

  it('dismisses the fact alert back to plain detail', () => {
    expect(
      navigatorInstructions(detailWith(factAlert()), plainDetail()),
    ).toEqual([DismissCounterFactAlert.make({})])
  })

  it('presents the delete confirmation over detail', () => {
    expect(
      navigatorInstructions(plainDetail(), detailWith(deleteConfirmation())),
    ).toEqual([PresentDeleteConfirmation.make({ counterId })])
  })

  it('swaps modes dismiss then present', () => {
    expect(
      navigatorInstructions(
        detailWith(factAlert()),
        detailWith(deleteConfirmation()),
      ),
    ).toEqual([
      DismissCounterFactAlert.make({}),
      PresentDeleteConfirmation.make({ counterId }),
    ])
    expect(
      navigatorInstructions(
        detailWith(deleteConfirmation()),
        detailWith(factAlert()),
      ),
    ).toEqual([
      DismissDeleteConfirmation.make({}),
      PresentCounterFactAlert.make({ counterId }),
    ])
  })

  it('pops then pushes across different counters', () => {
    const next = CounterDetail.make({
      counterId: otherCounterId,
      maybeMode: Option.none(),
      presentationId: 'detail-2',
    })
    expect(navigatorInstructions(plainDetail(), next)).toEqual([
      PopCounterDetail.make({}),
      PushCounterDetail.make({ counterId: otherCounterId }),
    ])
  })
})

describe('applyNavigatorInstructions', () => {
  const record = (): Navigator & { readonly calls: ReadonlyArray<string> } => {
    const calls: Array<string> = []
    return {
      calls,
      push: path => {
        calls.push(`push ${path}`)
      },
      pop: () => {
        calls.push('pop')
      },
      present: path => {
        calls.push(`present ${path}`)
      },
      dismiss: () => {
        calls.push('dismiss')
      },
    }
  }

  it('drives push, present, dismiss, and pop with printed paths', () => {
    const navigator = record()
    applyNavigatorInstructions(navigator, [
      PushCounterDetail.make({ counterId }),
      PresentCounterFactAlert.make({ counterId }),
      DismissCounterFactAlert.make({}),
      PopCounterDetail.make({}),
    ])
    expect(navigator.calls).toEqual([
      `push /counters/${counterId}`,
      `present /counters/${counterId}/fact`,
      'dismiss',
      'pop',
    ])
  })

  it('prints the delete route for delete presentations', () => {
    const navigator = record()
    applyNavigatorInstructions(navigator, [
      PresentDeleteConfirmation.make({ counterId }),
      DismissDeleteConfirmation.make({}),
    ])
    expect(navigator.calls).toEqual([
      `present /counters/${counterId}/delete`,
      'dismiss',
    ])
  })
})
