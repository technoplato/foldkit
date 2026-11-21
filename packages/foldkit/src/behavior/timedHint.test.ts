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
import { Device, Synced } from './pace.js'
import * as TimedHint from './timedHint.js'

describe('TimedHint block', () => {
  describe('chart integrity and schema serialization', () => {
    it('passes Block.problemsOf with zero unreachable states and zero dead transitions', () => {
      expect(Block.problemsOf(TimedHint.block)).toEqual([])
    })

    it('round-trips every TimedHint state cleanly through Effect Schema JSON encoding', () => {
      const states: ReadonlyArray<TimedHint.State> = [
        TimedHint.Hidden({ version: 0 }),
        TimedHint.Active({ version: 1, maybeDurationMs: Option.some(4000) }),
        TimedHint.Active({ version: 2, maybeDurationMs: Option.none() }),
        TimedHint.Paused({ version: 3, maybeDurationMs: Option.some(2500) }),
        TimedHint.Paused({ version: 4, maybeDurationMs: Option.none() }),
      ]
      for (const state of states) {
        const encoded = S.encodeUnknownSync(TimedHint.State)(state)
        const decoded = S.decodeUnknownSync(TimedHint.State)(encoded)
        expect(decoded).toEqual(state)
      }
    })
  })

  describe('show, auto-dismiss, and Command.answerAfter on Effect TestClock', () => {
    it('shows a timed hint, bumps version, emits WaitForHintElapsed, and dismisses when elapsed matches', () => {
      const [shown, commands] = TimedHint.chart.transition(
        TimedHint.initial,
        TimedHint.ShowHint({ maybeDurationMs: Option.some(4000) }),
      )
      expect(shown).toEqual(
        TimedHint.Active({ version: 1, maybeDurationMs: Option.some(4000) }),
      )
      expect(TimedHint.isVisible(shown)).toBe(true)
      expect(TimedHint.isActive(shown)).toBe(true)
      expect(TimedHint.isPaused(shown)).toBe(false)
      expect(TimedHint.isSticky(shown)).toBe(false)
      expect(TimedHint.versionOf(shown)).toBe(1)
      expect(TimedHint.durationMsOf(shown)).toEqual(Option.some(4000))
      expect(TimedHint.shouldAcceptElapsed(shown, 1)).toBe(true)
      expect(TimedHint.shouldAcceptElapsed(shown, 0)).toBe(false)

      expect(Array.map(commands, c => c.name)).toEqual(['WaitForHintElapsed'])
      expect(commands[0]?.args).toEqual({ version: 1, afterMs: 4000 })

      const [hidden, hideCommands] = TimedHint.chart.transition(
        shown,
        TimedHint.ElapsedHint({ version: 1 }),
      )
      expect(hidden).toEqual(TimedHint.Hidden({ version: 1 }))
      expect(hideCommands).toEqual([])
      expect(TimedHint.isVisible(hidden)).toBe(false)
      expect(TimedHint.durationMsOf(hidden)).toEqual(Option.none())
    })

    it('resolves WaitForHintElapsed after exact duration on Effect TestClock', () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const [, commands] = TimedHint.chart.transition(
            TimedHint.initial,
            TimedHint.ShowHint({ maybeDurationMs: Option.some(1500) }),
          )
          const wait = Option.getOrThrow(Array.head(commands))
          const answered = yield* Ref.make(Array.empty<TimedHint.Message>())
          const fiber = yield* Effect.forkChild(
            Effect.tap(wait.effect, message =>
              Ref.update(answered, all => [...all, message]),
            ),
          )
          yield* TestClock.adjust(Duration.millis(1499))
          expect(yield* Ref.get(answered)).toEqual([])
          yield* TestClock.adjust(Duration.millis(1))
          expect(yield* Fiber.join(fiber)).toEqual(
            TimedHint.ElapsedHint({ version: 1 }),
          )
        }).pipe(Effect.provide(TestClock.layer())),
      ))

    it('re-triggering ShowHint while Active or Paused bumps version and schedules a fresh wait', () => {
      const [first] = TimedHint.chart.transition(
        TimedHint.initial,
        TimedHint.ShowHint({ maybeDurationMs: Option.some(2000) }),
      )
      const [refreshed, refreshCommands] = TimedHint.chart.transition(
        first,
        TimedHint.ShowHint({ maybeDurationMs: Option.some(3000) }),
      )
      expect(refreshed).toEqual(
        TimedHint.Active({ version: 2, maybeDurationMs: Option.some(3000) }),
      )
      expect(refreshCommands[0]?.args).toEqual({ version: 2, afterMs: 3000 })

      // Stale elapsed from first show is ignored
      const stale = TimedHint.chart.step(
        refreshed,
        TimedHint.ElapsedHint({ version: 1 }),
      )
      expect(stale._tag === 'Ignored' ? stale.reason : stale._tag).toBe(
        'ExplicitlyIgnored',
      )

      // Re-showing from Paused returns to Active with bumped version
      const [paused] = TimedHint.chart.transition(
        refreshed,
        TimedHint.PauseHint(),
      )
      expect(paused).toEqual(
        TimedHint.Paused({ version: 3, maybeDurationMs: Option.some(3000) }),
      )
      const [reshown, reshowCommands] = TimedHint.chart.transition(
        paused,
        TimedHint.ShowHint({ maybeDurationMs: Option.some(1000) }),
      )
      expect(reshown).toEqual(
        TimedHint.Active({ version: 4, maybeDurationMs: Option.some(1000) }),
      )
      expect(reshowCommands[0]?.args).toEqual({ version: 4, afterMs: 1000 })
    })
  })

  describe('pause, resume, manual dismiss, and stale-version guards', () => {
    it('pauses on PauseHint, rejects in-flight timers, and reschedules on ResumeHint with bumped version', () => {
      const [shown] = TimedHint.chart.transition(
        TimedHint.initial,
        TimedHint.ShowHint({ maybeDurationMs: Option.some(4000) }),
      )

      const [paused, pauseCommands] = TimedHint.chart.transition(
        shown,
        TimedHint.PauseHint(),
      )
      expect(paused).toEqual(
        TimedHint.Paused({ version: 2, maybeDurationMs: Option.some(4000) }),
      )
      expect(pauseCommands).toEqual([])
      expect(TimedHint.isVisible(paused)).toBe(true)
      expect(TimedHint.isActive(paused)).toBe(false)
      expect(TimedHint.isPaused(paused)).toBe(true)
      expect(TimedHint.shouldAcceptElapsed(paused, 2)).toBe(false)

      // Both old timer (v1) and even matching version (v2) are ignored while Paused
      expect(
        TimedHint.chart.step(paused, TimedHint.ElapsedHint({ version: 1 })),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
      expect(
        TimedHint.chart.step(paused, TimedHint.ElapsedHint({ version: 2 })),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })

      // Redundant PauseHint while Paused is ignored
      expect(TimedHint.chart.step(paused, TimedHint.PauseHint())).toMatchObject(
        { _tag: 'Ignored', reason: 'ExplicitlyIgnored' },
      )

      // ResumeHint bumps version to 3 and emits fresh WaitForHintElapsed
      const [resumed, resumeCommands] = TimedHint.chart.transition(
        paused,
        TimedHint.ResumeHint(),
      )
      expect(resumed).toEqual(
        TimedHint.Active({ version: 3, maybeDurationMs: Option.some(4000) }),
      )
      expect(resumeCommands[0]?.args).toEqual({ version: 3, afterMs: 4000 })

      // Stale v1/v2 timers are ignored after resume; v3 dismisses
      expect(
        TimedHint.chart.step(resumed, TimedHint.ElapsedHint({ version: 1 })),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
      const [dismissed] = TimedHint.chart.transition(
        resumed,
        TimedHint.ElapsedHint({ version: 3 }),
      )
      expect(dismissed).toEqual(TimedHint.Hidden({ version: 3 }))
    })

    it('dismisses manually from Active or Paused and bumps version so late timers stay stale', () => {
      const [shown] = TimedHint.chart.transition(
        TimedHint.initial,
        TimedHint.ShowHint({ maybeDurationMs: Option.some(4000) }),
      )
      const [dismissed, dismissCommands] = TimedHint.chart.transition(
        shown,
        TimedHint.DismissHint(),
      )
      expect(dismissed).toEqual(TimedHint.Hidden({ version: 2 }))
      expect(dismissCommands).toEqual([])

      // Re-showing advances to version 3; old version 1 cannot dismiss it
      const [again] = TimedHint.chart.transition(
        dismissed,
        TimedHint.ShowHint({ maybeDurationMs: Option.some(4000) }),
      )
      expect(again).toEqual(
        TimedHint.Active({ version: 3, maybeDurationMs: Option.some(4000) }),
      )
      expect(
        TimedHint.chart.step(again, TimedHint.ElapsedHint({ version: 1 })),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })

      // Dismissing from Paused also returns to Hidden with bumped version
      const [paused] = TimedHint.chart.transition(again, TimedHint.PauseHint())
      const [dismissedFromPaused] = TimedHint.chart.transition(
        paused,
        TimedHint.DismissHint(),
      )
      expect(dismissedFromPaused).toEqual(TimedHint.Hidden({ version: 5 }))

      // Redundant messages while Hidden are explicitly ignored
      expect(
        TimedHint.chart.step(TimedHint.initial, TimedHint.PauseHint()),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
      expect(
        TimedHint.chart.step(TimedHint.initial, TimedHint.ResumeHint()),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
      expect(
        TimedHint.chart.step(TimedHint.initial, TimedHint.DismissHint()),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
      expect(
        TimedHint.chart.step(
          TimedHint.initial,
          TimedHint.ElapsedHint({ version: 0 }),
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
    })
  })

  describe('sticky / infinite mode', () => {
    it('emits no wait Command on ShowHint or ResumeHint and rejects ElapsedHint when maybeDurationMs is None', () => {
      const [sticky, showCommands] = TimedHint.chart.transition(
        TimedHint.initial,
        TimedHint.ShowHint({ maybeDurationMs: Option.none() }),
      )
      expect(sticky).toEqual(
        TimedHint.Active({ version: 1, maybeDurationMs: Option.none() }),
      )
      expect(showCommands).toEqual([])
      expect(TimedHint.isSticky(sticky)).toBe(true)
      expect(TimedHint.shouldAcceptElapsed(sticky, 1)).toBe(false)
      expect(
        TimedHint.chart.step(sticky, TimedHint.ElapsedHint({ version: 1 })),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })

      const [paused] = TimedHint.chart.transition(sticky, TimedHint.PauseHint())
      expect(TimedHint.isSticky(paused)).toBe(true)

      const [resumed, resumeCommands] = TimedHint.chart.transition(
        paused,
        TimedHint.ResumeHint(),
      )
      expect(resumed).toEqual(
        TimedHint.Active({ version: 3, maybeDurationMs: Option.none() }),
      )
      expect(resumeCommands).toEqual([])
    })
  })

  describe('helpers, rest state, and sync tables', () => {
    it('reconstructs state via fromFields, resets to Hidden in atRest, and exposes sync tables', () => {
      expect(TimedHint.nextVersion(0)).toBe(1)
      expect(
        TimedHint.fromFields({
          isVisible: false,
          isPaused: false,
          version: 2,
          maybeDurationMs: Option.some(4000),
        }),
      ).toEqual(TimedHint.Hidden({ version: 2 }))
      expect(
        TimedHint.fromFields({
          isVisible: true,
          isPaused: false,
          version: 2,
          maybeDurationMs: Option.some(4000),
        }),
      ).toEqual(
        TimedHint.Active({ version: 2, maybeDurationMs: Option.some(4000) }),
      )
      expect(
        TimedHint.fromFields({
          isVisible: true,
          isPaused: true,
          version: 2,
          maybeDurationMs: Option.none(),
        }),
      ).toEqual(
        TimedHint.Paused({ version: 2, maybeDurationMs: Option.none() }),
      )

      expect(
        TimedHint.atRest(
          TimedHint.Active({ version: 5, maybeDurationMs: Option.some(4000) }),
        ),
      ).toEqual(TimedHint.Hidden({ version: 5 }))

      expect(TimedHint.synced.ShowHint).toEqual(Synced())
      expect(TimedHint.deviceSync('InputInProgress').ShowHint).toEqual(
        Device({ because: 'InputInProgress' }),
      )
      expect(TimedHint.sync.ElapsedHint).toEqual(Device({ because: 'OwnView' }))
      expect(TimedHint.isMessage(TimedHint.PauseHint())).toBe(true)
    })
  })
})
