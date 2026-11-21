import { Array, Duration, Effect, Fiber, Option, Schema as S } from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import { Device, Sampled, Synced } from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'
import * as Timer from './timer.js'

const stopwatchProps: Timer.Props = {
  id: 'run-watch',
  countdown: false,
  startMs: 0,
  intervalMs: 1000,
  label: 'Stopwatch',
}

const countdownProps: Timer.Props = {
  id: 'pomodoro',
  countdown: true,
  startMs: 5000,
  targetMs: 0,
  intervalMs: 1000,
  label: 'Focus countdown',
}

const fold = (
  messages: ReadonlyArray<Timer.Message>,
  props: Timer.Props = stopwatchProps,
  from: Timer.State = Timer.initial,
): Timer.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => Timer.chart.transition(state, message, props)[0],
  )

describe('core Timer Part', () => {
  describe('declaration, chart integrity, IDs, sync paces, and schema round-trip', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(Timer.part)).toEqual([])
      expect(Part.problemsOf(Timer.make({ sampleMs: 500 }))).toEqual([])
      expect(Part.problemsOf(Timer.deviceOnly())).toEqual([])
      expect(Part.problemsOf(Timer.make({ sync: 'OwnView' }))).toEqual([])
      expect(Block.problemsOf({ name: 'Timer', chart: Timer.chart })).toEqual(
        [],
      )

      for (const action of Timer.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })

    it('derives element IDs and sync paces cleanly', () => {
      expect(Timer.rootId('run-watch')).toBe('run-watch-root')
      expect(Timer.areaId('run-watch')).toBe('run-watch-area')
      expect(Timer.controlId('run-watch')).toBe('run-watch-control')
      expect(Timer.startTriggerId('run-watch')).toBe('run-watch-start')
      expect(Timer.pauseTriggerId('run-watch')).toBe('run-watch-pause')
      expect(Timer.resumeTriggerId('run-watch')).toBe('run-watch-resume')
      expect(Timer.resetTriggerId('run-watch')).toBe('run-watch-reset')
      expect(Timer.lapTriggerId('run-watch')).toBe('run-watch-lap')
      expect(Timer.itemId('run-watch', 'Minutes')).toBe(
        'run-watch-item-minutes',
      )

      expect(Timer.synced.StartTimer).toEqual(Synced())
      expect(Timer.synced.PauseTimer).toEqual(Synced())
      expect(Timer.synced.ResumeTimer).toEqual(Synced())
      expect(Timer.synced.ResetTimer).toEqual(Synced())
      expect(Timer.synced.LapTimer).toEqual(Synced())
      expect(Timer.synced.TickTimer).toEqual(Sampled({ everyMs: 1000 }))
      expect(Timer.synced.ElapsedTimerInterval).toEqual(
        Sampled({ everyMs: 1000 }),
      )
      expect(Timer.paceOf(Timer.TickTimer({ nowMs: 2000 }), 250)).toEqual(
        Sampled({ everyMs: 250 }),
      )
      expect(Timer.deviceSync('OwnView').TickTimer).toEqual(
        Device({ because: 'OwnView' }),
      )
    })

    it('round-trips Idle, Running, Paused, and Completed states through Effect Schema JSON encoding', () => {
      const running = fold([
        Timer.StartedTimer({ nowMs: 1000 }),
        Timer.TickTimer({ nowMs: 2500 }),
        Timer.LapTimer(),
      ])
      const paused = fold([Timer.PauseTimer()], stopwatchProps, running)
      const completed = fold(
        [Timer.StartedTimer({ nowMs: 0 }), Timer.TickTimer({ nowMs: 5000 })],
        countdownProps,
      )

      for (const state of [Timer.initial, running, paused, completed]) {
        const encoded = S.encodeUnknownSync(Timer.State)(state)
        const decoded = S.decodeUnknownSync(Timer.State)(encoded)
        expect(decoded).toEqual(state)
      }
    })
  })

  describe('pure formatting helpers', () => {
    it('splits and formats durations across days, hours, minutes, seconds, and milliseconds', () => {
      expect(Timer.partsOf(0)).toEqual({
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        milliseconds: 0,
      })
      expect(Timer.partsOf(-500)).toEqual({
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        milliseconds: 0,
      })
      expect(Timer.partsOf(90_061_250)).toEqual({
        days: 1,
        hours: 1,
        minutes: 1,
        seconds: 1,
        milliseconds: 250,
      })
      expect(Timer.formattedOf(65_005)).toEqual({
        days: '00',
        hours: '00',
        minutes: '01',
        seconds: '05',
        milliseconds: '005',
      })
      expect(Timer.clockTextOf(3_665_000)).toBe('01:01:05')
      expect(Timer.clockTextOf(90_061_000)).toBe('1d 01:01:01')
      expect(Timer.areaLabelOf(65_000)).toBe('0 days 00:01:05')
    })
  })

  describe('stopwatch and countdown stepping, laps, target updates, and WaitForTimerTick', () => {
    it('steps stopwatch purely via StartedTimer / TickTimer / Pause / ResumedTimer / Lap / Reset', () => {
      const started = fold([Timer.StartedTimer({ nowMs: 1000 })])
      expect(Timer.isRunning(started)).toBe(true)
      expect(Timer.currentMsOf(started, stopwatchProps)).toBe(0)

      const ticked = fold(
        [Timer.TickTimer({ nowMs: 2500 })],
        stopwatchProps,
        started,
      )
      expect(Timer.currentMsOf(ticked, stopwatchProps)).toBe(1500)

      const lapped = fold([Timer.LapTimer()], stopwatchProps, ticked)
      expect(Timer.lapsOf(lapped)).toEqual([1500])

      const paused = fold([Timer.PauseTimer()], stopwatchProps, lapped)
      expect(Timer.isPaused(paused)).toBe(true)
      expect(Timer.currentMsOf(paused, stopwatchProps)).toBe(1500)

      // Paused interval (2500 -> 8000) must not count when resumed at 8000
      const resumed = fold(
        [Timer.ResumedTimer({ nowMs: 8000 })],
        stopwatchProps,
        paused,
      )
      const afterResume = fold(
        [Timer.TickTimer({ nowMs: 9250 }), Timer.LapTimer()],
        stopwatchProps,
        resumed,
      )
      expect(Timer.currentMsOf(afterResume, stopwatchProps)).toBe(2750)
      expect(Timer.lapsOf(afterResume)).toEqual([1500, 2750])

      const reset = fold([Timer.ResetTimer()], stopwatchProps, afterResume)
      expect(Timer.isIdle(reset)).toBe(true)
      expect(Timer.currentMsOf(reset, stopwatchProps)).toBe(0)
      expect(Timer.lapsOf(reset)).toEqual([])
    })

    it('counts down to targetMs, reaches Completed, and supports SetTimerTarget and restart', () => {
      const [started, startCommands] = Timer.chart.transition(
        Timer.initial,
        Timer.StartedTimer({ nowMs: 100 }),
        countdownProps,
      )
      expect(Timer.currentMsOf(started, countdownProps)).toBe(5000)
      expect(startCommands.length).toBe(1)

      const mid = fold(
        [Timer.TickTimer({ nowMs: 2600 })],
        countdownProps,
        started,
      )
      expect(Timer.isRunning(mid)).toBe(true)
      expect(Timer.currentMsOf(mid, countdownProps)).toBe(2500)
      expect(Timer.progressRatioOf(mid, countdownProps)).toBe(0.5)

      const [done, doneCommands] = Timer.chart.transition(
        mid,
        Timer.TickTimer({ nowMs: 6000 }),
        countdownProps,
      )
      expect(Timer.isCompleted(done)).toBe(true)
      expect(Timer.dataStateOf(done)).toBe('completed')
      expect(Timer.currentMsOf(done, countdownProps)).toBe(0)
      expect(Timer.progressRatioOf(done, countdownProps)).toBe(1)
      expect(doneCommands).toEqual([])

      // Restarting from Completed resets back to startMs
      const restarted = fold([Timer.StartTimer()], countdownProps, done)
      expect(Timer.isRunning(restarted)).toBe(true)
      expect(Timer.currentMsOf(restarted, countdownProps)).toBe(5000)

      // Dynamically setting target >= currentMs completes immediately in countdown
      const targetCompleted = fold(
        [Timer.SetTimerTarget({ targetMs: 5000 })],
        countdownProps,
        restarted,
      )
      expect(Timer.isCompleted(targetCompleted)).toBe(true)
    })

    it('drives WaitForTimerTick via TestClock and ignores stale interval versions after pause', async () => {
      const [running, commands] = Timer.chart.transition(
        Timer.initial,
        Timer.StartTimer(),
        countdownProps,
      )
      const waitCommand = Option.getOrThrow(Array.head(commands))
      expect(waitCommand.name).toBe('WaitForTimerTick')

      const elapsed = await Effect.runPromise(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(waitCommand.effect)
          yield* TestClock.adjust(Duration.millis(1000))
          return yield* Fiber.join(fiber)
        }).pipe(Effect.provide(TestClock.layer())),
      )

      const [afterTick, nextCommands] = Timer.chart.transition(
        running,
        elapsed,
        countdownProps,
      )
      expect(Timer.currentMsOf(afterTick, countdownProps)).toBe(4000)
      expect(nextCommands.length).toBe(1)

      // Pausing bumps version so the older elapsed interval is ignored
      const paused = fold([Timer.PauseTimer()], countdownProps, running)
      const resumed = fold([Timer.ResumeTimer()], countdownProps, paused)
      const afterStale = fold([elapsed], countdownProps, resumed)
      expect(Timer.currentMsOf(afterStale, countdownProps)).toBe(5000)
    })

    it('atRest pauses a running timer and preserves resting states', () => {
      const running = fold([
        Timer.StartedTimer({ nowMs: 0 }),
        Timer.TickTimer({ nowMs: 2000 }),
      ])
      const rested = Timer.atRest(running)
      expect(Timer.isPaused(rested)).toBe(true)
      expect(Timer.currentMsOf(rested, stopwatchProps)).toBe(2000)
      expect(Timer.atRest(Timer.initial)).toEqual(Timer.initial)
    })
  })

  describe('reference-stable SlotBindings and Part.compose', () => {
    it('projects all 9 slots with ARIA metadata and preserves unchanged slot references', () => {
      const idleView = Part.view(Timer.part, Timer.initial, stopwatchProps)
      const idleViewAgain = Part.view(Timer.part, Timer.initial, stopwatchProps)
      expect(idleViewAgain).toBe(idleView)
      const idleRoot = idleView.slot('Root')
      const idleControl = idleView.slot('Control')
      expect(idleView.slot('StartTrigger')).toBe(
        idleViewAgain.slot('StartTrigger'),
      )

      expect(Slot.ariaOf(idleView.slot('Area'))).toMatchObject({
        role: 'status',
        id: 'run-watch-area',
        'aria-atomic': 'true',
        'aria-valuetext': '00:00:00',
      })
      expect(idleView.slot('StartTrigger').isHidden).toBeUndefined()
      expect(idleView.slot('PauseTrigger').isHidden).toBe(true)
      expect(idleView.slot('ResumeTrigger').isHidden).toBe(true)
      expect(idleView.slot('LapTrigger').isDisabled).toBe(true)

      const running = fold([
        Timer.StartedTimer({ nowMs: 0 }),
        Timer.TickTimer({ nowMs: 65_000 }),
      ])
      const runningView = Part.view(Timer.part, running, stopwatchProps)
      // Root and Control did not change so Part.view preserves their exact references
      expect(runningView.slot('Root')).toBe(idleRoot)
      expect(runningView.slot('Control')).toBe(idleControl)
      expect(runningView.slot('StartTrigger').isHidden).toBe(true)
      expect(runningView.slot('PauseTrigger').isHidden).toBeUndefined()
      expect(runningView.slot('LapTrigger').isDisabled).toBeUndefined()
      expect(Slot.ariaOf(runningView.slot('Item', 'Minutes'))).toMatchObject({
        id: 'run-watch-item-minutes',
        'aria-valuenow': '1',
        'aria-valuetext': '01',
      })
      expect(Slot.ariaOf(runningView.slot('Item', 'Seconds'))).toMatchObject({
        id: 'run-watch-item-seconds',
        'aria-valuenow': '5',
        'aria-valuetext': '05',
      })
    })

    it('composes cleanly into a Program with Part.compose', () => {
      const Base = makeProgram({
        id: 'timer-compose-test',
        version: 1,
        Model: S.Struct({ title: S.String }),
        Message: S.TaggedStruct('UpdatedTitle', { title: S.String }),
        init: () => [{ title: 'Workout' }, []],
        update: (model, message) => [{ ...model, title: message.title }, []],
      })
      const App = Part.compose({
        of: Base,
        parts: [Part.given(Timer.part, () => stopwatchProps)],
      })
      const [initModel] = App.init()
      const [startedModel] = App.update(initModel, Timer.StartTimer())
      expect(Timer.isRunning(startedModel.parts['Timer'])).toBe(true)
    })
  })
})
