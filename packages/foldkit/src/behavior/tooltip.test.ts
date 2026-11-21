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
import { Device, Synced } from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'
import * as Tooltip from './tooltip.js'

const baseProps: Tooltip.Props = {
  id: 'help-tip',
}

const fold = (
  messages: ReadonlyArray<Tooltip.Message>,
  props: Tooltip.Props = baseProps,
  from: Tooltip.State = Tooltip.initial,
): Tooltip.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => Tooltip.chart.transition(state, message, props)[0],
  )

describe('core Tooltip Part', () => {
  describe('declaration, chart integrity, IDs, placement, and schema serialization', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(Tooltip.part)).toEqual([])
      expect(Part.problemsOf(Tooltip.deviceOnly())).toEqual([])
      expect(Part.problemsOf(Tooltip.make({ sync: 'OwnView' }))).toEqual([])
      expect(
        Block.problemsOf({ name: 'Tooltip', chart: Tooltip.chart }),
      ).toEqual([])

      for (const action of Tooltip.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })

    it('round-trips Closed and Open Tooltip states through Effect Schema JSON encoding', () => {
      const opening = fold([Tooltip.EnterTooltipTrigger()])
      const open = fold([Tooltip.FocusTooltipTrigger()])
      for (const state of [Tooltip.initial, opening, open]) {
        const encoded = S.encodeUnknownSync(Tooltip.State)(state)
        const decoded = S.decodeUnknownSync(Tooltip.State)(encoded)
        expect(decoded).toEqual(state)
      }
    })

    it('derives triggerId, panelId, contentId, and places panels via Placement.place', () => {
      expect(Tooltip.triggerId('help-tip')).toBe('help-tip-trigger')
      expect(Tooltip.panelId('help-tip')).toBe('help-tip-panel')
      expect(Tooltip.contentId('help-tip')).toBe('help-tip-panel')
      expect(Tooltip.defaultShowDelayMs).toBe(500)
      expect(Tooltip.defaultCloseDelayMs).toBe(0)
      expect(Tooltip.isEscapeKey('Escape')).toBe(true)
      expect(Tooltip.isEscapeKey('Enter')).toBe(false)

      const placedBelow = Tooltip.placeFor(baseProps, {
        anchor: { left: 200, top: 100, width: 80, height: 24 },
        size: { width: 160, height: 40 },
        view: { width: 800, height: 600 },
      })
      expect(placedBelow).toEqual({ left: 200, top: 132, side: 'Below' })

      const placedAbove = Tooltip.placeFor(
        { placement: { gapPx: 12, edgePx: 16 } },
        {
          anchor: { left: 200, top: 560, width: 80, height: 24 },
          size: { width: 160, height: 40 },
          view: { width: 800, height: 600 },
        },
      )
      expect(placedAbove).toEqual({ left: 200, top: 508, side: 'Above' })
    })
  })

  describe('hover delay, focus open, mouse focus suppression, and Escape dismissal', () => {
    it('opens after default 500 ms showDelayMs on TestClock and rejects stale ElapsedTooltipShow', () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const [pending, commands] = Tooltip.chart.transition(
            Tooltip.initial,
            Tooltip.EnterTooltipTrigger(),
            baseProps,
          )
          expect(Tooltip.isOpen(pending)).toBe(false)
          expect(Tooltip.isOpening(pending)).toBe(true)
          expect(Tooltip.isTriggerHovered(pending)).toBe(true)
          expect(Tooltip.dataStateOf(pending)).toBe('closed')
          expect(Array.map(commands, c => c.name)).toEqual([
            'WaitForTooltipShow',
          ])
          expect(commands[0]?.args).toEqual({ version: 1, afterMs: 500 })

          // Stale version is ignored
          expect(
            Tooltip.chart.step(
              pending,
              Tooltip.ElapsedTooltipShow({ version: 99 }),
              baseProps,
            ),
          ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })

          // Resolves on exact 500ms TestClock tick
          const wait = Option.getOrThrow(Array.head(commands))
          const answered = yield* Ref.make(Array.empty<Tooltip.Message>())
          const fiber = yield* Effect.forkChild(
            Effect.tap(wait.effect, message =>
              Ref.update(answered, all => [...all, message]),
            ),
          )
          yield* TestClock.adjust(Duration.millis(499))
          expect(yield* Ref.get(answered)).toEqual([])
          yield* TestClock.adjust(Duration.millis(1))
          const elapsed = yield* Fiber.join(fiber)
          expect(elapsed).toEqual(Tooltip.ElapsedTooltipShow({ version: 1 }))

          const [opened, openCommands] = Tooltip.chart.transition(
            pending,
            elapsed,
            baseProps,
          )
          expect(Tooltip.isOpen(opened)).toBe(true)
          expect(Tooltip.dataStateOf(opened)).toBe('open')
          expect(openCommands).toEqual([])

          // Leaving closes immediately when closeDelayMs defaults to 0
          const [closed, closeCommands] = Tooltip.chart.transition(
            opened,
            Tooltip.LeaveTooltipTrigger(),
            baseProps,
          )
          expect(Tooltip.isOpen(closed)).toBe(false)
          expect(closeCommands).toEqual([])
        }).pipe(Effect.provide(TestClock.layer())),
      ))

    it('opens immediately on keyboard, touch, or pen focus, but suppresses mouse-click focus', () => {
      // Mouse press + focus does not open
      const afterMouse = fold([
        Tooltip.PressTooltipPointer({ pointerType: 'mouse' }),
        Tooltip.FocusTooltipTrigger(),
      ])
      expect(Tooltip.isOpen(afterMouse)).toBe(false)
      expect(Tooltip.focusLocationOf(afterMouse)).toEqual(Option.none())
      expect(Tooltip.lastPointerTypeOf(afterMouse)).toEqual(Option.none())

      // Touch press + focus opens immediately
      const afterTouch = fold([
        Tooltip.PressTooltipPointer({ pointerType: 'touch' }),
        Tooltip.FocusTooltipTrigger(),
      ])
      expect(Tooltip.isOpen(afterTouch)).toBe(true)
      expect(Tooltip.focusLocationOf(afterTouch)).toEqual(
        Option.some('Trigger'),
      )

      // Keyboard focus opens immediately and blurs immediately
      const [focused, focusCommands] = Tooltip.chart.transition(
        Tooltip.initial,
        Tooltip.FocusTooltipTrigger(),
        baseProps,
      )
      expect(Tooltip.isOpen(focused)).toBe(true)
      expect(focusCommands).toEqual([])

      const [blurred] = Tooltip.chart.transition(
        focused,
        Tooltip.BlurTooltipTrigger(),
        baseProps,
      )
      expect(Tooltip.isOpen(blurred)).toBe(false)
    })

    it('dismisses on Escape and suppresses reopening until full disengage', () => {
      const hoveredAndFocused = fold([
        Tooltip.FocusTooltipTrigger(),
        Tooltip.EnterTooltipTrigger(),
      ])
      const [dismissed] = Tooltip.chart.transition(
        hoveredAndFocused,
        Tooltip.PressTooltipEscape(),
        baseProps,
      )
      expect(Tooltip.isOpen(dismissed)).toBe(false)
      expect(Tooltip.isDismissed(dismissed)).toBe(true)
      expect(Tooltip.isEngaged(dismissed)).toBe(true)

      // Still dismissed after leave alone while trigger focus remains
      const [afterLeave] = Tooltip.chart.transition(
        dismissed,
        Tooltip.LeaveTooltipTrigger(),
        baseProps,
      )
      expect(Tooltip.isDismissed(afterLeave)).toBe(true)

      // Disengaged after blur too -> fresh hover opens again
      const [disengaged] = Tooltip.chart.transition(
        afterLeave,
        Tooltip.BlurTooltipTrigger(),
        baseProps,
      )
      expect(Tooltip.isDismissed(disengaged)).toBe(false)

      const [reopening, commands] = Tooltip.chart.transition(
        disengaged,
        Tooltip.EnterTooltipTrigger(),
        baseProps,
      )
      expect(Tooltip.isOpening(reopening)).toBe(true)
      expect(commands[0]?.name).toBe('WaitForTooltipShow')
    })

    it('supports interactive panel hover and closeDelayMs grace period, and ignores panel events when non-interactive', () =>
      Effect.runPromise(
        Effect.gen(function* () {
          // Non-interactive default ignores panel enter
          expect(
            Tooltip.chart.step(
              Tooltip.initial,
              Tooltip.EnterTooltipPanel(),
              baseProps,
            ),
          ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })

          const interactiveProps: Tooltip.Props = {
            id: 'interactive-tip',
            showDelayMs: 0,
            closeDelayMs: 150,
            isInteractive: true,
          }
          const [open] = Tooltip.chart.transition(
            Tooltip.initial,
            Tooltip.EnterTooltipTrigger(),
            interactiveProps,
          )
          expect(Tooltip.isOpen(open)).toBe(true)

          // Leaving trigger enters closing grace period
          const [closing, closeCommands] = Tooltip.chart.transition(
            open,
            Tooltip.LeaveTooltipTrigger(),
            interactiveProps,
          )
          expect(Tooltip.isOpen(closing)).toBe(true)
          expect(Tooltip.isClosing(closing)).toBe(true)
          expect(closeCommands[0]?.name).toBe('WaitForTooltipClose')
          expect(closeCommands[0]?.args).toEqual({
            version: Tooltip.closeVersionOf(closing),
            afterMs: 150,
          })

          // Entering panel cancels close
          const [onPanel] = Tooltip.chart.transition(
            closing,
            Tooltip.EnterTooltipPanel(),
            interactiveProps,
          )
          expect(Tooltip.isOpen(onPanel)).toBe(true)
          expect(Tooltip.isClosing(onPanel)).toBe(false)
          expect(Tooltip.isPanelHovered(onPanel)).toBe(true)

          // Leaving panel schedules WaitForTooltipClose and closes after 150ms
          const [closingFromPanel, finalCommands] = Tooltip.chart.transition(
            onPanel,
            Tooltip.LeaveTooltipPanel(),
            interactiveProps,
          )
          const wait = Option.getOrThrow(Array.head(finalCommands))
          const fiber = yield* Effect.forkChild(wait.effect)
          yield* TestClock.adjust(Duration.millis(150))
          const elapsed = yield* Fiber.join(fiber)

          const [closed] = Tooltip.chart.transition(
            closingFromPanel,
            elapsed,
            interactiveProps,
          )
          expect(Tooltip.isOpen(closed)).toBe(false)
        }).pipe(Effect.provide(TestClock.layer())),
      ))

    it('supports optional autoHideMs via TimedHint with stale-version guards', () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const autoHideProps: Tooltip.Props = {
            id: 'auto-tip',
            autoHideMs: 2500,
          }
          const [shown, commands] = Tooltip.chart.transition(
            Tooltip.initial,
            Tooltip.ShowTooltip(),
            autoHideProps,
          )
          expect(Tooltip.isOpen(shown)).toBe(true)
          expect(Tooltip.autoHideVersionOf(shown)).toBe(1)
          expect(Array.map(commands, c => c.name)).toEqual([
            'WaitForTooltipAutoHide',
          ])
          expect(commands[0]?.args).toEqual({ version: 1, afterMs: 2500 })

          // Stale version does not hide
          expect(
            Tooltip.chart.step(
              shown,
              Tooltip.ElapsedTooltipAutoHide({ version: 0 }),
              autoHideProps,
            ),
          ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })

          // Resolves after 2500ms and hides tooltip
          const wait = Option.getOrThrow(Array.head(commands))
          const fiber = yield* Effect.forkChild(wait.effect)
          yield* TestClock.adjust(Duration.millis(2500))
          const elapsed = yield* Fiber.join(fiber)
          expect(elapsed).toEqual(
            Tooltip.ElapsedTooltipAutoHide({ version: 1 }),
          )

          const [hidden] = Tooltip.chart.transition(
            shown,
            elapsed,
            autoHideProps,
          )
          expect(Tooltip.isOpen(hidden)).toBe(false)
        }).pipe(Effect.provide(TestClock.layer())),
      ))

    it('blocks opening when isDisabled is true while still allowing HideTooltip', () => {
      const disabledProps: Tooltip.Props = {
        id: 'disabled-tip',
        isDisabled: true,
      }
      expect(
        Tooltip.chart.step(
          Tooltip.initial,
          Tooltip.EnterTooltipTrigger(),
          disabledProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
      expect(
        Tooltip.chart.step(
          Tooltip.initial,
          Tooltip.FocusTooltipTrigger(),
          disabledProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
      expect(
        Tooltip.chart.step(
          Tooltip.initial,
          Tooltip.ShowTooltip(),
          disabledProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })

      const opened = fold([Tooltip.ShowTooltip()])
      const [closed] = Tooltip.chart.transition(
        opened,
        Tooltip.HideTooltip(),
        disabledProps,
      )
      expect(Tooltip.isOpen(closed)).toBe(false)
    })
  })

  describe('WAI-ARIA projection, reference stability, sync, and Part.compose', () => {
    it('projects role="tooltip", id, hidden, and conditional aria-describedby with reference stability', () => {
      const closedView = Part.view(Tooltip.part, Tooltip.initial, baseProps)
      const closedTrigger = closedView.slot('Trigger')
      const closedContent = closedView.slot('Content')

      expect(Slot.ariaOf(closedTrigger)).toEqual({
        role: 'button',
        id: 'help-tip-trigger',
      })
      expect(Slot.ariaOf(closedContent)).toEqual({
        role: 'tooltip',
        id: 'help-tip-panel',
        hidden: '',
      })

      // Unchanged state & equivalent props -> identical view and slot objects
      const sameClosedView = Part.view(Tooltip.part, Tooltip.initial, {
        id: 'help-tip',
      })
      expect(sameClosedView).toBe(closedView)
      expect(sameClosedView.slot('Trigger')).toBe(closedTrigger)
      expect(sameClosedView.slot('Content')).toBe(closedContent)

      // Pending hover open (still Closed) keeps exact Trigger & Content binding references!
      const [pending] = Tooltip.chart.transition(
        Tooltip.initial,
        Tooltip.EnterTooltipTrigger(),
        baseProps,
      )
      const pendingView = Part.view(Tooltip.part, pending, baseProps)
      expect(pendingView.slot('Trigger')).toBe(closedTrigger)
      expect(pendingView.slot('Content')).toBe(closedContent)

      // Once Open: Trigger gains aria-describedby and Content removes hidden
      const [opened] = Tooltip.chart.transition(
        pending,
        Tooltip.ElapsedTooltipShow({ version: 1 }),
        baseProps,
      )
      const openView = Part.view(Tooltip.part, opened, baseProps)
      expect(Slot.ariaOf(openView.slot('Trigger'))).toEqual({
        role: 'button',
        id: 'help-tip-trigger',
        'aria-describedby': 'help-tip-panel',
      })
      expect(Slot.ariaOf(openView.slot('Content'))).toEqual({
        role: 'tooltip',
        id: 'help-tip-panel',
      })

      // Label precedence (label > labelledBy) and disabled ARIA
      const labeledView = Part.view(Tooltip.part, Tooltip.initial, {
        id: 'help-tip',
        label: 'More details',
        labelledBy: 'other-id',
        isDisabled: true,
      })
      expect(Slot.ariaOf(labeledView.slot('Trigger'))).toEqual({
        role: 'button',
        id: 'help-tip-trigger',
        'aria-label': 'More details',
        'aria-disabled': 'true',
      })

      const labelledByView = Part.view(Tooltip.part, Tooltip.initial, {
        id: 'help-tip',
        labelledBy: 'info-heading',
      })
      expect(Slot.ariaOf(labelledByView.slot('Trigger'))).toEqual({
        role: 'button',
        id: 'help-tip-trigger',
        'aria-labelledby': 'info-heading',
      })
    })

    it('syncs by default (Navigation), supports deviceOnly(), and resets transient tooltips in atRest', () => {
      const Base = makeProgram({
        id: 'tooltip-sync-check',
        version: 1,
        Model: S.Struct({ count: S.Number }),
        Message: S.Struct({ _tag: S.Literal('Bump') }),
        init: () => [{ count: 0 }, []],
        update: model => [{ count: model.count + 1 }, []],
      })

      const SyncedApp = Part.compose({
        of: Base,
        parts: [Part.given(Tooltip.part, () => baseProps)],
      })
      const [syncedInit] = SyncedApp.init()
      const [syncedOpen] = SyncedApp.update(syncedInit, Tooltip.ShowTooltip())
      expect(Tooltip.isOpen(syncedOpen.parts['Tooltip'])).toBe(true)

      expect(
        SyncedApp.synchronization?.messageCategory(Tooltip.ShowTooltip()),
      ).toBe('Navigation')
      expect(
        SyncedApp.synchronization?.paceOf?.(Tooltip.ShowTooltip()),
      ).toEqual(Synced())
      expect(
        SyncedApp.synchronization?.isLocalOnly?.(Tooltip.ShowTooltip()),
      ).toBe(false)

      // projectLocal / atRest closes transient tooltips while keeping version counters
      const projected = SyncedApp.synchronization?.projectLocal?.(syncedOpen)
      expect(projected).toBeDefined()
      if (projected !== undefined) {
        expect(Tooltip.isOpen(projected.parts['Tooltip'])).toBe(false)
        expect(Tooltip.openVersionOf(projected.parts['Tooltip'])).toBe(
          Tooltip.openVersionOf(syncedOpen.parts['Tooltip']),
        )
      }

      // Encoded Model includes synced Tooltip state
      const encodedSynced = S.encodeUnknownSync(SyncedApp.Model)(syncedOpen)
      expect(encodedSynced).toHaveProperty('parts.Tooltip')

      // deviceOnly omits Tooltip from synced log and encoded Model
      const LocalApp = Part.compose({
        of: Base,
        parts: [Part.given(Tooltip.deviceOnly(), () => baseProps)],
      })
      const [localInit] = LocalApp.init()
      const [localOpen] = LocalApp.update(localInit, Tooltip.ShowTooltip())
      expect(
        LocalApp.synchronization?.isLocalOnly?.(Tooltip.ShowTooltip()),
      ).toBe(true)
      expect(LocalApp.synchronization?.paceOf?.(Tooltip.ShowTooltip())).toEqual(
        Device({ because: 'OwnView' }),
      )
      const encodedLocal = S.encodeUnknownSync(LocalApp.Model)(localOpen)
      expect(encodedLocal).not.toHaveProperty('parts')
      expect(Tooltip.isMessage(Tooltip.PressTooltipEscape())).toBe(true)
    })
  })
})
