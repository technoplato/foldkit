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
import * as Presence from './presence.js'
import * as Slot from './slot.js'
import * as TimedHint from './timedHint.js'
import * as Toast from './toast.js'

const baseProps: Toast.Props = {
  id: 'app-toast',
  position: 'BottomRight',
  defaultDurationMs: 4000,
}

const fold = (
  messages: ReadonlyArray<Toast.Message>,
  props: Toast.Props = baseProps,
  from: Toast.State = Toast.initial,
): Toast.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => Toast.chart.transition(state, message, props)[0],
  )

describe('core Toast Part', () => {
  describe('declaration, chart integrity, and schema serialization', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(Toast.part)).toEqual([])
      expect(Part.problemsOf(Toast.deviceOnly())).toEqual([])
      expect(Part.problemsOf(Toast.make({ sync: 'OwnView' }))).toEqual([])
      expect(Block.problemsOf({ name: 'Toast', chart: Toast.chart })).toEqual(
        [],
      )

      for (const action of Toast.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })

    it('round-trips Empty and Showing Toast states through Effect Schema JSON encoding', () => {
      const showing = fold([
        Toast.ShowToast({
          title: 'Saved',
          description: 'Changes were persisted.',
          variant: 'Success',
        }),
        Toast.ShowToast({
          title: 'Offline',
          variant: 'Warning',
          isSticky: true,
        }),
      ])
      for (const state of [Toast.initial, showing]) {
        const encoded = S.encodeUnknownSync(Toast.State)(state)
        const decoded = S.decodeUnknownSync(Toast.State)(encoded)
        expect(decoded).toEqual(state)
      }
    })

    it('maps Variants to ARIA roles and live politeness and derives element IDs', () => {
      expect(Toast.variantRoleOf('Info')).toBe('Status')
      expect(Toast.variantRoleOf('Success')).toBe('Status')
      expect(Toast.variantRoleOf('Warning')).toBe('Alert')
      expect(Toast.variantRoleOf('Error')).toBe('Alert')

      expect(Toast.variantAriaRoleOf('Info')).toBe('status')
      expect(Toast.variantAriaRoleOf('Success')).toBe('status')
      expect(Toast.variantAriaRoleOf('Warning')).toBe('alert')
      expect(Toast.variantAriaRoleOf('Error')).toBe('alert')

      expect(Toast.variantLiveOf('Info')).toBe('Polite')
      expect(Toast.variantLiveOf('Success')).toBe('Polite')
      expect(Toast.variantLiveOf('Warning')).toBe('Assertive')
      expect(Toast.variantLiveOf('Error')).toBe('Assertive')

      expect(Toast.regionId('app-toast')).toBe('app-toast-region')
      expect(Toast.entryId('app-toast', 0)).toBe('app-toast-entry-0')
      expect(Toast.titleId('app-toast-entry-0')).toBe('app-toast-entry-0-title')
      expect(Toast.descriptionId('app-toast-entry-0')).toBe(
        'app-toast-entry-0-description',
      )
      expect(Toast.dismissButtonId('app-toast-entry-0')).toBe(
        'app-toast-entry-0-dismiss',
      )
      expect(Toast.isDismissKey('Escape')).toBe(true)
      expect(Toast.isDismissKey('Enter')).toBe(false)
    })
  })

  describe('stacking, auto-dismiss, sticky entries, hover pause/resume, and Dismiss/DismissAll', () => {
    it('shows stacked entries with monotonic IDs, emits WaitForToastElapsed, and auto-dismisses on matching ElapsedToast', () => {
      const [firstState, firstCommands] = Toast.chart.transition(
        Toast.initial,
        Toast.ShowToast({ title: 'Saved', variant: 'Success' }),
        baseProps,
      )
      expect(Toast.isEmpty(firstState)).toBe(false)
      expect(Toast.entryCountOf(firstState)).toBe(1)
      expect(Toast.nextEntryKeyOf(firstState)).toBe(1)

      const firstEntry = Option.getOrThrow(
        Toast.entryById(firstState, 'app-toast-entry-0'),
      )
      expect(firstEntry.variant).toBe('Success')
      expect(firstEntry.title).toBe('Saved')
      expect(firstEntry.presence).toEqual(Presence.Open())
      expect(firstEntry.hint).toEqual(
        TimedHint.Active({ version: 1, maybeDurationMs: Option.some(4000) }),
      )
      expect(Array.map(firstCommands, c => c.name)).toEqual([
        'WaitForToastElapsed',
      ])
      expect(firstCommands[0]?.args).toEqual({
        entryId: 'app-toast-entry-0',
        version: 1,
        afterMs: 4000,
      })

      const [secondState, secondCommands] = Toast.chart.transition(
        firstState,
        Toast.ShowToast({
          title: 'Failed to sync',
          description: 'Check your network connection.',
          variant: 'Error',
          durationMs: 6000,
        }),
        baseProps,
      )
      expect(Toast.entryCountOf(secondState)).toBe(2)
      expect(Toast.nextEntryKeyOf(secondState)).toBe(2)
      expect(secondCommands[0]?.args).toEqual({
        entryId: 'app-toast-entry-1',
        version: 1,
        afterMs: 6000,
      })

      // Stale ElapsedToast is ignored
      expect(
        Toast.chart.step(
          secondState,
          Toast.ElapsedToast({ entryId: 'app-toast-entry-0', version: 0 }),
          baseProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })

      // Matching ElapsedToast removes entry-0, keeping entry-1 in Showing
      const [afterFirstElapsed] = Toast.chart.transition(
        secondState,
        Toast.ElapsedToast({ entryId: 'app-toast-entry-0', version: 1 }),
        baseProps,
      )
      expect(Toast.entryCountOf(afterFirstElapsed)).toBe(1)
      expect(
        Option.isSome(Toast.entryById(afterFirstElapsed, 'app-toast-entry-1')),
      ).toBe(true)

      // Matching ElapsedToast on last entry returns to Empty while preserving nextEntryKey
      const [afterSecondElapsed] = Toast.chart.transition(
        afterFirstElapsed,
        Toast.ElapsedToast({ entryId: 'app-toast-entry-1', version: 1 }),
        baseProps,
      )
      expect(afterSecondElapsed).toEqual(Toast.Empty({ nextEntryKey: 2 }))
    })

    it('resolves WaitForToastElapsed via Command.answerAfter on Effect TestClock', () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const [, commands] = Toast.chart.transition(
            Toast.initial,
            Toast.ShowToast({ title: 'Copied', durationMs: 2000 }),
            baseProps,
          )
          const wait = Option.getOrThrow(Array.head(commands))
          const answered = yield* Ref.make(Array.empty<Toast.Message>())
          const fiber = yield* Effect.forkChild(
            Effect.tap(wait.effect, message =>
              Ref.update(answered, all => [...all, message]),
            ),
          )
          yield* TestClock.adjust(Duration.millis(1999))
          expect(yield* Ref.get(answered)).toEqual([])
          yield* TestClock.adjust(Duration.millis(1))
          expect(yield* Fiber.join(fiber)).toEqual(
            Toast.ElapsedToast({ entryId: 'app-toast-entry-0', version: 1 }),
          )
        }).pipe(Effect.provide(TestClock.layer())),
      ))

    it('supports sticky entries (isSticky wins over durationMs) with no wait Command', () => {
      const [stickyState, commands] = Toast.chart.transition(
        Toast.initial,
        Toast.ShowToast({
          title: 'Action required',
          variant: 'Warning',
          durationMs: 1000,
          isSticky: true,
        }),
        baseProps,
      )
      expect(commands).toEqual([])
      const entry = Option.getOrThrow(
        Toast.entryById(stickyState, 'app-toast-entry-0'),
      )
      expect(TimedHint.isSticky(entry.hint)).toBe(true)
      expect(
        Toast.chart.step(
          stickyState,
          Toast.ElapsedToast({ entryId: 'app-toast-entry-0', version: 1 }),
          baseProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })

      // Hover/leave on sticky entry still toggles paused without emitting waits
      const [hovered] = Toast.chart.transition(
        stickyState,
        Toast.HoverToast({ entryId: 'app-toast-entry-0' }),
        baseProps,
      )
      expect(Toast.isEntryPaused(hovered, 'app-toast-entry-0')).toBe(true)
      const [left, leaveCommands] = Toast.chart.transition(
        hovered,
        Toast.LeaveToast({ entryId: 'app-toast-entry-0' }),
        baseProps,
      )
      expect(Toast.isEntryPaused(left, 'app-toast-entry-0')).toBe(false)
      expect(leaveCommands).toEqual([])
    })

    it('pauses auto-dismiss on HoverToast (invalidating pending version) and reschedules on LeaveToast', () => {
      const [shown] = Toast.chart.transition(
        Toast.initial,
        Toast.ShowToast({ title: 'Uploaded', durationMs: 3000 }),
        baseProps,
      )

      const [hovered, hoverCommands] = Toast.chart.transition(
        shown,
        Toast.HoverToast({ entryId: 'app-toast-entry-0' }),
        baseProps,
      )
      expect(hoverCommands).toEqual([])
      expect(Toast.isEntryPaused(hovered, 'app-toast-entry-0')).toBe(true)

      // In-flight timer (v1) is rejected while hovered
      expect(
        Toast.chart.step(
          hovered,
          Toast.ElapsedToast({ entryId: 'app-toast-entry-0', version: 1 }),
          baseProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })

      // LeaveToast bumps version to 3 and emits fresh WaitForToastElapsed
      const [resumed, resumeCommands] = Toast.chart.transition(
        hovered,
        Toast.LeaveToast({ entryId: 'app-toast-entry-0' }),
        baseProps,
      )
      expect(Toast.isEntryPaused(resumed, 'app-toast-entry-0')).toBe(false)
      expect(resumeCommands[0]?.args).toEqual({
        entryId: 'app-toast-entry-0',
        version: 3,
        afterMs: 3000,
      })

      // Old v1 timer stays stale after resume; v3 dismisses
      expect(
        Toast.chart.step(
          resumed,
          Toast.ElapsedToast({ entryId: 'app-toast-entry-0', version: 1 }),
          baseProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })

      const [cleared] = Toast.chart.transition(
        resumed,
        Toast.ElapsedToast({ entryId: 'app-toast-entry-0', version: 3 }),
        baseProps,
      )
      expect(cleared).toEqual(Toast.Empty({ nextEntryKey: 1 }))

      // When pauseOnHover is false, HoverToast and LeaveToast are ignored
      const noPauseProps: Toast.Props = { ...baseProps, pauseOnHover: false }
      expect(
        Toast.chart.step(
          shown,
          Toast.HoverToast({ entryId: 'app-toast-entry-0' }),
          noPauseProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
    })

    it('handles DismissToast and DismissAllToasts immediately when non-animated', () => {
      const two = fold([
        Toast.ShowToast({ title: 'One' }),
        Toast.ShowToast({ title: 'Two' }),
      ])
      const [oneLeft] = Toast.chart.transition(
        two,
        Toast.DismissToast({ entryId: 'app-toast-entry-0' }),
        baseProps,
      )
      expect(Toast.entryCountOf(oneLeft)).toBe(1)
      expect(Option.isSome(Toast.entryById(oneLeft, 'app-toast-entry-1'))).toBe(
        true,
      )

      const three = fold(
        [Toast.ShowToast({ title: 'Three' })],
        baseProps,
        oneLeft,
      )
      expect(Toast.entryCountOf(three)).toBe(2)

      const [cleared] = Toast.chart.transition(
        three,
        Toast.DismissAllToasts(),
        baseProps,
      )
      expect(cleared).toEqual(Toast.Empty({ nextEntryKey: 3 }))

      // Dismissing while Empty is ignored
      expect(
        Toast.chart.step(cleared, Toast.DismissAllToasts(), baseProps),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
    })

    it('enforces maxVisible cap in both non-animated and animated modes', () => {
      const cappedProps: Toast.Props = { ...baseProps, maxVisible: 2 }
      const capped = fold(
        [
          Toast.ShowToast({ title: 'One' }),
          Toast.ShowToast({ title: 'Two' }),
          Toast.ShowToast({ title: 'Three' }),
        ],
        cappedProps,
      )
      expect(Array.map(Toast.entriesOf(capped), e => e.id)).toEqual([
        'app-toast-entry-1',
        'app-toast-entry-2',
      ])

      const animatedCappedProps: Toast.Props = {
        ...baseProps,
        maxVisible: 2,
        isAnimated: true,
      }
      const animatedCapped = fold(
        [
          Toast.ShowToast({ title: 'One' }),
          Toast.ShowToast({ title: 'Two' }),
          Toast.ShowToast({ title: 'Three' }),
        ],
        animatedCappedProps,
      )
      // Oldest entry transitions to LeaveStart while only 2 entries remain showing
      expect(Toast.entryCountOf(animatedCapped)).toBe(3)
      expect(Toast.visibleEntriesOf(animatedCapped)).toHaveLength(2)
      expect(Toast.isEntryLeaving(animatedCapped, 'app-toast-entry-0')).toBe(
        true,
      )
    })
  })

  describe('animated Presence lifecycle (isAnimated: true)', () => {
    const animatedProps: Toast.Props = { ...baseProps, isAnimated: true }

    it('steps EnterStart -> EnterAnimating -> Open -> LeaveStart -> LeaveAnimating -> removed', () => {
      const [enterStart] = Toast.chart.transition(
        Toast.initial,
        Toast.ShowToast({ title: 'Deploying' }),
        animatedProps,
      )
      expect(Toast.entryDataStateOf(enterStart, 'app-toast-entry-0')).toBe(
        'open',
      )
      expect(
        Toast.entryTransitionPhaseOf(enterStart, 'app-toast-entry-0'),
      ).toBe('EnterStart')

      const enterAnimating = fold(
        [Toast.AdvanceToastFrame({ entryId: 'app-toast-entry-0' })],
        animatedProps,
        enterStart,
      )
      expect(
        Toast.entryTransitionPhaseOf(enterAnimating, 'app-toast-entry-0'),
      ).toBe('EnterAnimating')

      const open = fold(
        [Toast.EndToastAnimation({ entryId: 'app-toast-entry-0' })],
        animatedProps,
        enterAnimating,
      )
      expect(Toast.entryTransitionPhaseOf(open, 'app-toast-entry-0')).toBe(
        'Idle',
      )
      expect(Toast.isEntryLeaving(open, 'app-toast-entry-0')).toBe(false)

      // Dismiss enters LeaveStart while keeping the entry mounted
      const leaveStart = fold(
        [Toast.DismissToast({ entryId: 'app-toast-entry-0' })],
        animatedProps,
        open,
      )
      expect(Toast.entryCountOf(leaveStart)).toBe(1)
      expect(Toast.isEntryLeaving(leaveStart, 'app-toast-entry-0')).toBe(true)
      expect(Toast.entryDataStateOf(leaveStart, 'app-toast-entry-0')).toBe(
        'closed',
      )
      expect(
        Toast.entryTransitionPhaseOf(leaveStart, 'app-toast-entry-0'),
      ).toBe('LeaveStart')

      // Redundant dismiss or hover while leaving is ignored
      expect(
        Toast.chart.step(
          leaveStart,
          Toast.DismissToast({ entryId: 'app-toast-entry-0' }),
          animatedProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
      expect(
        Toast.chart.step(
          leaveStart,
          Toast.HoverToast({ entryId: 'app-toast-entry-0' }),
          animatedProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })

      const leaveAnimating = fold(
        [Toast.AdvanceToastFrame({ entryId: 'app-toast-entry-0' })],
        animatedProps,
        leaveStart,
      )
      expect(
        Toast.entryTransitionPhaseOf(leaveAnimating, 'app-toast-entry-0'),
      ).toBe('LeaveAnimating')

      const removed = fold(
        [Toast.EndToastAnimation({ entryId: 'app-toast-entry-0' })],
        animatedProps,
        leaveAnimating,
      )
      expect(removed).toEqual(Toast.Empty({ nextEntryKey: 1 }))
    })
  })

  describe('reference-stable SlotBinding projections, ARIA, sync, and Part.compose', () => {
    it('projects Region, Entry, Title, Description, and DismissButton ARIA and keeps untouched slots identical by reference', () => {
      const stateOne = fold([
        Toast.ShowToast({
          title: 'Saved',
          description: 'Document updated.',
          variant: 'Success',
        }),
      ])
      const viewOne = Part.view(Toast.part, stateOne, baseProps)
      const viewOneAgain = Part.view(Toast.part, stateOne, { ...baseProps })
      expect(viewOneAgain).toBe(viewOne)

      const regionBinding = viewOne.slot('Region')
      expect(Slot.ariaOf(regionBinding)).toEqual({
        role: 'region',
        id: 'app-toast-region',
        'aria-label': 'Notifications',
        'aria-live': 'polite',
        tabindex: '-1',
      })

      const entryZeroBinding = viewOne.slot('Entry', 'app-toast-entry-0')
      expect(Slot.ariaOf(entryZeroBinding)).toEqual({
        role: 'status',
        id: 'app-toast-entry-0',
        'aria-live': 'polite',
        'aria-atomic': 'true',
        'aria-labelledby': 'app-toast-entry-0-title',
        'aria-describedby': 'app-toast-entry-0-description',
      })

      const dismissZeroBinding = viewOne.slot(
        'DismissButton',
        'app-toast-entry-0',
      )
      expect(Slot.ariaOf(dismissZeroBinding)).toEqual({
        role: 'button',
        id: 'app-toast-entry-0-dismiss',
        'aria-label': 'Dismiss notification',
      })
      expect(dismissZeroBinding.gestures).toEqual([
        { gesture: 'Pressed', press: 'DismissToast:app-toast-entry-0' },
      ])

      // Adding a second Error toast keeps entry-0's bindings referentially identical
      const stateTwo = fold(
        [Toast.ShowToast({ title: 'Upload failed', variant: 'Error' })],
        baseProps,
        stateOne,
      )
      const viewTwo = Part.view(Toast.part, stateTwo, baseProps)
      expect(viewTwo.slot('Region')).toBe(regionBinding)
      expect(viewTwo.slot('Entry', 'app-toast-entry-0')).toBe(entryZeroBinding)
      expect(viewTwo.slot('DismissButton', 'app-toast-entry-0')).toBe(
        dismissZeroBinding,
      )

      const entryOneBinding = viewTwo.slot('Entry', 'app-toast-entry-1')
      expect(Slot.ariaOf(entryOneBinding)).toEqual({
        role: 'alert',
        id: 'app-toast-entry-1',
        'aria-live': 'assertive',
        'aria-atomic': 'true',
        'aria-labelledby': 'app-toast-entry-1-title',
      })
    })

    it('clears transient toasts in atRest while preserving nextEntryKey, and derives Navigation synced vs deviceOnly sync tables', () => {
      const showing = fold([Toast.ShowToast({ title: 'Transient' })])
      expect(Toast.atRest(showing)).toEqual(Toast.Empty({ nextEntryKey: 1 }))

      expect(Toast.part.category).toBe('Navigation')
      expect(Toast.synced.ShowToast).toEqual(Synced())
      expect(Toast.deviceSync('OwnView').ShowToast).toEqual(
        Device({ because: 'OwnView' }),
      )

      const HostModel = S.Struct({ ready: S.Boolean })
      const Ping = Catalog.action('Ping', {
        what: 'Pings the host',
        why: 'To verify composition',
        meta: { label: 'Ping', keys: [] },
      })
      const hostCatalog = Catalog.make([Ping])
      const Base = makeProgram({
        id: 'toast-sync-test',
        version: 1,
        Model: HostModel,
        Message: hostCatalog.Message,
        init: () => [{ ready: true }, []],
        update: (model: typeof HostModel.Type) => [model, []],
        catalog: hostCatalog,
      })

      const SyncedApp = Part.compose({
        of: Base,
        parts: [Part.given(Toast.part, () => baseProps)],
      })
      expect(
        SyncedApp.synchronization?.messageCategory(
          Toast.ShowToast({ title: 'Hi' }),
        ),
      ).toBe('Navigation')
      expect(
        SyncedApp.synchronization?.isLocalOnly?.(
          Toast.ShowToast({ title: 'Hi' }),
        ),
      ).toBe(false)

      const DeviceOnlyApp = Part.compose({
        of: Base,
        parts: [Part.given(Toast.deviceOnly(), () => baseProps)],
      })
      expect(
        DeviceOnlyApp.synchronization?.isLocalOnly?.(
          Toast.ShowToast({ title: 'Hi' }),
        ),
      ).toBe(true)

      // projectLocal calls atRest, clearing transient toasts on restart
      const [initModel] = SyncedApp.init()
      const [shownModel] = SyncedApp.update(
        initModel,
        Toast.ShowToast({ title: 'Hi' }),
      )
      const projected = SyncedApp.synchronization?.projectLocal?.(shownModel)
      expect(projected?.parts['Toast']).toEqual(
        Toast.Empty({ nextEntryKey: 1 }),
      )
    })
  })
})
