import { Array, Duration, Effect, Fiber, Option, Schema as S } from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import * as Clipboard from './clipboard.js'
import { Device, Synced } from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'

const baseProps: Clipboard.Props = {
  id: 'invite-link',
  defaultValue: 'https://foldkit.dev/join/abc',
  timeoutMs: 3000,
  hasLabel: true,
}

const fold = (
  messages: ReadonlyArray<Clipboard.Message>,
  props: Clipboard.Props = baseProps,
  from: Clipboard.State = Clipboard.initial,
): Clipboard.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => Clipboard.chart.transition(state, message, props)[0],
  )

describe('core Clipboard Part', () => {
  describe('declaration, chart integrity, IDs, sync, and schema round-trip', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(Clipboard.part)).toEqual([])
      expect(Part.problemsOf(Clipboard.deviceOnly())).toEqual([])
      expect(Part.problemsOf(Clipboard.make({ sync: 'OwnView' }))).toEqual([])
      expect(
        Block.problemsOf({ name: 'Clipboard', chart: Clipboard.chart }),
      ).toEqual([])

      for (const action of Clipboard.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })

    it('derives element IDs and sync tables', () => {
      expect(Clipboard.rootId('invite-link')).toBe('invite-link-root')
      expect(Clipboard.labelId('invite-link')).toBe('invite-link-label')
      expect(Clipboard.controlId('invite-link')).toBe('invite-link-control')
      expect(Clipboard.inputId('invite-link')).toBe('invite-link-input')
      expect(Clipboard.triggerId('invite-link')).toBe('invite-link-trigger')
      expect(Clipboard.indicatorId('invite-link')).toBe('invite-link-indicator')

      expect(Clipboard.synced.SetClipboardValue).toEqual(Synced())
      expect(Clipboard.synced.CopyClipboard).toEqual(Synced())
      expect(Clipboard.synced.SucceededClipboardCopy).toEqual(Synced())
      expect(Clipboard.synced.FailedClipboardCopy).toEqual(Synced())
      expect(Clipboard.synced.ElapsedClipboardHint).toEqual(Synced())
      expect(Clipboard.deviceSync().CopyClipboard).toEqual(
        Device({ because: 'DeviceEffect' }),
      )
      expect(Clipboard.deviceOnly().sync.CopyClipboard).toEqual(
        Device({ because: 'DeviceEffect' }),
      )
    })

    it('round-trips Idle, Copying, Copied, and Failed states through Effect Schema JSON encoding', () => {
      const copying = fold([
        Clipboard.SetClipboardValue({ value: 'pnpm test' }),
        Clipboard.CopyClipboard(),
      ])
      const copied = fold(
        [Clipboard.SucceededClipboardCopy()],
        baseProps,
        copying,
      )
      const failed = fold(
        [Clipboard.FailedClipboardCopy({ reason: 'Permission denied' })],
        baseProps,
        copying,
      )

      for (const state of [Clipboard.initial, copying, copied, failed]) {
        const encoded = S.encodeUnknownSync(Clipboard.State)(state)
        const decoded = S.decodeUnknownSync(Clipboard.State)(encoded)
        expect(decoded).toEqual(state)
      }
    })
  })

  describe('copy workflow, TimedHint auto-reset, failure, and recovery', () => {
    it('tracks Idle -> Copying -> Copied -> Idle via WaitForClipboardHintElapsed and TestClock', async () => {
      const withValue = fold([
        Clipboard.SetClipboardValue({ value: 'foldkit copy' }),
      ])
      expect(Clipboard.valueOf(withValue, baseProps)).toBe('foldkit copy')
      expect(Clipboard.copiedOf(withValue)).toBe(false)
      expect(Clipboard.pendingCopyTextOf(withValue)).toEqual(Option.none())

      const copying = fold([Clipboard.CopyClipboard()], baseProps, withValue)
      expect(Clipboard.isCopying(copying)).toBe(true)
      expect(Clipboard.copiedOf(copying)).toBe(false)
      expect(Clipboard.pendingCopyTextOf(copying)).toEqual(
        Option.some('foldkit copy'),
      )

      const [copied, commands] = Clipboard.chart.transition(
        copying,
        Clipboard.SucceededClipboardCopy(),
        baseProps,
      )
      expect(Clipboard.copiedOf(copied)).toBe(true)
      expect(Clipboard.dataStateOf(copied)).toBe('copied')
      expect(Clipboard.pendingCopyTextOf(copied)).toEqual(Option.none())
      expect(Clipboard.copiedTextOf(copied)).toEqual(
        Option.some('foldkit copy'),
      )

      const waitCommand = Option.getOrThrow(Array.head(commands))
      expect(waitCommand.name).toBe('WaitForClipboardHintElapsed')

      const elapsed = await Effect.runPromise(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(waitCommand.effect)
          yield* TestClock.adjust(Duration.millis(3000))
          return yield* Fiber.join(fiber)
        }).pipe(Effect.provide(TestClock.layer())),
      )

      const backToIdle = fold([elapsed], baseProps, copied)
      expect(Clipboard.isIdle(backToIdle)).toBe(true)
      expect(Clipboard.copiedOf(backToIdle)).toBe(false)
      expect(Clipboard.valueOf(backToIdle, baseProps)).toBe('foldkit copy')

      // Stale elapsed version after a second copy is ignored
      const recopied = fold(
        [Clipboard.CopyClipboard(), Clipboard.SucceededClipboardCopy()],
        baseProps,
        copied,
      )
      const afterStale = fold([elapsed], baseProps, recopied)
      expect(Clipboard.copiedOf(afterStale)).toBe(true)
    })

    it('handles copy failures, explicit text override, disabled guard, value change dismissal, sticky mode, and Reset', () => {
      const copying = fold([
        Clipboard.RequestedClipboardCopy({ text: 'custom-snippet' }),
      ])
      expect(Clipboard.pendingCopyTextOf(copying)).toEqual(
        Option.some('custom-snippet'),
      )

      const failed = fold(
        [Clipboard.FailedClipboardCopy({ reason: 'Clipboard unavailable' })],
        baseProps,
        copying,
      )
      expect(Clipboard.isFailed(failed)).toBe(true)
      expect(Clipboard.copiedOf(failed)).toBe(false)
      expect(Clipboard.failureReasonOf(failed)).toEqual(
        Option.some('Clipboard unavailable'),
      )

      // Disabled ignores copy requests
      const disabledProps: Clipboard.Props = { ...baseProps, isDisabled: true }
      expect(
        Clipboard.isIdle(fold([Clipboard.CopyClipboard()], disabledProps)),
      ).toBe(true)

      // Sticky mode (timeoutMs: 0) emits no timer command
      const stickyProps: Clipboard.Props = { ...baseProps, timeoutMs: 0 }
      const [stickyCopied, stickyCommands] = Clipboard.chart.transition(
        copying,
        Clipboard.SucceededClipboardCopy(),
        stickyProps,
      )
      expect(Clipboard.copiedOf(stickyCopied)).toBe(true)
      expect(stickyCommands).toEqual([])

      // Changing value while Copied dismisses copied feedback
      const changed = fold(
        [Clipboard.SetClipboardValue({ value: 'next-value' })],
        baseProps,
        stickyCopied,
      )
      expect(Clipboard.isIdle(changed)).toBe(true)
      expect(Clipboard.copiedOf(changed)).toBe(false)

      const reset = fold([Clipboard.ResetClipboard()], baseProps, stickyCopied)
      expect(Clipboard.isIdle(reset)).toBe(true)
      expect(Clipboard.valueOf(reset, baseProps)).toBe(
        'https://foldkit.dev/join/abc',
      )

      // atRest returns Copying/Copied/Failed back to Idle preserving value
      expect(Clipboard.isIdle(Clipboard.atRest(stickyCopied))).toBe(true)
      expect(Clipboard.isIdle(Clipboard.atRest(failed))).toBe(true)
    })
  })

  describe('reference-stable SlotBindings and Part.compose', () => {
    it('projects all 6 slots with ARIA attributes and preserves unchanged slot references', () => {
      const idleView = Part.view(Clipboard.part, Clipboard.initial, baseProps)
      const idleViewAgain = Part.view(
        Clipboard.part,
        Clipboard.initial,
        baseProps,
      )
      expect(idleViewAgain).toBe(idleView)
      const idleRoot = idleView.slot('Root')
      const idleLabel = idleView.slot('Label')
      const idleInput = idleView.slot('Input')

      expect(Slot.ariaOf(idleInput)).toMatchObject({
        role: 'textbox',
        id: 'invite-link-input',
        'aria-readonly': 'true',
        'aria-labelledby': 'invite-link-label',
      })
      expect(Slot.ariaOf(idleView.slot('Trigger'))).toMatchObject({
        role: 'button',
        id: 'invite-link-trigger',
        'aria-label': 'Copy to clipboard',
        'aria-pressed': 'false',
      })
      expect(idleView.slot('Indicator').isHidden).toBe(true)
      expect(idleView.slot('Indicator', 'idle').isHidden).toBeUndefined()

      const copied = fold([
        Clipboard.CopyClipboard(),
        Clipboard.SucceededClipboardCopy(),
      ])
      const copiedView = Part.view(Clipboard.part, copied, baseProps)
      expect(copiedView.slot('Root')).toBe(idleRoot)
      expect(copiedView.slot('Label')).toBe(idleLabel)
      expect(copiedView.slot('Input')).toBe(idleInput)
      expect(Slot.ariaOf(copiedView.slot('Trigger'))).toMatchObject({
        'aria-label': 'Copied to clipboard',
        'aria-pressed': 'true',
      })
      expect(copiedView.slot('Indicator').isHidden).toBeUndefined()
      expect(copiedView.slot('Indicator', 'idle').isHidden).toBe(true)
    })

    it('composes cleanly into a Program with Part.compose', () => {
      const Base = makeProgram({
        id: 'clipboard-compose-test',
        version: 1,
        Model: S.Struct({ title: S.String }),
        Message: S.TaggedStruct('UpdatedTitle', { title: S.String }),
        init: () => [{ title: 'Share' }, []],
        update: (model, message) => [{ ...model, title: message.title }, []],
      })
      const App = Part.compose({
        of: Base,
        parts: [Part.given(Clipboard.part, () => baseProps)],
      })
      const [initModel] = App.init()
      const [copyingModel] = App.update(initModel, Clipboard.CopyClipboard())
      expect(
        Clipboard.pendingCopyTextOf(copyingModel.parts['Clipboard']),
      ).toEqual(Option.some('https://foldkit.dev/join/abc'))
    })
  })
})
