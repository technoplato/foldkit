import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import * as Marquee from './marquee.js'
import { Device, Synced } from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'

const baseProps: Marquee.Props = {
  id: 'ticker',
  direction: 'Left',
  speedPxPerSec: 50,
  loopCount: 0,
  pauseOnHover: true,
  pauseOnInteraction: false,
}

const fold = (
  messages: ReadonlyArray<Marquee.Message>,
  props: Marquee.Props = baseProps,
  from: Marquee.State = Marquee.initial,
): Marquee.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => Marquee.chart.transition(state, message, props)[0],
  )

describe('core Marquee Part', () => {
  describe('declaration, chart integrity, IDs, sync table, and schema round-trip', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(Marquee.part)).toEqual([])
      expect(Part.problemsOf(Marquee.make({ name: 'NewsTicker' }))).toEqual([])
      expect(Part.problemsOf(Marquee.deviceOnly())).toEqual([])
      expect(Part.problemsOf(Marquee.make({ sync: 'OwnView' }))).toEqual([])
      expect(
        Block.problemsOf({ name: 'Marquee', chart: Marquee.chart }),
      ).toEqual([])

      for (const action of Marquee.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })

    it('derives element IDs, orientation/direction helpers, duration math, and sync tables', () => {
      expect(Marquee.rootId('ticker')).toBe('ticker-root')
      expect(Marquee.viewportId('ticker')).toBe('ticker-viewport')
      expect(Marquee.contentId('ticker', 0)).toBe('ticker-content-0')
      expect(Marquee.contentId('ticker', 1)).toBe('ticker-content-1')
      expect(Marquee.toggleButtonId('ticker')).toBe('ticker-toggle')

      expect(Marquee.orientationOf({ direction: 'Left' })).toBe('Horizontal')
      expect(Marquee.orientationOf({ direction: 'Right' })).toBe('Horizontal')
      expect(Marquee.orientationOf({ direction: 'Up' })).toBe('Vertical')
      expect(Marquee.orientationOf({ direction: 'Down' })).toBe('Vertical')
      expect(Marquee.isReversedOf({ direction: 'Left' })).toBe(false)
      expect(Marquee.isReversedOf({ direction: 'Right' })).toBe(true)
      expect(Marquee.isReversedOf({ direction: 'Down' })).toBe(true)
      expect(Marquee.durationSecOf(500, { speedPxPerSec: 50 })).toBe(10)

      expect(Marquee.synced.PauseMarquee).toEqual(Synced())
      expect(Marquee.synced.CompletedMarqueeLoop).toEqual(Synced())
      expect(Marquee.deviceSync('OwnView').PauseMarquee).toEqual(
        Device({ because: 'OwnView' }),
      )
    })

    it('round-trips Running and Paused states through Effect Schema JSON encoding', () => {
      const paused = fold([Marquee.PauseMarquee()])
      const looped = fold([Marquee.CompletedMarqueeLoop()])
      for (const state of [Marquee.initial, paused, looped]) {
        const encoded = S.encodeUnknownSync(Marquee.State)(state)
        const decoded = S.decodeUnknownSync(Marquee.State)(encoded)
        expect(decoded).toEqual(state)
      }
    })
  })

  describe('playback toggling, hover/interaction pause, finite loopCount completion, and restart', () => {
    it('pauses, resumes, toggles, and distinguishes hover pause from explicit user pause', () => {
      expect(Marquee.isRunning(Marquee.initial)).toBe(true)

      const paused = fold([Marquee.PauseMarquee()])
      expect(Marquee.isPaused(paused)).toBe(true)
      expect(Marquee.pauseReasonOf(paused)).toEqual(Option.some('User'))

      // Leaving marquee does not override an explicit User pause
      const stillUserPaused = fold([Marquee.LeftMarquee()], baseProps, paused)
      expect(Marquee.isPaused(stillUserPaused)).toBe(true)

      // Toggle resumes
      const resumed = fold(
        [Marquee.ToggleMarquee()],
        baseProps,
        stillUserPaused,
      )
      expect(Marquee.isRunning(resumed)).toBe(true)

      // EnteredMarquee pauses with reason Hover, and LeftMarquee resumes automatically
      const hoverPaused = fold([Marquee.EnteredMarquee()], baseProps, resumed)
      expect(Marquee.isPaused(hoverPaused)).toBe(true)
      expect(Marquee.pauseReasonOf(hoverPaused)).toEqual(Option.some('Hover'))

      const autoResumed = fold([Marquee.LeftMarquee()], baseProps, hoverPaused)
      expect(Marquee.isRunning(autoResumed)).toBe(true)

      // pauseOnInteraction pauses with reason Interaction when pauseOnHover is false
      const interactionProps: Marquee.Props = {
        ...baseProps,
        pauseOnHover: false,
        pauseOnInteraction: true,
      }
      const interactionPaused = fold(
        [Marquee.EnteredMarquee()],
        interactionProps,
      )
      expect(Marquee.pauseReasonOf(interactionPaused)).toEqual(
        Option.some('Interaction'),
      )
      expect(
        Marquee.isRunning(
          fold([Marquee.LeftMarquee()], interactionProps, interactionPaused),
        ),
      ).toBe(true)
    })

    it('tracks completedLoops, stops at finite loopCount, restarts cleanly, and rests paused on atRest', () => {
      const finiteProps: Marquee.Props = {
        ...baseProps,
        loopCount: 2,
      }
      expect(Marquee.isInfiniteOf(baseProps)).toBe(true)
      expect(Marquee.isInfiniteOf(finiteProps)).toBe(false)
      expect(Marquee.remainingLoopsOf(Marquee.initial, finiteProps)).toEqual(
        Option.some(2),
      )

      const loop1 = fold([Marquee.CompletedMarqueeLoop()], finiteProps)
      expect(Marquee.isRunning(loop1)).toBe(true)
      expect(Marquee.completedLoopsOf(loop1)).toBe(1)
      expect(Marquee.isFinishedOf(loop1, finiteProps)).toBe(false)

      const loop2 = fold([Marquee.CompletedMarqueeLoop()], finiteProps, loop1)
      expect(Marquee.isPaused(loop2)).toBe(true)
      expect(Marquee.pauseReasonOf(loop2)).toEqual(Option.some('Finished'))
      expect(Marquee.completedLoopsOf(loop2)).toBe(2)
      expect(Marquee.isFinishedOf(loop2, finiteProps)).toBe(true)
      expect(Marquee.remainingLoopsOf(loop2, finiteProps)).toEqual(
        Option.some(0),
      )

      // ResumeMarquee and ToggleMarquee cannot run past loopCount until RestartMarquee
      expect(
        Marquee.isPaused(fold([Marquee.ResumeMarquee()], finiteProps, loop2)),
      ).toBe(true)

      const restarted = fold([Marquee.RestartMarquee()], finiteProps, loop2)
      expect(Marquee.isRunning(restarted)).toBe(true)
      expect(Marquee.completedLoopsOf(restarted)).toBe(0)
      expect(Marquee.cycleOf(restarted)).toBe(1)
      expect(Marquee.isFinishedOf(restarted, finiteProps)).toBe(false)

      // atRest pauses while preserving completedLoops, cycle, and Finished reason
      const restedRunning = Marquee.atRest(restarted)
      expect(Marquee.isPaused(restedRunning)).toBe(true)
      expect(Marquee.cycleOf(restedRunning)).toBe(1)
      expect(Marquee.pauseReasonOf(Marquee.atRest(loop2))).toEqual(
        Option.some('Finished'),
      )
    })
  })

  describe('slot projections, reference stability, and Part.compose sync durability', () => {
    it('projects all 4 slots with reference stability across unchanged renders', () => {
      const view1 = Part.view(Marquee.part, Marquee.initial, baseProps)
      const view2 = Part.view(Marquee.part, Marquee.initial, baseProps)
      expect(view1).toBe(view2)

      const rootSlot = view1.slot('Root')
      const viewportSlot = view1.slot('Viewport')
      expect(Slot.ariaOf(rootSlot)).toMatchObject({
        role: 'region',
        id: 'ticker-root',
        'aria-label': 'Marquee content',
        'aria-orientation': 'horizontal',
        'aria-live': 'off',
      })
      expect(Slot.ariaOf(view1.slot('Content', '0'))['hidden']).toBeUndefined()
      expect(Slot.ariaOf(view1.slot('Content', '1'))['hidden']).toBe('')
      expect(Slot.ariaOf(view1.slot('ToggleButton'))).toMatchObject({
        role: 'button',
        id: 'ticker-toggle',
        'aria-label': 'Pause marquee',
        'aria-pressed': 'false',
        'aria-controls': 'ticker-viewport',
        'aria-disabled': 'false',
      })

      // Pausing keeps Root and Viewport reference-stable and flips ToggleButton
      const paused = fold([Marquee.PauseMarquee()])
      const pausedView = Part.view(Marquee.part, paused, baseProps)
      expect(pausedView.slot('Root')).toBe(rootSlot)
      expect(pausedView.slot('Viewport')).toBe(viewportSlot)
      expect(Slot.ariaOf(pausedView.slot('ToggleButton'))['aria-pressed']).toBe(
        'true',
      )
      expect(Slot.ariaOf(pausedView.slot('ToggleButton'))['aria-label']).toBe(
        'Resume marquee',
      )
    })

    it('syncs by default in Part.compose and omits state when deviceOnly', () => {
      const HostModel = S.Struct({ count: S.Number })
      const HostMsg = S.Struct({ _tag: S.Literal('Tick') })
      const Base = makeProgram({
        id: 'marquee-sync-test',
        version: 1,
        Model: HostModel,
        Message: HostMsg,
        init: () => [{ count: 0 }, []],
        update: (model: typeof HostModel.Type) => [model, []],
      })

      const SyncedApp = Part.compose({
        of: Base,
        parts: [Part.given(Marquee.part, () => baseProps)],
      })
      const [initSynced] = SyncedApp.init()
      const [pausedSynced] = SyncedApp.update(
        initSynced,
        Marquee.PauseMarquee(),
      )
      expect(
        SyncedApp.synchronization?.messageCategory(Marquee.PauseMarquee()),
      ).toBe('Navigation')
      const encodedSynced = S.encodeUnknownSync(SyncedApp.Model)(pausedSynced)
      expect(encodedSynced).toHaveProperty('parts.Marquee._tag', 'Paused')

      const LocalApp = Part.compose({
        of: Base,
        parts: [Part.given(Marquee.deviceOnly(), () => baseProps)],
      })
      const [initLocal] = LocalApp.init()
      const [pausedLocal] = LocalApp.update(initLocal, Marquee.PauseMarquee())
      const encodedLocal = S.encodeUnknownSync(LocalApp.Model)(pausedLocal)
      expect(encodedLocal).not.toHaveProperty('parts')
    })
  })
})
