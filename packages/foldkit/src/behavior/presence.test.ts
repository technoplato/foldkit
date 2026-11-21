import { Array, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Block from './block.js'
import { Device, Synced } from './pace.js'
import * as Presence from './presence.js'

const fold = (
  messages: ReadonlyArray<Presence.Message>,
  props: Presence.Props = { isAnimated: true },
  from: Presence.State = Presence.initial,
): Presence.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => Presence.chart.transition(state, message, props)[0],
  )

describe('Presence block', () => {
  describe('chart integrity and schema serialization', () => {
    it('passes Block.problemsOf with zero unreachable states and zero dead transitions', () => {
      expect(
        Block.problemsOf({ name: 'Presence', chart: Presence.chart }),
      ).toEqual([])
    })

    it('round-trips every Presence state cleanly through Effect Schema JSON encoding', () => {
      const allStates: ReadonlyArray<Presence.State> = [
        Presence.Closed(),
        Presence.EnterStart(),
        Presence.EnterAnimating(),
        Presence.Open(),
        Presence.LeaveStart(),
        Presence.LeaveAnimating(),
      ]
      for (const state of allStates) {
        const encoded = S.encodeUnknownSync(Presence.State)(state)
        const decoded = S.decodeUnknownSync(Presence.State)(encoded)
        expect(decoded).toEqual(state)
      }
    })
  })

  describe('animated lifecycle (Closed -> EnterStart -> EnterAnimating -> Open -> LeaveStart -> LeaveAnimating -> Closed)', () => {
    it('steps through the full enter and leave animation sequence', () => {
      const enterStart = fold([Presence.Show()])
      expect(enterStart).toEqual(Presence.EnterStart())
      expect(Presence.isMounted(enterStart)).toBe(true)
      expect(Presence.isVisible(enterStart)).toBe(true)
      expect(Presence.isShowing(enterStart)).toBe(true)
      expect(Presence.isEntering(enterStart)).toBe(true)
      expect(Presence.isLeaving(enterStart)).toBe(false)
      expect(Presence.isAnimating(enterStart)).toBe(true)
      expect(Presence.isWaitingForFrame(enterStart)).toBe(true)
      expect(Presence.isWaitingForAnimationEnd(enterStart)).toBe(false)
      expect(Presence.dataStateOf(enterStart)).toBe('open')
      expect(Presence.transitionPhaseOf(enterStart)).toBe('EnterStart')

      const enterAnimating = fold(
        [Presence.AdvanceFrame()],
        { isAnimated: true },
        enterStart,
      )
      expect(enterAnimating).toEqual(Presence.EnterAnimating())
      expect(Presence.isMounted(enterAnimating)).toBe(true)
      expect(Presence.isShowing(enterAnimating)).toBe(true)
      expect(Presence.isAnimating(enterAnimating)).toBe(true)
      expect(Presence.isWaitingForFrame(enterAnimating)).toBe(false)
      expect(Presence.isWaitingForAnimationEnd(enterAnimating)).toBe(true)
      expect(Presence.dataStateOf(enterAnimating)).toBe('open')
      expect(Presence.transitionPhaseOf(enterAnimating)).toBe('EnterAnimating')

      const open = fold(
        [Presence.EndAnimation()],
        { isAnimated: true },
        enterAnimating,
      )
      expect(open).toEqual(Presence.Open())
      expect(Presence.isMounted(open)).toBe(true)
      expect(Presence.isShowing(open)).toBe(true)
      expect(Presence.isAnimating(open)).toBe(false)
      expect(Presence.dataStateOf(open)).toBe('open')
      expect(Presence.transitionPhaseOf(open)).toBe('Idle')

      const leaveStart = fold([Presence.Hide()], { isAnimated: true }, open)
      expect(leaveStart).toEqual(Presence.LeaveStart())
      expect(Presence.isMounted(leaveStart)).toBe(true)
      expect(Presence.isVisible(leaveStart)).toBe(true)
      expect(Presence.isShowing(leaveStart)).toBe(false)
      expect(Presence.isEntering(leaveStart)).toBe(false)
      expect(Presence.isLeaving(leaveStart)).toBe(true)
      expect(Presence.isAnimating(leaveStart)).toBe(true)
      expect(Presence.isWaitingForFrame(leaveStart)).toBe(true)
      expect(Presence.dataStateOf(leaveStart)).toBe('closed')
      expect(Presence.transitionPhaseOf(leaveStart)).toBe('LeaveStart')

      const leaveAnimating = fold(
        [Presence.AdvanceFrame()],
        { isAnimated: true },
        leaveStart,
      )
      expect(leaveAnimating).toEqual(Presence.LeaveAnimating())
      expect(Presence.isMounted(leaveAnimating)).toBe(true)
      expect(Presence.isShowing(leaveAnimating)).toBe(false)
      expect(Presence.isAnimating(leaveAnimating)).toBe(true)
      expect(Presence.isWaitingForAnimationEnd(leaveAnimating)).toBe(true)
      expect(Presence.dataStateOf(leaveAnimating)).toBe('closed')
      expect(Presence.transitionPhaseOf(leaveAnimating)).toBe('LeaveAnimating')

      const closed = fold(
        [Presence.EndAnimation()],
        { isAnimated: true },
        leaveAnimating,
      )
      expect(closed).toEqual(Presence.Closed())
      expect(Presence.isMounted(closed)).toBe(false)
      expect(Presence.isVisible(closed)).toBe(false)
      expect(Presence.isShowing(closed)).toBe(false)
      expect(Presence.isAnimating(closed)).toBe(false)
      expect(Presence.dataStateOf(closed)).toBe('closed')
      expect(Presence.transitionPhaseOf(closed)).toBe('Idle')
    })

    it('defaults isAnimated to true when props are omitted', () => {
      expect(fold([Presence.Show()], {})).toEqual(Presence.EnterStart())
      expect(fold([Presence.Hide()], {}, Presence.Open())).toEqual(
        Presence.LeaveStart(),
      )
    })
  })

  describe('non-animated transitions (isAnimated: false)', () => {
    it('jumps immediately between Closed and Open without frame or animation phases', () => {
      const opened = fold([Presence.Show()], { isAnimated: false })
      expect(opened).toEqual(Presence.Open())
      expect(Presence.isMounted(opened)).toBe(true)
      expect(Presence.isAnimating(opened)).toBe(false)

      const closed = fold([Presence.Hide()], { isAnimated: false }, opened)
      expect(closed).toEqual(Presence.Closed())
      expect(Presence.isMounted(closed)).toBe(false)
    })

    it('settles immediately when interrupted while isAnimated is false', () => {
      expect(
        fold([Presence.Hide()], { isAnimated: false }, Presence.EnterStart()),
      ).toEqual(Presence.Closed())
      expect(
        fold(
          [Presence.Hide()],
          { isAnimated: false },
          Presence.EnterAnimating(),
        ),
      ).toEqual(Presence.Closed())
      expect(
        fold([Presence.Show()], { isAnimated: false }, Presence.LeaveStart()),
      ).toEqual(Presence.Open())
      expect(
        fold(
          [Presence.Show()],
          { isAnimated: false },
          Presence.LeaveAnimating(),
        ),
      ).toEqual(Presence.Open())
    })
  })

  describe('interruptible enter->leave and leave->enter reversals', () => {
    it('reverses from EnterStart or EnterAnimating directly into LeaveStart', () => {
      const fromEnterStart = fold([Presence.Show(), Presence.Hide()], {
        isAnimated: true,
      })
      expect(fromEnterStart).toEqual(Presence.LeaveStart())

      const finishedFromEnterStart = fold(
        [Presence.AdvanceFrame(), Presence.EndAnimation()],
        { isAnimated: true },
        fromEnterStart,
      )
      expect(finishedFromEnterStart).toEqual(Presence.Closed())

      const fromEnterAnimating = fold(
        [Presence.Show(), Presence.AdvanceFrame(), Presence.Hide()],
        { isAnimated: true },
      )
      expect(fromEnterAnimating).toEqual(Presence.LeaveStart())
    })

    it('reverses from LeaveStart or LeaveAnimating directly into EnterStart', () => {
      const fromLeaveStart = fold(
        [Presence.Hide(), Presence.Show()],
        { isAnimated: true },
        Presence.Open(),
      )
      expect(fromLeaveStart).toEqual(Presence.EnterStart())

      const fromLeaveAnimating = fold(
        [Presence.Hide(), Presence.AdvanceFrame(), Presence.Show()],
        { isAnimated: true },
        Presence.Open(),
      )
      expect(fromLeaveAnimating).toEqual(Presence.EnterStart())

      const settledOpen = fold(
        [Presence.AdvanceFrame(), Presence.EndAnimation()],
        { isAnimated: true },
        fromLeaveAnimating,
      )
      expect(settledOpen).toEqual(Presence.Open())
    })
  })

  describe('stale-event guards', () => {
    it('explicitly ignores AdvanceFrame in states not waiting on a frame', () => {
      const nonFrameStates: ReadonlyArray<Presence.State> = [
        Presence.Closed(),
        Presence.EnterAnimating(),
        Presence.Open(),
        Presence.LeaveAnimating(),
      ]
      for (const state of nonFrameStates) {
        const result = Presence.chart.step(state, Presence.AdvanceFrame(), {
          isAnimated: true,
        })
        expect(result._tag).toBe('Ignored')
        if (result._tag === 'Ignored') {
          expect(result.reason).toBe('ExplicitlyIgnored')
        }
      }
    })

    it('explicitly ignores EndAnimation in states not actively animating', () => {
      const nonAnimatingStates: ReadonlyArray<Presence.State> = [
        Presence.Closed(),
        Presence.EnterStart(),
        Presence.Open(),
        Presence.LeaveStart(),
      ]
      for (const state of nonAnimatingStates) {
        const result = Presence.chart.step(state, Presence.EndAnimation(), {
          isAnimated: true,
        })
        expect(result._tag).toBe('Ignored')
        if (result._tag === 'Ignored') {
          expect(result.reason).toBe('ExplicitlyIgnored')
        }
      }
    })

    it('explicitly ignores redundant Show while showing and redundant Hide while hidden/leaving', () => {
      for (const state of [
        Presence.EnterStart(),
        Presence.EnterAnimating(),
        Presence.Open(),
      ]) {
        const result = Presence.chart.step(state, Presence.Show(), {
          isAnimated: true,
        })
        expect(result._tag).toBe('Ignored')
      }

      for (const state of [
        Presence.Closed(),
        Presence.LeaveStart(),
        Presence.LeaveAnimating(),
      ]) {
        const result = Presence.chart.step(state, Presence.Hide(), {
          isAnimated: true,
        })
        expect(result._tag).toBe('Ignored')
      }
    })
  })

  describe('@foldkit/ui Animation bridge, rest state, and sync tables', () => {
    it('maps round-trip between Presence.State and Animation (isShowing, transitionPhase)', () => {
      const states: ReadonlyArray<Presence.State> = [
        Presence.Closed(),
        Presence.EnterStart(),
        Presence.EnterAnimating(),
        Presence.Open(),
        Presence.LeaveStart(),
        Presence.LeaveAnimating(),
      ]
      for (const state of states) {
        expect(Presence.fromAnimation(Presence.toAnimation(state))).toEqual(
          state,
        )
      }
      expect(Presence.initialOf(false)).toEqual(Presence.Closed())
      expect(Presence.initialOf(true)).toEqual(Presence.Open())
    })

    it('settles in-flight animations in atRest and provides synced and deviceSync tables', () => {
      expect(Presence.atRest(Presence.Closed())).toEqual(Presence.Closed())
      expect(Presence.atRest(Presence.LeaveStart())).toEqual(Presence.Closed())
      expect(Presence.atRest(Presence.LeaveAnimating())).toEqual(
        Presence.Closed(),
      )
      expect(Presence.atRest(Presence.EnterStart())).toEqual(Presence.Open())
      expect(Presence.atRest(Presence.EnterAnimating())).toEqual(
        Presence.Open(),
      )
      expect(Presence.atRest(Presence.Open())).toEqual(Presence.Open())

      expect(Presence.synced.Show).toEqual(Synced())
      expect(Presence.deviceSync('OwnView').Show).toEqual(
        Device({ because: 'OwnView' }),
      )
    })
  })
})
