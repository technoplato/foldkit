import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make } from '../program/program.js'
import * as Block from './block.js'
import * as Pace from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'
import * as Steps from './steps.js'

const baseProps: Steps.Props = {
  id: 'checkout',
  count: 3,
  orientation: 'Horizontal',
  items: [{ label: 'Shipping' }, { label: 'Payment' }, { label: 'Review' }],
}

const step = (
  state: Steps.State,
  message: Steps.Message,
  props: Steps.Props = baseProps,
): Steps.State => Steps.chart.transition(state, message, props)[0]

describe('Steps Part', () => {
  it('passes Block.problemsOf, Part.problemsOf, and Declaration checks with zero issues', () => {
    expect(Block.problemsOf({ name: 'Steps', chart: Steps.chart })).toEqual([])
    expect(Part.problemsOf(Steps.part)).toEqual([])
    expect(Part.problemsOf(Steps.make({ count: 4, defaultStep: 1 }))).toEqual(
      [],
    )
    expect(Part.problemsOf(Steps.deviceOnly())).toEqual([])

    Steps.actions.forEach(action => {
      const declaration = Catalog.declarationOf(action)
      expect(Declaration.problemsOf(declaration)).toEqual([])
      expect(Declaration.clientWordsOf(declaration)).toEqual([])
    })
  })

  it('derives element IDs, step status, percentages, and boundary readings', () => {
    expect(Steps.rootId('checkout')).toBe('checkout-root')
    expect(Steps.triggerId('checkout', 1)).toBe('checkout-trigger-1')
    expect(Steps.contentId('checkout', 1)).toBe('checkout-content-1')
    expect(Steps.nextButtonId('checkout')).toBe('checkout-next')
    expect(Steps.prevButtonId('checkout')).toBe('checkout-prev')

    const s0 = Steps.initialSteps(4, 0)
    expect(Steps.stepStatusOf(s0, 0)).toBe('Current')
    expect(Steps.stepStatusOf(s0, 1)).toBe('Incomplete')
    expect(Steps.percentOf(s0)).toBe(0)
    expect(Steps.isFirstStep(s0)).toBe(true)
    expect(Steps.isLastStep(s0)).toBe(false)
    expect(Steps.isCompleted(s0)).toBe(false)

    const s2 = Steps.initialSteps(4, 2)
    expect(Steps.stepStatusOf(s2, 0)).toBe('Complete')
    expect(Steps.stepStatusOf(s2, 1)).toBe('Complete')
    expect(Steps.stepStatusOf(s2, 2)).toBe('Current')
    expect(Steps.stepStatusOf(s2, 3)).toBe('Incomplete')
    expect(Steps.percentOf(s2)).toBe(50)
    expect(Steps.isFirstStep(s2)).toBe(false)
    expect(Steps.isLastStep(s2)).toBe(false)
    expect(Steps.isCompleted(s2)).toBe(false)

    const s3 = Steps.initialSteps(4, 3)
    expect(Steps.isLastStep(s3)).toBe(true)
    expect(Steps.isCompleted(s3)).toBe(false)
    expect(Steps.percentOf(s3)).toBe(75)

    const done = Steps.initialSteps(4, 4)
    expect(Steps.stepStatusOf(done, 3)).toBe('Complete')
    expect(Steps.isLastStep(done)).toBe(false)
    expect(Steps.isCompleted(done)).toBe(true)
    expect(Steps.percentOf(done)).toBe(100)
  })

  it('navigates with next, prev, goToStep, and reset in non-linear mode', () => {
    const start = Steps.initialSteps(3)
    const jumped = Steps.goToStep(start, 2, baseProps)
    expect(jumped).toEqual(Steps.Active({ step: 2, count: 3 }))

    const completed = Steps.next(jumped, baseProps)
    expect(completed).toEqual(Steps.Active({ step: 3, count: 3 }))
    expect(Steps.isCompleted(completed)).toBe(true)

    const clampedNext = Steps.next(completed, baseProps)
    expect(clampedNext).toEqual(completed)

    const back = Steps.prev(completed, baseProps)
    expect(back).toEqual(Steps.Active({ step: 2, count: 3 }))

    const resetState = Steps.reset(back, baseProps)
    expect(resetState).toEqual(Steps.Active({ step: 0, count: 3 }))

    const clampedPrev = Steps.prev(resetState, baseProps)
    expect(clampedPrev).toEqual(resetState)
  })

  it('enforces linear progression, step validation, skippability, and disabled guards', () => {
    const linearProps: Steps.Props = { ...baseProps, linear: true }
    const s0 = Steps.initialSteps(3, 0)

    // Skipping ahead past step 1 is blocked in linear mode
    expect(step(s0, Steps.GoToStep({ step: 2 }), linearProps)).toEqual(s0)
    // Advancing one step is permitted
    const s1 = step(s0, Steps.GoToStep({ step: 1 }), linearProps)
    expect(s1.step).toBe(1)
    // Moving backward is always allowed
    expect(step(s1, Steps.GoToStep({ step: 0 }), linearProps).step).toBe(0)

    // Invalid current step blocks forward progression unless skippable
    const invalidProps: Steps.Props = {
      ...baseProps,
      items: [
        { label: 'Shipping', isValid: false },
        { label: 'Payment', isValid: false, isSkippable: true },
        { label: 'Review' },
      ],
    }
    expect(step(s0, Steps.NextStep(), invalidProps)).toEqual(s0)
    expect(step(s0, Steps.GoToStep({ step: 2 }), invalidProps)).toEqual(s0)
    // Step 1 is skippable despite isValid: false
    expect(step(s1, Steps.NextStep(), invalidProps).step).toBe(2)

    // Disabled root blocks all transitions
    const disabledProps: Steps.Props = { ...baseProps, isDisabled: true }
    expect(step(s0, Steps.NextStep(), disabledProps)).toEqual(s0)
    expect(step(s1, Steps.PrevStep(), disabledProps)).toEqual(s1)
    expect(step(s1, Steps.ResetSteps(), disabledProps)).toEqual(s1)
  })

  it('projects reference-stable SlotBindings and WAI-ARIA for all five slots', () => {
    const state = Steps.initialSteps(3, 1)
    const verticalProps: Steps.Props = { ...baseProps, orientation: 'Vertical' }
    const view1 = Part.view(Steps.part, state, verticalProps)
    const view2 = Part.view(Steps.part, state, verticalProps)
    expect(view1).toBe(view2)

    const rootAria = Slot.ariaOf(view1.slot('Root'))
    expect(rootAria['id']).toBe('checkout-root')
    expect(rootAria['role']).toBe('group')
    expect(rootAria['aria-orientation']).toBe('vertical')

    const trigger0 = view1.slot('Trigger', '0')
    const trigger1 = view1.slot('Trigger', '1')
    const trigger2 = view1.slot('Trigger', '2')
    expect(Slot.ariaOf(trigger0)['aria-current']).toBe('false')
    expect(Slot.ariaOf(trigger1)['aria-current']).toBe('true')
    expect(Slot.ariaOf(trigger1)['aria-selected']).toBe('true')
    expect(Slot.ariaOf(trigger1)['aria-controls']).toBe('checkout-content-1')
    expect(Slot.ariaOf(trigger2)['aria-current']).toBe('false')

    expect(Slot.ariaOf(view1.slot('Content', '0'))['hidden']).toBe('')
    expect(Slot.ariaOf(view1.slot('Content', '1'))['hidden']).toBeUndefined()
    expect(Slot.ariaOf(view1.slot('Content', '1'))['aria-labelledby']).toBe(
      'checkout-trigger-1',
    )

    expect(Slot.ariaOf(view1.slot('NextButton'))['aria-disabled']).toBe('false')
    expect(Slot.ariaOf(view1.slot('PrevButton'))['aria-disabled']).toBe('false')

    // Moving from step 1 to step 2 preserves unchanged slot 0 binding by reference
    const nextState = step(state, Steps.NextStep(), verticalProps)
    const nextView = Part.view(Steps.part, nextState, verticalProps)
    expect(nextView.slot('Trigger', '0')).toBe(trigger0)
    expect(nextView.slot('Trigger', '2')).not.toBe(trigger2)
    expect(Slot.ariaOf(nextView.slot('Trigger', '2'))['aria-current']).toBe(
      'true',
    )
  })

  it('composes into a Program with Navigation sync, atRest, and deviceOnly support', () => {
    const Base = make({
      id: 'steps-test',
      version: 1,
      Model: S.Struct({ ready: S.Boolean }),
      Message: S.Union([
        Catalog.action('Ping', {
          what: 'Pings',
          why: 'To verify',
          meta: { label: 'Ping', keys: [] },
        }),
      ]),
      init: () => [{ ready: true }, []],
      update: model => [model, []],
    })

    const SyncedApp = Part.compose({
      of: Base,
      parts: [Part.given(Steps.make({ count: 3 }), () => baseProps)],
    })
    const [initialModel] = SyncedApp.init()
    expect(SyncedApp.synchronization?.messageCategory(Steps.NextStep())).toBe(
      'Navigation',
    )
    expect(SyncedApp.synchronization?.paceOf?.(Steps.NextStep())).toEqual(
      Pace.Synced(),
    )
    expect(Steps.atRest(Steps.initialSteps(3, 2))).toEqual(
      Steps.Active({ step: 2, count: 3 }),
    )
    expect(initialModel.parts['Steps']).toEqual(
      Steps.Active({ step: 0, count: 3 }),
    )

    const LocalApp = Part.compose({
      of: Base,
      parts: [Part.given(Steps.deviceOnly({ count: 3 }), () => baseProps)],
    })
    expect(LocalApp.synchronization?.isLocalOnly?.(Steps.NextStep())).toBe(true)
    const [localModel] = LocalApp.init()
    expect(S.encodeSync(LocalApp.Model)(localModel)).toEqual({ ready: true })
    expect(Option.some(localModel)).toBeDefined()
  })
})
