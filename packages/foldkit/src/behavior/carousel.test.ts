import {
  Array,
  Duration,
  Effect,
  Fiber,
  Option,
  Ref,
  Schema as S,
} from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import * as Carousel from './carousel.js'
import { Device, Sampled, Synced } from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'

const baseProps: Carousel.Props = {
  id: 'hero',
  slideCount: 4,
  slidesPerPage: 1,
  slidesPerMove: 1,
  loop: false,
  orientation: 'Horizontal',
  autoplayIntervalMs: 3000,
  allowMouseDrag: true,
  swipeThresholdPx: 50,
}

const fold = (
  messages: ReadonlyArray<Carousel.Message>,
  props: Carousel.Props = baseProps,
  from: Carousel.State = Carousel.initial,
): Carousel.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => Carousel.chart.transition(state, message, props)[0],
  )

describe('core Carousel Part', () => {
  describe('declaration, chart integrity, IDs, sync paces, and schema round-trip', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(Carousel.part)).toEqual([])
      expect(Part.problemsOf(Carousel.make({ sampleMs: 100 }))).toEqual([])
      expect(Part.problemsOf(Carousel.deviceOnly())).toEqual([])
      expect(Part.problemsOf(Carousel.make({ sync: 'OwnView' }))).toEqual([])
      expect(
        Block.problemsOf({ name: 'Carousel', chart: Carousel.chart }),
      ).toEqual([])

      for (const action of Carousel.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })

    it('derives element IDs, paging geometry, and Pace.Sampled drag sync table', () => {
      expect(Carousel.rootId('hero')).toBe('hero-root')
      expect(Carousel.viewportId('hero')).toBe('hero-viewport')
      expect(Carousel.slideId('hero', 2)).toBe('hero-slide-2')
      expect(Carousel.prevButtonId('hero')).toBe('hero-prev')
      expect(Carousel.nextButtonId('hero')).toBe('hero-next')
      expect(Carousel.indicatorId('hero', 1)).toBe('hero-indicator-1')
      expect(Carousel.autoplayTriggerId('hero')).toBe('hero-autoplay')

      expect(
        Carousel.pageSnapPointsOf({
          slideCount: 6,
          slidesPerPage: 2,
          slidesPerMove: 2,
        }),
      ).toEqual([0, 2, 4])
      expect(
        Carousel.pageCountOf({
          slideCount: 6,
          slidesPerPage: 2,
          slidesPerMove: 'Auto',
        }),
      ).toBe(3)
      expect(
        Carousel.pageSnapPointsOf({
          slideCount: 5,
          slidesPerPage: 3,
          slidesPerMove: 1,
        }),
      ).toEqual([0, 1, 2])

      expect(Carousel.synced.MoveCarouselDrag).toEqual(Sampled({ everyMs: 50 }))
      expect(Carousel.synced.NextSlide).toEqual(Synced())
      expect(Carousel.synced.ReleaseCarouselDrag).toEqual(Synced())
      expect(
        Carousel.paceOf(
          Carousel.MoveCarouselDrag({ pointerId: 1, x: 40, y: 0 }),
          80,
        ),
      ).toEqual(Sampled({ everyMs: 80 }))
      expect(Carousel.deviceSync('OwnView').MoveCarouselDrag).toEqual(
        Device({ because: 'OwnView' }),
      )
    })

    it('round-trips Idle, Autoplaying, and Dragging states through Effect Schema JSON encoding', () => {
      const [playing] = Carousel.chart.transition(
        Carousel.initial,
        Carousel.PlayCarousel(),
        baseProps,
      )
      const dragging = fold([
        Carousel.BeginCarouselDrag({ pointerId: 1, x: 200, y: 0 }),
        Carousel.MoveCarouselDrag({ pointerId: 1, x: 140, y: 0 }),
      ])
      for (const state of [Carousel.initial, playing, dragging]) {
        const encoded = S.encodeUnknownSync(Carousel.State)(state)
        const decoded = S.decodeUnknownSync(Carousel.State)(encoded)
        expect(decoded).toEqual(state)
      }
    })
  })

  describe('paging, loop, keyboard, and swipe dragging', () => {
    it('steps pages with NextSlide/PrevSlide/GoToSlide and honors loop boundaries', () => {
      expect(Carousel.canPrev(Carousel.initial, baseProps)).toBe(false)
      expect(Carousel.canNext(Carousel.initial, baseProps)).toBe(true)

      const atLast = fold([Carousel.GoToSlide({ page: 99 })])
      expect(Carousel.pageOf(atLast, baseProps)).toBe(3)
      expect(Carousel.canNext(atLast, baseProps)).toBe(false)
      expect(Carousel.canPrev(atLast, baseProps)).toBe(true)

      const stillLast = fold([Carousel.NextSlide()], baseProps, atLast)
      expect(Carousel.pageOf(stillLast, baseProps)).toBe(3)

      const loopProps: Carousel.Props = { ...baseProps, loop: true }
      expect(Carousel.canPrev(Carousel.initial, loopProps)).toBe(true)
      const wrappedPrev = fold([Carousel.PrevSlide()], loopProps)
      expect(Carousel.pageOf(wrappedPrev, loopProps)).toBe(3)
      const wrappedNext = fold([Carousel.NextSlide()], loopProps, wrappedPrev)
      expect(Carousel.pageOf(wrappedNext, loopProps)).toBe(0)
    })

    it('supports multi-slide pages, visible slide ranges, and keyboard navigation', () => {
      const multiProps: Carousel.Props = {
        ...baseProps,
        slideCount: 6,
        slidesPerPage: 2,
        slidesPerMove: 2,
      }
      expect(
        Carousel.visibleSlideIndicesOf(Carousel.initial, multiProps),
      ).toEqual([0, 1])
      expect(Carousel.isSlideInView(Carousel.initial, multiProps, 1)).toBe(true)
      expect(Carousel.isSlideInView(Carousel.initial, multiProps, 2)).toBe(
        false,
      )

      const movedRight = fold(
        [Carousel.PressedCarouselKey({ key: 'ArrowRight' })],
        multiProps,
      )
      expect(Carousel.pageOf(movedRight, multiProps)).toBe(1)
      expect(Carousel.visibleSlideIndicesOf(movedRight, multiProps)).toEqual([
        2, 3,
      ])

      const atEnd = fold(
        [Carousel.PressedCarouselKey({ key: 'End' })],
        multiProps,
        movedRight,
      )
      expect(Carousel.pageOf(atEnd, multiProps)).toBe(2)

      const atHome = fold(
        [Carousel.PressedCarouselKey({ key: 'Home' })],
        multiProps,
        atEnd,
      )
      expect(Carousel.pageOf(atHome, multiProps)).toBe(0)

      // Vertical orientation maps ArrowDown/ArrowUp
      const verticalProps: Carousel.Props = {
        ...baseProps,
        orientation: 'Vertical',
      }
      const down = fold(
        [Carousel.PressedCarouselKey({ key: 'ArrowDown' })],
        verticalProps,
      )
      expect(Carousel.pageOf(down, verticalProps)).toBe(1)
    })

    it('advances/retreats on swipe past threshold, enforces allowMouseDrag, and cancels on Escape', () => {
      // Mouse drag blocked when allowMouseDrag is false
      const noMouseProps: Carousel.Props = {
        ...baseProps,
        allowMouseDrag: false,
      }
      const blockedMouse = fold(
        [
          Carousel.BeginCarouselDrag({
            pointerId: 1,
            x: 200,
            y: 0,
            pointerType: 'mouse',
          }),
        ],
        noMouseProps,
      )
      expect(Carousel.isDragging(blockedMouse)).toBe(false)

      // Touch drag still works when allowMouseDrag is false
      const touchSwiped = fold(
        [
          Carousel.BeginCarouselDrag({
            pointerId: 1,
            x: 200,
            y: 0,
            pointerType: 'touch',
          }),
          Carousel.MoveCarouselDrag({ pointerId: 1, x: 120, y: 0 }),
          Carousel.ReleaseCarouselDrag({ pointerId: 1 }),
        ],
        noMouseProps,
      )
      expect(Carousel.isDragging(touchSwiped)).toBe(false)
      expect(Carousel.pageOf(touchSwiped, noMouseProps)).toBe(1)

      // Short drag below threshold snaps back to same page
      const shortSwipe = fold(
        [
          Carousel.BeginCarouselDrag({ pointerId: 2, x: 200, y: 0 }),
          Carousel.MoveCarouselDrag({ pointerId: 2, x: 170, y: 0 }),
          Carousel.ReleaseCarouselDrag({ pointerId: 2 }),
        ],
        baseProps,
        touchSwiped,
      )
      expect(Carousel.pageOf(shortSwipe, baseProps)).toBe(1)

      // Drag right past threshold retreats to page 0
      const retreated = fold(
        [
          Carousel.BeginCarouselDrag({ pointerId: 3, x: 100, y: 0 }),
          Carousel.MoveCarouselDrag({ pointerId: 3, x: 180, y: 0 }),
          Carousel.ReleaseCarouselDrag({ pointerId: 3 }),
        ],
        baseProps,
        shortSwipe,
      )
      expect(Carousel.pageOf(retreated, baseProps)).toBe(0)

      // Escape cancels drag without changing page
      const cancelled = fold([
        Carousel.BeginCarouselDrag({ pointerId: 4, x: 200, y: 0 }),
        Carousel.MoveCarouselDrag({ pointerId: 4, x: 50, y: 0 }),
        Carousel.PressedCarouselKey({ key: 'Escape' }),
      ])
      expect(Carousel.isDragging(cancelled)).toBe(false)
      expect(Carousel.pageOf(cancelled, baseProps)).toBe(0)
    })
  })

  describe('TimedHint autoplay ticks, monotonic version guard, and pause-on-hover/interaction', () => {
    it('schedules WaitForCarouselTick, ignores stale versions, loops or stops at end, and pauses/resumes on hover', () => {
      const [playing1, cmds1] = Carousel.chart.transition(
        Carousel.initial,
        Carousel.PlayCarousel(),
        baseProps,
      )
      expect(Carousel.isAutoplaying(playing1)).toBe(true)
      const version1 = Carousel.autoplayVersionOf(playing1)
      expect(cmds1).toHaveLength(1)
      expect(Option.getOrThrow(Array.head(cmds1)).name).toBe(
        'WaitForCarouselTick',
      )

      // Stale tick is rejected
      const [afterStale, staleCmds] = Carousel.chart.transition(
        playing1,
        Carousel.ElapsedCarouselTick({ version: version1 - 1 }),
        baseProps,
      )
      expect(afterStale).toBe(playing1)
      expect(staleCmds).toEqual([])

      // Valid tick advances to page 1 and schedules next version
      const [playing2, cmds2] = Carousel.chart.transition(
        playing1,
        Carousel.ElapsedCarouselTick({ version: version1 }),
        baseProps,
      )
      expect(Carousel.pageOf(playing2, baseProps)).toBe(1)
      expect(Carousel.isAutoplaying(playing2)).toBe(true)
      const version2 = Carousel.autoplayVersionOf(playing2)
      expect(version2).toBeGreaterThan(version1)
      expect(cmds2).toHaveLength(1)

      // EnterCarousel pauses autoplay and bumps version; old tick ignored
      const [hoverPaused] = Carousel.chart.transition(
        playing2,
        Carousel.EnterCarousel(),
        baseProps,
      )
      expect(Carousel.isAutoplaying(hoverPaused)).toBe(false)
      expect(Carousel.autoplayVersionOf(hoverPaused)).toBeGreaterThan(version2)
      const [stillPaused] = Carousel.chart.transition(
        hoverPaused,
        Carousel.ElapsedCarouselTick({ version: version2 }),
        baseProps,
      )
      expect(Carousel.pageOf(stillPaused, baseProps)).toBe(1)

      // LeaveCarousel resumes autoplay with a fresh command
      const [resumed, resumeCmds] = Carousel.chart.transition(
        hoverPaused,
        Carousel.LeaveCarousel(),
        baseProps,
      )
      expect(Carousel.isAutoplaying(resumed)).toBe(true)
      expect(resumeCmds).toHaveLength(1)

      // Interaction pauses autoplay when pauseOnInteraction is true
      const [interacted] = Carousel.chart.transition(
        resumed,
        Carousel.NextSlide(),
        baseProps,
      )
      expect(Carousel.isAutoplaying(interacted)).toBe(false)
      expect(Carousel.pageOf(interacted, baseProps)).toBe(2)

      // Advancing onto the final slide without loop stops cleanly in Idle
      const [playingFrom2] = Carousel.chart.transition(
        interacted,
        Carousel.PlayCarousel(),
        baseProps,
      )
      const [stoppedAtEnd, endCmds] = Carousel.chart.transition(
        playingFrom2,
        Carousel.ElapsedCarouselTick({
          version: Carousel.autoplayVersionOf(playingFrom2),
        }),
        baseProps,
      )
      expect(Carousel.pageOf(stoppedAtEnd, baseProps)).toBe(3)
      expect(Carousel.isAutoplaying(stoppedAtEnd)).toBe(false)
      expect(endCmds).toEqual([])

      // atRest preserves page and stops autoplay/drag
      const rested = Carousel.atRest(playing2)
      expect(Carousel.isIdle(rested)).toBe(true)
      expect(Carousel.pageOf(rested, baseProps)).toBe(1)
    })

    it('resolves WaitForCarouselTick via Command.answerAfter on Effect TestClock', () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const [playing, commands] = Carousel.chart.transition(
            Carousel.initial,
            Carousel.PlayCarousel(),
            baseProps,
          )
          const wait = Option.getOrThrow(Array.head(commands))
          const answered = yield* Ref.make(Array.empty<Carousel.Message>())
          const fiber = yield* Effect.forkChild(
            Effect.tap(wait.effect, message =>
              Ref.update(answered, all => [...all, message]),
            ),
          )
          yield* TestClock.adjust(Duration.millis(2999))
          expect(yield* Ref.get(answered)).toEqual([])
          yield* TestClock.adjust(Duration.millis(1))
          expect(yield* Fiber.join(fiber)).toEqual(
            Carousel.ElapsedCarouselTick({
              version: Carousel.autoplayVersionOf(playing),
            }),
          )
        }).pipe(Effect.provide(TestClock.layer())),
      ))
  })

  describe('slot projections, reference stability, and Part.compose sync durability', () => {
    it('projects all 7 slots with reference stability across unchanged renders', () => {
      const view1 = Part.view(Carousel.part, Carousel.initial, baseProps)
      const view2 = Part.view(Carousel.part, Carousel.initial, baseProps)
      expect(view1).toBe(view2)

      const rootSlot = view1.slot('Root')
      const slide2Initial = view1.slot('Slide', '2')
      expect(Slot.ariaOf(rootSlot)).toMatchObject({
        role: 'region',
        id: 'hero-root',
        'aria-label': 'Carousel',
        'aria-orientation': 'horizontal',
      })
      expect(Slot.ariaOf(view1.slot('Viewport'))['aria-live']).toBe('polite')
      expect(Slot.ariaOf(view1.slot('PrevButton'))['aria-disabled']).toBe(
        'true',
      )
      expect(Slot.ariaOf(view1.slot('NextButton'))['aria-disabled']).toBe(
        'false',
      )
      expect(Slot.ariaOf(view1.slot('Slide', '0'))['aria-current']).toBe('true')
      expect(Slot.ariaOf(slide2Initial)['hidden']).toBe('')
      expect(Slot.ariaOf(view1.slot('Indicator', '0'))['aria-current']).toBe(
        'true',
      )
      expect(Slot.ariaOf(view1.slot('AutoplayTrigger'))['aria-pressed']).toBe(
        'false',
      )

      // Advancing to page 1 keeps Root and untouched Slide 2 reference-stable
      const page1 = fold([Carousel.NextSlide()])
      const viewPage1 = Part.view(Carousel.part, page1, baseProps)
      expect(viewPage1.slot('Root')).toBe(rootSlot)
      expect(viewPage1.slot('Slide', '2')).toBe(slide2Initial)
      expect(Slot.ariaOf(viewPage1.slot('PrevButton'))['aria-disabled']).toBe(
        'false',
      )
      expect(
        Slot.ariaOf(viewPage1.slot('Indicator', '1'))['aria-current'],
      ).toBe('true')
    })

    it('syncs by default in Part.compose and omits state when deviceOnly', () => {
      const HostModel = S.Struct({ count: S.Number })
      const HostMsg = S.Struct({ _tag: S.Literal('Tick') })
      const Base = makeProgram({
        id: 'carousel-sync-test',
        version: 1,
        Model: HostModel,
        Message: HostMsg,
        init: () => [{ count: 0 }, []],
        update: (model: typeof HostModel.Type) => [model, []],
      })

      const SyncedApp = Part.compose({
        of: Base,
        parts: [Part.given(Carousel.part, () => baseProps)],
      })
      const [initSynced] = SyncedApp.init()
      const [nextSynced] = SyncedApp.update(initSynced, Carousel.NextSlide())
      expect(
        SyncedApp.synchronization?.paceOf?.(
          Carousel.MoveCarouselDrag({ pointerId: 1, x: 50, y: 0 }),
        ),
      ).toEqual(Sampled({ everyMs: 50 }))
      expect(
        SyncedApp.synchronization?.messageCategory(Carousel.NextSlide()),
      ).toBe('Navigation')
      const encodedSynced = S.encodeUnknownSync(SyncedApp.Model)(nextSynced)
      expect(encodedSynced).toHaveProperty('parts.Carousel.page', 1)

      const LocalApp = Part.compose({
        of: Base,
        parts: [Part.given(Carousel.deviceOnly(), () => baseProps)],
      })
      const [initLocal] = LocalApp.init()
      const [nextLocal] = LocalApp.update(initLocal, Carousel.NextSlide())
      const encodedLocal = S.encodeUnknownSync(LocalApp.Model)(nextLocal)
      expect(encodedLocal).not.toHaveProperty('parts')
    })
  })
})
