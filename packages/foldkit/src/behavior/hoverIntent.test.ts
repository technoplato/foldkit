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

import * as Block from './block.js'
import * as HoverIntent from './hoverIntent.js'
import { Device, Synced } from './pace.js'

const defaultProps: HoverIntent.Props = {}

const fold = (
  messages: ReadonlyArray<HoverIntent.Message>,
  props: HoverIntent.Props = defaultProps,
  from: HoverIntent.State = HoverIntent.initial,
): HoverIntent.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => HoverIntent.chart.transition(state, message, props)[0],
  )

describe('HoverIntent block', () => {
  describe('chart integrity and schema serialization', () => {
    it('passes Block.problemsOf with zero unreachable states and zero dead transitions', () => {
      expect(
        Block.problemsOf({ name: 'HoverIntent', chart: HoverIntent.chart }),
      ).toEqual([])
    })

    it('round-trips every HoverIntent state cleanly through Effect Schema JSON encoding', () => {
      const opening = fold([HoverIntent.EnteredTrigger()])
      const open = fold([HoverIntent.FocusedTrigger()])
      const closing = fold([
        HoverIntent.EnteredTrigger(),
        HoverIntent.ElapsedOpen({ version: 1 }),
        HoverIntent.LeftTrigger(),
      ])

      for (const state of [HoverIntent.initial, opening, open, closing]) {
        const encoded = S.encodeUnknownSync(HoverIntent.State)(state)
        const decoded = S.decodeUnknownSync(HoverIntent.State)(encoded)
        expect(decoded).toEqual(state)
      }
    })
  })

  describe('pointer open/close delays and Command.answerAfter on Effect TestClock', () => {
    it('opens after openDelayMs, emits WaitBeforeOpening, and resolves on Effect TestClock', () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const [opening, commands] = HoverIntent.chart.transition(
            HoverIntent.initial,
            HoverIntent.EnteredTrigger(),
            { openDelayMs: 250 },
          )
          expect(opening._tag).toBe('Opening')
          expect(HoverIntent.isOpening(opening)).toBe(true)
          expect(HoverIntent.isOpen(opening)).toBe(false)
          expect(HoverIntent.isEngaged(opening)).toBe(true)
          expect(Array.map(commands, c => c.name)).toEqual([
            'WaitBeforeOpening',
          ])
          expect(commands[0]?.args).toEqual({ version: 1, afterMs: 250 })

          const wait = Option.getOrThrow(Array.head(commands))
          const answered = yield* Ref.make(Array.empty<HoverIntent.Message>())
          const fiber = yield* Effect.forkChild(
            Effect.tap(wait.effect, message =>
              Ref.update(answered, all => [...all, message]),
            ),
          )
          yield* TestClock.adjust(Duration.millis(249))
          expect(yield* Ref.get(answered)).toEqual([])
          yield* TestClock.adjust(Duration.millis(1))
          const elapsed = yield* Fiber.join(fiber)
          expect(elapsed).toEqual(HoverIntent.ElapsedOpen({ version: 1 }))

          const [opened, openCommands] = HoverIntent.chart.transition(
            opening,
            elapsed,
            { openDelayMs: 250 },
          )
          expect(opened._tag).toBe('Open')
          expect(HoverIntent.isOpen(opened)).toBe(true)
          expect(openCommands).toEqual([])
        }).pipe(Effect.provide(TestClock.layer())),
      ))

    it('opens immediately when openDelayMs is 0 and closes immediately when closeDelayMs is 0', () => {
      const props: HoverIntent.Props = { openDelayMs: 0, closeDelayMs: 0 }
      const [opened, openCommands] = HoverIntent.chart.transition(
        HoverIntent.initial,
        HoverIntent.EnteredTrigger(),
        props,
      )
      expect(opened._tag).toBe('Open')
      expect(openCommands).toEqual([])

      const [closed, closeCommands] = HoverIntent.chart.transition(
        opened,
        HoverIntent.LeftTrigger(),
        props,
      )
      expect(closed._tag).toBe('Closed')
      expect(closeCommands).toEqual([])
    })

    it('cancels a pending open when leaving early and rejects stale ElapsedOpen', () => {
      const [opening] = HoverIntent.chart.transition(
        HoverIntent.initial,
        HoverIntent.EnteredTrigger(),
        defaultProps,
      )
      const [left] = HoverIntent.chart.transition(
        opening,
        HoverIntent.LeftTrigger(),
        defaultProps,
      )
      expect(left._tag).toBe('Closed')
      expect(left.openVersion).toBe(2)

      // Re-entering starts version 3; stale version 1 is rejected
      const [reopening] = HoverIntent.chart.transition(
        left,
        HoverIntent.EnteredTrigger(),
        defaultProps,
      )
      expect(reopening.openVersion).toBe(3)
      expect(
        HoverIntent.chart.step(
          reopening,
          HoverIntent.ElapsedOpen({ version: 1 }),
          defaultProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })

      const [opened] = HoverIntent.chart.transition(
        reopening,
        HoverIntent.ElapsedOpen({ version: 3 }),
        defaultProps,
      )
      expect(opened._tag).toBe('Open')
    })

    it('waits closeDelayMs on pointer leave, cancels on panel entry, and resolves WaitBeforeClosing on TestClock', () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const open = fold([
            HoverIntent.EnteredTrigger(),
            HoverIntent.ElapsedOpen({ version: 1 }),
          ])

          const [closing, closeCommands] = HoverIntent.chart.transition(
            open,
            HoverIntent.LeftTrigger(),
            { closeDelayMs: 300 },
          )
          expect(closing._tag).toBe('Closing')
          expect(HoverIntent.isOpen(closing)).toBe(true)
          expect(HoverIntent.isClosing(closing)).toBe(true)
          expect(closeCommands[0]?.name).toBe('WaitBeforeClosing')
          expect(closeCommands[0]?.args).toEqual({ version: 2, afterMs: 300 })

          // Entering the interactive panel cancels the pending close
          const [onPanel] = HoverIntent.chart.transition(
            closing,
            HoverIntent.EnteredPanel(),
            { closeDelayMs: 300 },
          )
          expect(onPanel._tag).toBe('Open')
          expect(onPanel.isPanelHovered).toBe(true)
          expect(onPanel.closeVersion).toBe(3)
          expect(
            HoverIntent.chart.step(
              onPanel,
              HoverIntent.ElapsedClose({ version: 2 }),
              { closeDelayMs: 300 },
            ),
          ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })

          // Leaving panel schedules version 4 close and closes after 300ms
          const [closingAgain, finalCommands] = HoverIntent.chart.transition(
            onPanel,
            HoverIntent.LeftPanel(),
            { closeDelayMs: 300 },
          )
          const wait = Option.getOrThrow(Array.head(finalCommands))
          const fiber = yield* Effect.forkChild(wait.effect)
          yield* TestClock.adjust(Duration.millis(300))
          const elapsed = yield* Fiber.join(fiber)
          expect(elapsed).toEqual(HoverIntent.ElapsedClose({ version: 4 }))

          const [closed] = HoverIntent.chart.transition(closingAgain, elapsed, {
            closeDelayMs: 300,
          })
          expect(closed._tag).toBe('Closed')
          expect(HoverIntent.isOpen(closed)).toBe(false)
        }).pipe(Effect.provide(TestClock.layer())),
      ))

    it('ignores panel hover and focus when isInteractive is false', () => {
      const nonInteractive: HoverIntent.Props = {
        openDelayMs: 500,
        closeDelayMs: 0,
        isInteractive: false,
      }
      expect(
        HoverIntent.chart.step(
          HoverIntent.initial,
          HoverIntent.EnteredPanel(),
          nonInteractive,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
      expect(
        HoverIntent.chart.step(
          HoverIntent.initial,
          HoverIntent.FocusedPanel(),
          nonInteractive,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
    })
  })

  describe('pointer-type focus discrimination and focus handoff', () => {
    it('discriminates pointer-press focus (mouse, touch, pen) from keyboard/assistive focus and rejects touch hover', () => {
      expect(HoverIntent.canHoverPointer(undefined)).toBe(true)
      expect(HoverIntent.canHoverPointer('mouse')).toBe(true)
      expect(HoverIntent.canHoverPointer('pen')).toBe(true)
      expect(HoverIntent.canHoverPointer('touch')).toBe(false)

      expect(HoverIntent.isPointerAffirmedFocus(Option.none())).toBe(true)
      expect(HoverIntent.isPointerAffirmedFocus(Option.some('touch'))).toBe(
        false,
      )
      expect(HoverIntent.isPointerAffirmedFocus(Option.some('pen'))).toBe(false)
      expect(HoverIntent.isPointerAffirmedFocus(Option.some('mouse'))).toBe(
        false,
      )

      // Mouse press followed by focus does not open or mark focused
      const afterMouseFocus = fold([
        HoverIntent.PressedPointer({ pointerType: 'mouse' }),
        HoverIntent.FocusedTrigger(),
      ])
      expect(HoverIntent.isOpen(afterMouseFocus)).toBe(false)
      expect(afterMouseFocus.maybeFocusLocation).toEqual(Option.none())
      expect(afterMouseFocus.maybeLastPointerType).toEqual(Option.none())

      // Touch tap (pointerdown -> pointerenter -> focus) does not stick open on mobile
      const afterTouchFocus = fold([
        HoverIntent.PressedPointer({ pointerType: 'touch' }),
        HoverIntent.EnteredTrigger({ pointerType: 'touch' }),
        HoverIntent.FocusedTrigger(),
      ])
      expect(HoverIntent.isOpen(afterTouchFocus)).toBe(false)
      expect(afterTouchFocus.maybeFocusLocation).toEqual(Option.none())

      // Keyboard focus (no pointer press) opens immediately
      const afterKeyboardFocus = fold([HoverIntent.FocusedTrigger()])
      expect(HoverIntent.isOpen(afterKeyboardFocus)).toBe(true)
      expect(afterKeyboardFocus.maybeFocusLocation).toEqual(
        Option.some('Trigger'),
      )
    })

    it('keeps open across trigger-to-panel focus handoff in interactive mode and closes immediately when non-interactive', () => {
      // Interactive with closeDelayMs > 0 schedules 0ms close so FocusedPanel can cancel it
      const focused = fold([HoverIntent.FocusedTrigger()])
      const [blurring, blurCommands] = HoverIntent.chart.transition(
        focused,
        HoverIntent.BlurredTrigger(),
        { closeDelayMs: 300, isInteractive: true },
      )
      expect(blurring._tag).toBe('Closing')
      expect(blurCommands[0]?.args).toEqual({ version: 2, afterMs: 0 })

      const [panelFocused, panelCommands] = HoverIntent.chart.transition(
        blurring,
        HoverIntent.FocusedPanel(),
        { closeDelayMs: 300, isInteractive: true },
      )
      expect(panelFocused._tag).toBe('Open')
      expect(panelFocused.maybeFocusLocation).toEqual(Option.some('Panel'))
      expect(panelCommands).toEqual([])

      // Non-interactive closes immediately on blur with zero commands
      const [closedImmediately, nonInteractiveCommands] =
        HoverIntent.chart.transition(focused, HoverIntent.BlurredTrigger(), {
          closeDelayMs: 0,
          isInteractive: false,
        })
      expect(closedImmediately._tag).toBe('Closed')
      expect(nonInteractiveCommands).toEqual([])
    })
  })

  describe('Escape dismissal until full disengage and programmatic controls', () => {
    it('closes on Escape without lying about hover/focus and suppresses reopen until both pointer and focus disengage', () => {
      const bothEngaged = fold([
        HoverIntent.FocusedTrigger(),
        HoverIntent.EnteredTrigger(),
      ])
      const [dismissed] = HoverIntent.chart.transition(
        bothEngaged,
        HoverIntent.PressedEscape(),
        defaultProps,
      )
      expect(dismissed._tag).toBe('Closed')
      expect(dismissed.isDismissed).toBe(true)
      expect(dismissed.isTriggerHovered).toBe(true)
      expect(dismissed.maybeFocusLocation).toEqual(Option.some('Trigger'))

      // Still dismissed after blur alone (pointer still hovering)
      const [afterBlur] = HoverIntent.chart.transition(
        dismissed,
        HoverIntent.BlurredTrigger(),
        defaultProps,
      )
      expect(afterBlur.isDismissed).toBe(true)
      expect(afterBlur.isTriggerHovered).toBe(true)

      // Re-hovering while dismissed does not schedule an open
      const [rehovered, rehoverCommands] = HoverIntent.chart.transition(
        afterBlur,
        HoverIntent.EnteredTrigger(),
        defaultProps,
      )
      expect(rehovered._tag).toBe('Closed')
      expect(rehoverCommands).toEqual([])

      // Leaving clears isDismissed once fully disengaged
      const [disengaged] = HoverIntent.chart.transition(
        rehovered,
        HoverIntent.LeftTrigger(),
        defaultProps,
      )
      expect(disengaged.isDismissed).toBe(false)
      expect(HoverIntent.isEngaged(disengaged)).toBe(false)

      // Fresh hover now schedules opening
      const [reopening, reopenCommands] = HoverIntent.chart.transition(
        disengaged,
        HoverIntent.EnteredTrigger(),
        defaultProps,
      )
      expect(reopening._tag).toBe('Opening')
      expect(reopenCommands[0]?.name).toBe('WaitBeforeOpening')
    })

    it('clears panel engagement on Escape when only the panel was engaged', () => {
      const panelOnly = fold([
        HoverIntent.FocusedTrigger(),
        HoverIntent.BlurredTrigger(),
        HoverIntent.FocusedPanel(),
        HoverIntent.EnteredPanel(),
      ])
      const [dismissed] = HoverIntent.chart.transition(
        panelOnly,
        HoverIntent.PressedEscape(),
        defaultProps,
      )
      expect(dismissed._tag).toBe('Closed')
      expect(dismissed.isPanelHovered).toBe(false)
      expect(dismissed.maybeFocusLocation).toEqual(Option.none())
      expect(dismissed.isDismissed).toBe(false)
    })

    it('supports programmatic ShowNow, HideNow, atRest, and sync helpers', () => {
      const [shown] = HoverIntent.chart.transition(
        HoverIntent.initial,
        HoverIntent.ShowNow(),
        defaultProps,
      )
      expect(HoverIntent.isOpen(shown)).toBe(true)

      const [hidden] = HoverIntent.chart.transition(
        shown,
        HoverIntent.HideNow(),
        defaultProps,
      )
      expect(HoverIntent.isOpen(hidden)).toBe(false)

      const rested = HoverIntent.atRest(shown)
      expect(rested._tag).toBe('Closed')
      expect(rested.openVersion).toBe(shown.openVersion)
      expect(rested.closeVersion).toBe(shown.closeVersion)
      expect(HoverIntent.isEngaged(rested)).toBe(false)

      expect(HoverIntent.synced.EnteredTrigger).toEqual(Synced())
      expect(HoverIntent.deviceSync('OwnView').EnteredTrigger).toEqual(
        Device({ because: 'OwnView' }),
      )
      expect(HoverIntent.sync.EnteredTrigger).toEqual(
        Device({ because: 'InputInProgress' }),
      )
      expect(HoverIntent.isMessage(HoverIntent.PressedEscape())).toBe(true)
      expect(HoverIntent.isEscapeKey('Escape')).toBe(true)
      expect(HoverIntent.isEscapeKey('Enter')).toBe(false)
      expect(HoverIntent.shouldAcceptVersion(4, 4)).toBe(true)
      expect(HoverIntent.shouldAcceptVersion(4, 3)).toBe(false)
    })
  })

  describe('safe-triangle and pointer-corridor geometry', () => {
    it('evaluates isPointInTriangle for CW, CCW, boundary, outside, and degenerate triangles', () => {
      const a = { x: 0, y: 0 }
      const b = { x: 10, y: 0 }
      const c = { x: 0, y: 10 }

      // CCW and CW winding produce the same answer
      expect(HoverIntent.isPointInTriangle({ x: 2, y: 2 }, a, b, c)).toBe(true)
      expect(HoverIntent.isPointInTriangle({ x: 2, y: 2 }, a, c, b)).toBe(true)
      // Edge and vertex are inclusive
      expect(HoverIntent.isPointInTriangle({ x: 5, y: 0 }, a, b, c)).toBe(true)
      expect(HoverIntent.isPointInTriangle({ x: 0, y: 0 }, a, b, c)).toBe(true)
      // Outside
      expect(HoverIntent.isPointInTriangle({ x: 8, y: 8 }, a, b, c)).toBe(false)
      expect(HoverIntent.isPointInTriangle({ x: -1, y: 2 }, a, b, c)).toBe(
        false,
      )
      // Degenerate collinear triangle
      expect(
        HoverIntent.isPointInTriangle(
          { x: 5, y: 0 },
          { x: 0, y: 0 },
          { x: 5, y: 0 },
          { x: 10, y: 0 },
        ),
      ).toBe(false)
    })

    it('evaluates isPointInPolygon and isPointInRect', () => {
      const square: HoverIntent.Polygon = [
        { x: 10, y: 10 },
        { x: 30, y: 10 },
        { x: 30, y: 30 },
        { x: 10, y: 30 },
      ]
      expect(HoverIntent.isPointInPolygon({ x: 20, y: 20 }, square)).toBe(true)
      expect(HoverIntent.isPointInPolygon({ x: 5, y: 20 }, square)).toBe(false)
      expect(HoverIntent.isPointInPolygon({ x: 20, y: 20 }, [])).toBe(false)

      const rect = { left: 10, top: 10, width: 20, height: 20 }
      expect(HoverIntent.isPointInRect({ x: 10, y: 30 }, rect)).toBe(true)
      expect(HoverIntent.isPointInRect({ x: 31, y: 20 }, rect)).toBe(false)
    })

    it('keeps diagonal movement toward a submenu or hover card inside the safe triangle on every side', () => {
      // Submenu panel to the right of trigger
      const rightPanel = { left: 110, top: 60, width: 200, height: 240 }
      const rightOrigin = { x: 100, y: 115 }
      expect(
        HoverIntent.isMovingTowardPanel(
          rightOrigin,
          { x: 106, y: 80 },
          rightPanel,
        ),
      ).toBe(true)
      expect(
        HoverIntent.isMovingTowardPanel(
          rightOrigin,
          { x: 106, y: 210 },
          rightPanel,
        ),
      ).toBe(true)
      expect(
        HoverIntent.isMovingTowardPanel(
          rightOrigin,
          { x: 150, y: 150 },
          rightPanel,
        ),
      ).toBe(true)
      expect(
        HoverIntent.isMovingTowardPanel(
          rightOrigin,
          { x: 100, y: 40 },
          rightPanel,
        ),
      ).toBe(false)
      expect(
        HoverIntent.isMovingTowardPanel(
          rightOrigin,
          { x: 60, y: 115 },
          rightPanel,
        ),
      ).toBe(false)

      // HoverCard panel below trigger
      const belowPanel = { left: 80, top: 60, width: 200, height: 120 }
      const aboveOrigin = { x: 140, y: 48 }
      expect(
        HoverIntent.isMovingTowardPanel(
          aboveOrigin,
          { x: 110, y: 55 },
          belowPanel,
        ),
      ).toBe(true)
      expect(
        HoverIntent.isMovingTowardPanel(
          aboveOrigin,
          { x: 140, y: 30 },
          belowPanel,
        ),
      ).toBe(false)

      // Panel above trigger
      const abovePanel = { left: 80, top: 20, width: 200, height: 80 }
      const belowOrigin = { x: 140, y: 112 }
      expect(
        HoverIntent.isMovingTowardPanel(
          belowOrigin,
          { x: 200, y: 105 },
          abovePanel,
        ),
      ).toBe(true)
      expect(
        HoverIntent.isMovingTowardPanel(
          belowOrigin,
          { x: 140, y: 130 },
          abovePanel,
        ),
      ).toBe(false)

      // Panel to the left of trigger
      const leftPanel = { left: 20, top: 60, width: 100, height: 160 }
      const leftOrigin = { x: 130, y: 140 }
      expect(
        HoverIntent.isMovingTowardPanel(
          leftOrigin,
          { x: 124, y: 90 },
          leftPanel,
        ),
      ).toBe(true)
      expect(
        HoverIntent.isMovingTowardPanel(
          leftOrigin,
          { x: 150, y: 140 },
          leftPanel,
        ),
      ).toBe(false)

      // Diagonal origin (top-left of panel)
      const diagPanel = { left: 100, top: 100, width: 100, height: 100 }
      expect(
        HoverIntent.isMovingTowardPanel(
          { x: 60, y: 60 },
          { x: 95, y: 95 },
          diagPanel,
        ),
      ).toBe(true)
      expect(
        HoverIntent.isMovingTowardPanel(
          { x: 60, y: 60 },
          { x: 40, y: 40 },
          diagPanel,
        ),
      ).toBe(false)

      // Origin already inside panel moving outside is not moving toward panel
      expect(
        HoverIntent.isMovingTowardPanel(
          { x: 150, y: 150 },
          { x: 250, y: 150 },
          diagPanel,
        ),
      ).toBe(false)
    })
  })
})
