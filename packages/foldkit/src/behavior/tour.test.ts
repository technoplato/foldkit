import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import * as Layers from './layers.js'
import { Device, Synced } from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'
import * as Tour from './tour.js'

const sampleSteps: ReadonlyArray<Tour.TourStep> = [
  {
    id: 'welcome',
    title: 'Welcome',
    description: 'Start the guided tour.',
    targetRect: { left: 100, top: 80, width: 120, height: 40 },
    preferredSide: 'Below',
    isSkippable: true,
  },
  {
    id: 'controls',
    title: 'Controls',
    description: 'Adjust your settings here.',
    targetRect: { left: 300, top: 400, width: 160, height: 36 },
    preferredSide: 'Above',
    isSkippable: false,
  },
  {
    id: 'finish',
    title: 'All set',
    description: 'Enjoy the workspace.',
  },
]

const baseProps: Tour.Props = {
  id: 'onboarding',
  steps: sampleSteps,
  spotlightPaddingPx: 12,
  placement: { gapPx: 8, edgePx: 8 },
}

const fold = (
  messages: ReadonlyArray<Tour.Message>,
  props: Tour.Props = baseProps,
  from: Tour.State = Tour.initial,
): Tour.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => Tour.chart.transition(state, message, props)[0],
  )

describe('core Tour Part', () => {
  describe('declaration, chart integrity, IDs, sync table, and schema round-trip', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(Tour.part)).toEqual([])
      expect(Part.problemsOf(Tour.make({ name: 'GuideTour' }))).toEqual([])
      expect(Part.problemsOf(Tour.deviceOnly())).toEqual([])
      expect(Part.problemsOf(Tour.make({ sync: 'OwnView' }))).toEqual([])
      expect(Block.problemsOf({ name: 'Tour', chart: Tour.chart })).toEqual([])

      for (const action of Tour.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })

    it('derives element IDs and sync tables', () => {
      expect(Tour.backdropId('onboarding')).toBe('onboarding-backdrop')
      expect(Tour.spotlightId('onboarding')).toBe('onboarding-spotlight')
      expect(Tour.contentId('onboarding')).toBe('onboarding-content')
      expect(Tour.titleId('onboarding')).toBe('onboarding-title')
      expect(Tour.descriptionId('onboarding')).toBe('onboarding-description')
      expect(Tour.nextButtonId('onboarding')).toBe('onboarding-next')
      expect(Tour.prevButtonId('onboarding')).toBe('onboarding-prev')
      expect(Tour.skipButtonId('onboarding')).toBe('onboarding-skip')
      expect(Tour.closeButtonId('onboarding')).toBe('onboarding-close')

      expect(Tour.synced.StartTour).toEqual(Synced())
      expect(Tour.synced.NextStep).toEqual(Synced())
      expect(Tour.deviceSync('OwnView').StartTour).toEqual(
        Device({ because: 'OwnView' }),
      )
    })

    it('round-trips Idle and Running states through Effect Schema JSON encoding', () => {
      const running = fold([Tour.StartTour(), Tour.NextStep()])
      const skipped = fold([Tour.StartTour(), Tour.SkipTour()])
      for (const state of [Tour.initial, running, skipped]) {
        const encoded = S.encodeUnknownSync(Tour.State)(state)
        const decoded = S.decodeUnknownSync(Tour.State)(encoded)
        expect(decoded).toEqual(state)
      }
    })
  })

  describe('step navigation, spotlight geometry, Placement, progress, and Layers dismissal', () => {
    it('steps forward/backward/GoToStep, finishes on last NextStep, and computes progressOf', () => {
      expect(Tour.isIdle(Tour.initial)).toBe(true)
      expect(Tour.progressOf(Tour.initial, baseProps)).toBe(0)

      const step0 = fold([Tour.StartTour()])
      expect(Tour.isRunning(step0)).toBe(true)
      expect(Tour.stepIndexOf(step0, baseProps)).toEqual(Option.some(0))
      expect(Tour.isFirstStep(step0, baseProps)).toBe(true)
      expect(Tour.hasPrevStep(step0, baseProps)).toBe(false)
      expect(Tour.hasNextStep(step0, baseProps)).toBe(true)
      expect(Tour.progressOf(step0, baseProps)).toBeCloseTo(1 / 3)

      // NextStep advances to step 1 (non-skippable)
      const step1 = fold([Tour.NextStep()], baseProps, step0)
      expect(Tour.stepIndexOf(step1, baseProps)).toEqual(Option.some(1))
      expect(Tour.isCurrentStepSkippable(step1, baseProps)).toBe(false)
      expect(Tour.progressOf(step1, baseProps)).toBeCloseTo(2 / 3)

      // SkipTour is ignored on non-skippable step 1
      const stillStep1 = fold([Tour.SkipTour()], baseProps, step1)
      expect(Tour.isRunning(stillStep1)).toBe(true)

      // GoToStep jumps to last step, and NextStep completes the tour
      const step2 = fold([Tour.GoToStep({ stepIndex: 2 })], baseProps, step1)
      expect(Tour.isLastStep(step2, baseProps)).toBe(true)
      expect(Tour.progressOf(step2, baseProps)).toBe(1)

      const completed = fold([Tour.NextStep()], baseProps, step2)
      expect(Tour.isIdle(completed)).toBe(true)
      expect(Tour.endedReasonOf(completed)).toEqual(Option.some('Completed'))

      // PrevStep moves back from step 2 -> step 1
      const backTo1 = fold([Tour.PrevStep()], baseProps, step2)
      expect(Tour.stepIndexOf(backTo1, baseProps)).toEqual(Option.some(1))

      // SkipTour succeeds on skippable step 0
      const skipped = fold([Tour.SkipTour()], baseProps, step0)
      expect(Tour.isIdle(skipped)).toBe(true)
      expect(Tour.endedReasonOf(skipped)).toEqual(Option.some('Skipped'))
    })

    it('computes spotlightRectOf with padding and positions popover via placeFor respecting preferredSide', () => {
      const step0 = fold([Tour.StartTour()])
      expect(Tour.spotlightRectOf(step0, baseProps)).toEqual(
        Option.some({ left: 88, top: 68, width: 144, height: 64 }),
      )

      const placedBelow = Tour.placeFor(step0, baseProps, {
        size: { width: 240, height: 120 },
        view: { width: 1024, height: 768 },
      })
      expect(placedBelow.side).toBe('Below')
      expect(placedBelow.top).toBe(68 + 64 + 8)

      // Step 1 prefers Above and has room above top (400 - 12 = 388)
      const step1 = fold([Tour.NextStep()], baseProps, step0)
      const placedAbove = Tour.placeFor(step1, baseProps, {
        size: { width: 240, height: 120 },
        view: { width: 1024, height: 768 },
      })
      expect(placedAbove.side).toBe('Above')
      expect(placedAbove.top).toBe(400 - 12 - 8 - 120)

      // Step 2 has no targetRect -> spotlight is None and popover centers
      const step2 = fold([Tour.NextStep()], baseProps, step1)
      expect(Tour.spotlightRectOf(step2, baseProps)).toEqual(Option.none())
      const centered = Tour.placeFor(step2, baseProps, {
        size: { width: 240, height: 120 },
        view: { width: 1000, height: 600 },
      })
      expect(centered.left).toBe(380)
      expect(centered.top).toBe(240)
    })

    it('handles ArrowRight/ArrowLeft/Escape honoring Layers stack order and atRest', () => {
      const running = fold([Tour.StartTour()])

      const arrowRight = fold(
        [Tour.PressedTourKey({ key: 'ArrowRight' })],
        baseProps,
        running,
      )
      expect(Tour.stepIndexOf(arrowRight, baseProps)).toEqual(Option.some(1))

      const arrowLeft = fold(
        [Tour.PressedTourKey({ key: 'ArrowLeft' })],
        baseProps,
        arrowRight,
      )
      expect(Tour.stepIndexOf(arrowLeft, baseProps)).toEqual(Option.some(0))

      // Buried beneath another layer: Escape and outside press are ignored
      const buriedProps: Tour.Props = {
        ...baseProps,
        layers: [
          Layers.layer('onboarding', { isModal: true }),
          Layers.layer('confirm-menu'),
        ],
      }
      expect(
        Tour.isRunning(
          fold(
            [Tour.PressedTourKey({ key: 'Escape' })],
            buriedProps,
            arrowLeft,
          ),
        ),
      ).toBe(true)
      expect(
        Tour.isRunning(
          fold(
            [Tour.PressedOutsideTour({ insideIds: [] })],
            buriedProps,
            arrowLeft,
          ),
        ),
      ).toBe(true)

      // Topmost layer: Escape dismisses
      const dismissed = fold(
        [Tour.PressedTourKey({ key: 'Escape' })],
        baseProps,
        arrowLeft,
      )
      expect(Tour.isIdle(dismissed)).toBe(true)
      expect(Tour.endedReasonOf(dismissed)).toEqual(Option.some('Dismissed'))

      // atRest resets to initial Idle
      expect(Tour.atRest(arrowRight)).toEqual(Tour.initial)
    })
  })

  describe('slot projections, reference stability, and Part.compose sync durability', () => {
    it('projects all 9 slots with reference stability across unchanged renders', () => {
      const idleView1 = Part.view(Tour.part, Tour.initial, baseProps)
      const idleView2 = Part.view(Tour.part, Tour.initial, baseProps)
      expect(idleView1).toBe(idleView2)
      expect(Slot.ariaOf(idleView1.slot('Content'))['hidden']).toBe('')
      expect(Slot.ariaOf(idleView1.slot('Backdrop'))['hidden']).toBe('')
      expect(Slot.ariaOf(idleView1.slot('Spotlight'))['hidden']).toBe('')

      const step0 = fold([Tour.StartTour()])
      const view0 = Part.view(Tour.part, step0, baseProps)
      const titleSlot = view0.slot('Title')
      const descSlot = view0.slot('Description')
      expect(Slot.ariaOf(view0.slot('Content'))).toMatchObject({
        role: 'dialog',
        id: 'onboarding-content',
        'aria-modal': 'true',
        'aria-live': 'polite',
        'aria-atomic': 'true',
        'aria-labelledby': 'onboarding-title',
        'aria-describedby': 'onboarding-description',
      })
      expect(Slot.ariaOf(view0.slot('Content'))['hidden']).toBeUndefined()
      expect(Slot.ariaOf(view0.slot('Spotlight'))['hidden']).toBeUndefined()
      expect(Slot.ariaOf(view0.slot('PrevButton'))['aria-disabled']).toBe(
        'true',
      )
      expect(Slot.ariaOf(view0.slot('NextButton'))['aria-label']).toBe(
        'Next step',
      )
      expect(Slot.ariaOf(view0.slot('SkipButton'))['hidden']).toBeUndefined()
      expect(Slot.ariaOf(view0.slot('CloseButton'))['aria-disabled']).toBe(
        'false',
      )

      // Advancing to step 1 keeps Title and Description reference-stable and hides SkipButton
      const step1 = fold([Tour.NextStep()], baseProps, step0)
      const view1 = Part.view(Tour.part, step1, baseProps)
      expect(view1.slot('Title')).toBe(titleSlot)
      expect(view1.slot('Description')).toBe(descSlot)
      expect(Slot.ariaOf(view1.slot('PrevButton'))['aria-disabled']).toBe(
        'false',
      )
      expect(Slot.ariaOf(view1.slot('SkipButton'))['hidden']).toBe('')

      // Step 2 (final, no targetRect): NextButton says Finish tour, Spotlight hidden
      const step2 = fold([Tour.NextStep()], baseProps, step1)
      const view2 = Part.view(Tour.part, step2, baseProps)
      expect(Slot.ariaOf(view2.slot('NextButton'))['aria-label']).toBe(
        'Finish tour',
      )
      expect(Slot.ariaOf(view2.slot('Spotlight'))['hidden']).toBe('')
    })

    it('syncs by default in Part.compose and omits state when deviceOnly', () => {
      const HostModel = S.Struct({ count: S.Number })
      const HostMsg = S.Struct({ _tag: S.Literal('Tick') })
      const Base = makeProgram({
        id: 'tour-sync-test',
        version: 1,
        Model: HostModel,
        Message: HostMsg,
        init: () => [{ count: 0 }, []],
        update: (model: typeof HostModel.Type) => [model, []],
      })

      const SyncedApp = Part.compose({
        of: Base,
        parts: [Part.given(Tour.part, () => baseProps)],
      })
      const [initSynced] = SyncedApp.init()
      const [runningSynced] = SyncedApp.update(initSynced, Tour.StartTour())
      expect(SyncedApp.synchronization?.messageCategory(Tour.StartTour())).toBe(
        'Navigation',
      )
      const encodedSynced = S.encodeUnknownSync(SyncedApp.Model)(runningSynced)
      expect(encodedSynced).toHaveProperty('parts.Tour._tag', 'Running')

      const LocalApp = Part.compose({
        of: Base,
        parts: [Part.given(Tour.deviceOnly(), () => baseProps)],
      })
      const [initLocal] = LocalApp.init()
      const [runningLocal] = LocalApp.update(initLocal, Tour.StartTour())
      const encodedLocal = S.encodeUnknownSync(LocalApp.Model)(runningLocal)
      expect(encodedLocal).not.toHaveProperty('parts')
    })
  })
})
