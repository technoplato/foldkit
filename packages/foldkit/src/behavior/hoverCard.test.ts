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
import * as HoverCard from './hoverCard.js'
import { Device, Synced } from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'

const baseProps: HoverCard.Props = {
  id: 'profile-card',
  label: 'Author profile',
}

const fold = (
  messages: ReadonlyArray<HoverCard.Message>,
  props: HoverCard.Props = baseProps,
  from: HoverCard.State = HoverCard.initial,
): HoverCard.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => HoverCard.chart.transition(state, message, props)[0],
  )

describe('core HoverCard Part', () => {
  describe('declaration, chart integrity, IDs, placement, and schema round-trip', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(HoverCard.part)).toEqual([])
      expect(Part.problemsOf(HoverCard.deviceOnly())).toEqual([])
      expect(Part.problemsOf(HoverCard.make({ sync: 'OwnView' }))).toEqual([])
      expect(
        Block.problemsOf({ name: 'HoverCard', chart: HoverCard.chart }),
      ).toEqual([])

      for (const action of HoverCard.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })

    it('derives IDs, defaults (700 ms open / 300 ms close / interactive true), and places panels', () => {
      expect(HoverCard.triggerId('profile-card')).toBe('profile-card-trigger')
      expect(HoverCard.contentId('profile-card')).toBe('profile-card-content')
      expect(HoverCard.defaultOpenDelayMs).toBe(700)
      expect(HoverCard.defaultCloseDelayMs).toBe(300)
      expect(HoverCard.openDelayMsOf({})).toBe(700)
      expect(HoverCard.closeDelayMsOf({})).toBe(300)
      expect(HoverCard.isInteractiveOf({})).toBe(true)
      expect(HoverCard.isEscapeKey('Escape')).toBe(true)

      const placedBelow = HoverCard.placeFor(baseProps, {
        anchor: { left: 200, top: 100, width: 80, height: 24 },
        size: { width: 240, height: 140 },
        view: { width: 1000, height: 800 },
      })
      expect(placedBelow).toEqual({ left: 200, top: 132, side: 'Below' })

      const placedAbove = HoverCard.placeFor(
        { placement: { gapPx: 12, edgePx: 16 } },
        {
          anchor: { left: 200, top: 700, width: 80, height: 24 },
          size: { width: 240, height: 140 },
          view: { width: 1000, height: 800 },
        },
      )
      expect(placedAbove).toEqual({ left: 200, top: 548, side: 'Above' })
    })

    it('round-trips Closed and Open states through Effect Schema JSON encoding', () => {
      const opening = fold([HoverCard.EnterHoverCardTrigger()])
      const open = fold([HoverCard.OpenHoverCard()])
      for (const state of [HoverCard.initial, opening, open]) {
        const encoded = S.encodeUnknownSync(HoverCard.State)(state)
        const decoded = S.decodeUnknownSync(HoverCard.State)(encoded)
        expect(decoded).toEqual(state)
      }
    })
  })

  describe('700 ms open delay, 300 ms close delay, interactive panel, and safe-triangle corridor', () => {
    it('opens after 700 ms on TestClock, stays open over panel, and closes after 300 ms', () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const [pending, openCommands] = HoverCard.chart.transition(
            HoverCard.initial,
            HoverCard.EnterHoverCardTrigger(),
            baseProps,
          )
          expect(HoverCard.isOpen(pending)).toBe(false)
          expect(HoverCard.isOpening(pending)).toBe(true)
          expect(Array.map(openCommands, c => c.name)).toEqual([
            'WaitForHoverCardOpen',
          ])
          expect(openCommands[0]?.args).toEqual({ version: 1, afterMs: 700 })

          const waitOpen = Option.getOrThrow(Array.head(openCommands))
          const openAnswered = yield* Ref.make(Array.empty<HoverCard.Message>())
          const openFiber = yield* Effect.forkChild(
            Effect.tap(waitOpen.effect, message =>
              Ref.update(openAnswered, all => [...all, message]),
            ),
          )
          yield* TestClock.adjust(Duration.millis(699))
          expect(yield* Ref.get(openAnswered)).toEqual([])
          yield* TestClock.adjust(Duration.millis(1))
          const elapsedOpen = yield* Fiber.join(openFiber)
          expect(elapsedOpen).toEqual(
            HoverCard.ElapsedHoverCardOpen({ version: 1 }),
          )

          const [opened] = HoverCard.chart.transition(
            pending,
            elapsedOpen,
            baseProps,
          )
          expect(HoverCard.isOpen(opened)).toBe(true)
          expect(HoverCard.dataStateOf(opened)).toBe('open')

          // Leave trigger -> starts 300ms close countdown
          const [closing, closeCommands] = HoverCard.chart.transition(
            opened,
            HoverCard.LeaveHoverCardTrigger(),
            baseProps,
          )
          expect(HoverCard.isOpen(closing)).toBe(true)
          expect(HoverCard.isClosing(closing)).toBe(true)
          expect(Array.map(closeCommands, c => c.name)).toEqual([
            'WaitForHoverCardClose',
          ])
          expect(closeCommands[0]?.args).toEqual({ version: 2, afterMs: 300 })

          // Moving within safe triangle extends the close countdown and bumps closeVersion
          const panelRect = { left: 120, top: 60, width: 200, height: 180 }
          expect(
            HoverCard.isInSafeCorridor(
              { x: 100, y: 120 },
              { x: 112, y: 95 },
              panelRect,
            ),
          ).toBe(true)
          expect(
            HoverCard.isInSafeCorridor(
              { x: 100, y: 120 },
              { x: 100, y: 20 },
              panelRect,
            ),
          ).toBe(false)

          const [extended, extendedCommands] = HoverCard.chart.transition(
            closing,
            HoverCard.MovedHoverCardPointer({
              origin: { x: 100, y: 120 },
              point: { x: 112, y: 95 },
              panelRect,
            }),
            baseProps,
          )
          expect(HoverCard.isOpen(extended)).toBe(true)
          expect(HoverCard.closeVersionOf(extended)).toBe(3)
          expect(extendedCommands[0]?.args).toEqual({
            version: 3,
            afterMs: 300,
          })

          // Entering panel cancels close countdown and keeps card open
          const [panelEngaged] = HoverCard.chart.transition(
            extended,
            HoverCard.EnterHoverCardPanel(),
            baseProps,
          )
          expect(HoverCard.isOpen(panelEngaged)).toBe(true)
          expect(HoverCard.isClosing(panelEngaged)).toBe(false)
          expect(HoverCard.isPanelHovered(panelEngaged)).toBe(true)

          // Stale close timer (version 3) is ignored
          const [stillOpen] = HoverCard.chart.transition(
            panelEngaged,
            HoverCard.ElapsedHoverCardClose({ version: 3 }),
            baseProps,
          )
          expect(HoverCard.isOpen(stillOpen)).toBe(true)

          // Leaving panel triggers 300ms close countdown that closes when elapsed
          const [leavingPanel, panelCloseCommands] = HoverCard.chart.transition(
            stillOpen,
            HoverCard.LeaveHoverCardPanel(),
            baseProps,
          )
          const waitClose = Option.getOrThrow(Array.head(panelCloseCommands))
          const closeFiber = yield* Effect.forkChild(waitClose.effect)
          yield* TestClock.adjust(Duration.millis(300))
          const elapsedClose = yield* Fiber.join(closeFiber)
          const [closed] = HoverCard.chart.transition(
            leavingPanel,
            elapsedClose,
            baseProps,
          )
          expect(HoverCard.isOpen(closed)).toBe(false)
        }).pipe(Effect.provide(TestClock.layer())),
      ))

    it('handles keyboard focus, suppresses mouse-click focus, dismisses on Escape, and respects isDisabled', () => {
      // Mouse press + focus does not open
      const afterMouse = fold([
        HoverCard.PressHoverCardPointer({ pointerType: 'mouse' }),
        HoverCard.FocusHoverCardTrigger(),
      ])
      expect(HoverCard.isOpen(afterMouse)).toBe(false)

      // Keyboard focus opens immediately
      const focused = fold([HoverCard.FocusHoverCardTrigger()])
      expect(HoverCard.isOpen(focused)).toBe(true)
      expect(HoverCard.focusLocationOf(focused)).toEqual(Option.some('Trigger'))

      // Escape dismisses and suppresses reopen until full disengage
      const dismissed = fold(
        [HoverCard.PressHoverCardEscape()],
        baseProps,
        focused,
      )
      expect(HoverCard.isOpen(dismissed)).toBe(false)
      expect(HoverCard.isDismissed(dismissed)).toBe(true)

      // Blur resets dismissal
      const disengaged = fold(
        [HoverCard.BlurHoverCardTrigger()],
        baseProps,
        dismissed,
      )
      expect(HoverCard.isDismissed(disengaged)).toBe(false)

      // Disabled ignores open attempts
      const disabledProps: HoverCard.Props = { ...baseProps, isDisabled: true }
      expect(
        HoverCard.isOpen(fold([HoverCard.OpenHoverCard()], disabledProps)),
      ).toBe(false)
      expect(
        HoverCard.isOpen(
          fold([HoverCard.FocusHoverCardTrigger()], disabledProps),
        ),
      ).toBe(false)

      // atRest closes while preserving monotonic versions
      const rested = HoverCard.atRest(focused)
      expect(HoverCard.isOpen(rested)).toBe(false)
      expect(HoverCard.openVersionOf(rested)).toBe(
        HoverCard.openVersionOf(focused),
      )
    })
  })

  describe('slot projections, reference stability, and Part.compose sync durability', () => {
    it('projects Trigger and Content slots with reference stability', () => {
      const closedView1 = Part.view(
        HoverCard.part,
        HoverCard.initial,
        baseProps,
      )
      const closedView2 = Part.view(
        HoverCard.part,
        HoverCard.initial,
        baseProps,
      )
      expect(closedView1).toBe(closedView2)

      expect(Slot.ariaOf(closedView1.slot('Trigger'))).toMatchObject({
        role: 'button',
        id: 'profile-card-trigger',
        'aria-expanded': 'false',
        'aria-controls': 'profile-card-content',
        'aria-label': 'Author profile',
      })
      expect(Slot.ariaOf(closedView1.slot('Content'))).toMatchObject({
        role: 'region',
        id: 'profile-card-content',
        'aria-labelledby': 'profile-card-trigger',
        tabindex: '-1',
        hidden: '',
      })

      const opened = fold([HoverCard.OpenHoverCard()])
      const openView = Part.view(HoverCard.part, opened, baseProps)
      expect(Slot.ariaOf(openView.slot('Trigger'))['aria-expanded']).toBe(
        'true',
      )
      expect(Slot.ariaOf(openView.slot('Content'))['hidden']).toBeUndefined()
    })

    it('syncs by default under Navigation and supports deviceOnly omission', () => {
      expect(HoverCard.synced.OpenHoverCard).toEqual(Synced())
      expect(HoverCard.deviceSync('OwnView').OpenHoverCard).toEqual(
        Device({ because: 'OwnView' }),
      )

      const HostModel = S.Struct({ count: S.Number })
      const HostMsg = S.Struct({ _tag: S.Literal('Tick') })
      const Base = makeProgram({
        id: 'hovercard-sync-test',
        version: 1,
        Model: HostModel,
        Message: HostMsg,
        init: () => [{ count: 0 }, []],
        update: (model: typeof HostModel.Type) => [model, []],
      })

      const SyncedApp = Part.compose({
        of: Base,
        parts: [Part.given(HoverCard.part, () => baseProps)],
      })
      const [initSynced] = SyncedApp.init()
      const [openSynced] = SyncedApp.update(
        initSynced,
        HoverCard.OpenHoverCard(),
      )
      expect(S.encodeUnknownSync(SyncedApp.Model)(openSynced)).toHaveProperty(
        'parts.HoverCard._tag',
        'Open',
      )

      const LocalApp = Part.compose({
        of: Base,
        parts: [Part.given(HoverCard.deviceOnly(), () => baseProps)],
      })
      const [initLocal] = LocalApp.init()
      const [openLocal] = LocalApp.update(initLocal, HoverCard.OpenHoverCard())
      expect(S.encodeUnknownSync(LocalApp.Model)(openLocal)).not.toHaveProperty(
        'parts',
      )
    })
  })
})
