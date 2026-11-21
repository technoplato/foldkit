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
import * as Layers from './layers.js'
import * as Menu from './menu.js'
import { Device, Synced } from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'
import * as Typeahead from './typeahead.js'

const sampleItems: ReadonlyArray<Menu.Item> = [
  { value: 'edit', label: 'Edit' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'archive', label: 'Archive', isDisabled: true },
  { value: 'danger', label: 'Danger Zone' },
  { value: 'delete', label: 'Delete' },
]

const baseProps: Menu.Props = {
  id: 'actions',
  items: sampleItems,
}

const fold = (
  messages: ReadonlyArray<Menu.Message>,
  props: Menu.Props = baseProps,
  from: Menu.State = Menu.initial,
): Menu.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => Menu.chart.transition(state, message, props)[0],
  )

describe('core Menu Part', () => {
  describe('declaration and chart integrity', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(Menu.part)).toEqual([])
      expect(Part.problemsOf(Menu.deviceOnly())).toEqual([])
      expect(Block.problemsOf({ name: 'Menu', chart: Menu.chart })).toEqual([])
      for (const action of Menu.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })
  })

  describe('open and close', () => {
    it('toggles open and closed from the trigger button', () => {
      const opened = fold([Menu.ToggleMenu()])
      expect(Menu.isOpen(opened)).toBe(true)
      expect(Menu.activeIndexOf(opened)).toEqual(Option.none())
      expect(Menu.targetOf(opened)).toEqual(Option.none())

      const closed = fold([Menu.ToggleMenu()], baseProps, opened)
      expect(Menu.isOpen(closed)).toBe(false)
    })

    it('opens to the first enabled item on ArrowDown, Enter, or Space and to the last enabled on ArrowUp', () => {
      const withFirstDisabled: Menu.Props = {
        id: 'actions',
        items: [
          { value: 'a', label: 'A', isDisabled: true },
          { value: 'b', label: 'B' },
          { value: 'c', label: 'C' },
          { value: 'd', label: 'D', isDisabled: true },
        ],
      }

      const down = fold(
        [Menu.PressedTriggerKey({ key: 'ArrowDown' })],
        withFirstDisabled,
      )
      expect(Menu.isOpen(down)).toBe(true)
      expect(Menu.activeIndexOf(down)).toEqual(Option.some(1))

      const enter = fold(
        [Menu.PressedTriggerKey({ key: 'Enter' })],
        withFirstDisabled,
      )
      expect(Menu.activeIndexOf(enter)).toEqual(Option.some(1))

      const space = fold(
        [Menu.PressedTriggerKey({ key: ' ' })],
        withFirstDisabled,
      )
      expect(Menu.activeIndexOf(space)).toEqual(Option.some(1))

      const up = fold(
        [Menu.PressedTriggerKey({ key: 'ArrowUp' })],
        withFirstDisabled,
      )
      expect(Menu.isOpen(up)).toBe(true)
      expect(Menu.activeIndexOf(up)).toEqual(Option.some(2))
    })

    it('opens on a context target via OpenMenuFor and closes via CloseMenu', () => {
      const opened = fold([Menu.OpenMenuFor({ target: 'salt-road' })])
      expect(Menu.isOpen(opened)).toBe(true)
      expect(Menu.targetOf(opened)).toEqual(Option.some('salt-road'))

      const switched = fold(
        [Menu.OpenMenuFor({ target: 'a-tin-comet' })],
        baseProps,
        opened,
      )
      expect(Menu.targetOf(switched)).toEqual(Option.some('a-tin-comet'))

      const closed = fold([Menu.CloseMenu()], baseProps, switched)
      expect(Menu.isOpen(closed)).toBe(false)
    })
  })

  describe('roving highlight', () => {
    it('moves across enabled items, skips disabled ones, and wraps by default', () => {
      const opened = fold([Menu.PressedTriggerKey({ key: 'ArrowDown' })])
      expect(Menu.activeIndexOf(opened)).toEqual(Option.some(0))

      // 0 -> 1 -> skips disabled 2 -> 3 -> 4 -> wraps to 0
      const step1 = fold(
        [Menu.PressedMenuKey({ key: 'ArrowDown' })],
        baseProps,
        opened,
      )
      expect(Menu.activeIndexOf(step1)).toEqual(Option.some(1))

      const step2 = fold(
        [Menu.PressedMenuKey({ key: 'ArrowDown' })],
        baseProps,
        step1,
      )
      expect(Menu.activeIndexOf(step2)).toEqual(Option.some(3))

      const step3 = fold(
        [Menu.PressedMenuKey({ key: 'ArrowDown' })],
        baseProps,
        step2,
      )
      expect(Menu.activeIndexOf(step3)).toEqual(Option.some(4))

      const wrapped = fold(
        [Menu.PressedMenuKey({ key: 'ArrowDown' })],
        baseProps,
        step3,
      )
      expect(Menu.activeIndexOf(wrapped)).toEqual(Option.some(0))

      const back = fold(
        [Menu.PressedMenuKey({ key: 'ArrowUp' })],
        baseProps,
        wrapped,
      )
      expect(Menu.activeIndexOf(back)).toEqual(Option.some(4))

      const home = fold(
        [Menu.PressedMenuKey({ key: 'Home' })],
        baseProps,
        step3,
      )
      expect(Menu.activeIndexOf(home)).toEqual(Option.some(0))

      const end = fold([Menu.PressedMenuKey({ key: 'End' })], baseProps, home)
      expect(Menu.activeIndexOf(end)).toEqual(Option.some(4))
    })

    it('respects loop: false and horizontal orientation', () => {
      const noLoopHorizontal: Menu.Props = {
        ...baseProps,
        loop: false,
        orientation: 'Horizontal',
      }
      const opened = fold(
        [
          Menu.OpenedMenu({
            maybeTarget: Option.none(),
            maybeActiveIndex: Option.some(4),
            activationTrigger: 'Keyboard',
          }),
        ],
        noLoopHorizontal,
      )

      const clamped = fold(
        [Menu.PressedMenuKey({ key: 'ArrowRight' })],
        noLoopHorizontal,
        opened,
      )
      expect(Menu.activeIndexOf(clamped)).toEqual(Option.some(4))

      const prev = fold(
        [Menu.PressedMenuKey({ key: 'ArrowLeft' })],
        noLoopHorizontal,
        clamped,
      )
      expect(Menu.activeIndexOf(prev)).toEqual(Option.some(3))
    })
  })

  describe('typeahead search and debounced reset', () => {
    it('matches multi-character queries with spaces, skips disabled items, and resets via Command.answerAfter', () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const opened = fold([Menu.ToggleMenu()])

          // Type 'd' -> matches 'Duplicate' (1)
          const [afterD, cmds1] = Menu.chart.transition(
            opened,
            Menu.PressedMenuKey({ key: 'd' }),
            baseProps,
          )
          expect(Menu.activeIndexOf(afterD)).toEqual(Option.some(1))
          expect(Menu.searchQueryOf(afterD)).toBe('d')
          expect(Array.map(cmds1, c => c.name)).toEqual([
            'WaitToClearMenuSearch',
          ])

          // Refine 'd' -> 'da' -> matches 'Danger Zone' (3)
          const [afterDa, cmds2] = Menu.chart.transition(
            afterD,
            Menu.PressedMenuKey({ key: 'a' }),
            baseProps,
          )
          expect(Menu.activeIndexOf(afterDa)).toEqual(Option.some(3))
          expect(Menu.searchQueryOf(afterDa)).toBe('da')

          // Continue with space -> stays on 'Danger Zone' (does not select while searching!)
          const [afterDangerSpace, cmds3] = Menu.chart.transition(
            fold(
              [
                Menu.PressedMenuKey({ key: 'n' }),
                Menu.PressedMenuKey({ key: 'g' }),
                Menu.PressedMenuKey({ key: 'e' }),
                Menu.PressedMenuKey({ key: 'r' }),
              ],
              baseProps,
              afterDa,
            ),
            Menu.PressedMenuKey({ key: ' ' }),
            baseProps,
          )
          expect(Menu.isOpen(afterDangerSpace)).toBe(true)
          expect(Menu.searchQueryOf(afterDangerSpace)).toBe('danger ')
          expect(Menu.activeIndexOf(afterDangerSpace)).toEqual(Option.some(3))

          // Disabled 'Archive' is skipped when searching 'a'
          const [afterClear] = Menu.chart.transition(
            afterDangerSpace,
            Menu.ClearedMenuSearch({ version: 7 }),
            baseProps,
          )
          expect(Menu.searchQueryOf(afterClear)).toBe('')

          const [afterA] = Menu.chart.transition(
            afterClear,
            Menu.PressedMenuKey({ key: 'a' }),
            baseProps,
          )
          // Archive (2) is disabled, so highlight remains on 3
          expect(Menu.activeIndexOf(afterA)).toEqual(Option.some(3))

          // Stale version (from cmds1 = version 1) is ignored on afterDa (version 2)
          const stale = Menu.chart.step(
            afterDa,
            Menu.ClearedMenuSearch({ version: 1 }),
            baseProps,
          )
          expect(stale._tag === 'Ignored' ? stale.reason : stale._tag).toBe(
            'ExplicitlyIgnored',
          )

          // Verify WaitToClearMenuSearch waits Typeahead.resetMs on the Effect TestClock
          const wait = Option.getOrThrow(Array.head(cmds2))
          const answered = yield* Ref.make(Array.empty<Menu.Message>())
          const fiber = yield* Effect.forkChild(
            Effect.tap(wait.effect, message =>
              Ref.update(answered, all => [...all, message]),
            ),
          )
          yield* TestClock.adjust(Duration.millis(Typeahead.resetMs - 1))
          expect(yield* Ref.get(answered)).toEqual([])
          yield* TestClock.adjust(Duration.millis(1))
          expect(yield* Fiber.join(fiber)).toEqual(
            Menu.ClearedMenuSearch({ version: 2 }),
          )
          expect(cmds3[0]?.args).toEqual({
            version: 7,
            afterMs: Typeahead.resetMs,
          })
        }).pipe(Effect.provide(TestClock.layer())),
      ))
  })

  describe('pointer hover activation and drag-to-select', () => {
    it('highlights hovered items, ignores redundant same-position moves, and clears only pointer highlights on leave', () => {
      const opened = fold([Menu.ToggleMenu()])
      const hovered = fold(
        [Menu.MovedPointerOverItem({ index: 1, screenX: 100, screenY: 200 })],
        baseProps,
        opened,
      )
      expect(Menu.activeIndexOf(hovered)).toEqual(Option.some(1))

      // Same coordinates -> ignored (even if targeting another item due to scroll/layout shift)
      const redundant = Menu.chart.step(
        hovered,
        Menu.MovedPointerOverItem({ index: 3, screenX: 100, screenY: 200 }),
        baseProps,
      )
      expect(redundant._tag).toBe('Ignored')

      // Disabled item -> ignored
      const onDisabled = Menu.chart.step(
        hovered,
        Menu.MovedPointerOverItem({ index: 2, screenX: 110, screenY: 220 }),
        baseProps,
      )
      expect(onDisabled._tag).toBe('Ignored')

      // Leaving after pointer activation clears highlight
      const left = fold([Menu.LeftItem()], baseProps, hovered)
      expect(Menu.activeIndexOf(left)).toEqual(Option.none())

      // Leaving after keyboard activation keeps highlight
      const keyed = fold(
        [Menu.MovedHighlight({ move: 'First' })],
        baseProps,
        left,
      )
      expect(Menu.activeIndexOf(keyed)).toEqual(Option.some(0))
      const leftAfterKey = fold([Menu.LeftItem()], baseProps, keyed)
      expect(Menu.activeIndexOf(leftAfterKey)).toEqual(Option.some(0))
    })

    it('evaluates drag-to-select movement and hold thresholds in core', () => {
      const origin = Option.some({
        screenX: 100,
        screenY: 100,
        timeStamp: 1000,
      })
      expect(
        Menu.shouldDragSelect({
          maybeOrigin: origin,
          maybeActiveIndex: Option.some(1),
          screenX: 102,
          screenY: 102,
          timeStamp: 1500,
        }),
      ).toBe(false)
      expect(
        Menu.shouldDragSelect({
          maybeOrigin: origin,
          maybeActiveIndex: Option.some(1),
          screenX: 120,
          screenY: 120,
          timeStamp: 1100,
        }),
      ).toBe(false)
      expect(
        Menu.shouldDragSelect({
          maybeOrigin: origin,
          maybeActiveIndex: Option.some(1),
          screenX: 120,
          screenY: 100,
          timeStamp: 1200,
        }),
      ).toBe(true)
    })
  })

  describe('item selection', () => {
    it('selects enabled items, ignores disabled items, and honors closeOnSelect', () => {
      const opened = fold([Menu.PressedTriggerKey({ key: 'ArrowDown' })])
      const selected = fold(
        [Menu.SelectMenuItem({ value: 'delete' })],
        baseProps,
        opened,
      )
      expect(Menu.isOpen(selected)).toBe(false)
      expect(Menu.lastSelectedOf(selected)).toEqual(
        Option.some({ value: 'delete', index: 4 }),
      )

      // Disabled item cannot be selected
      const disabledAttempt = Menu.chart.step(
        opened,
        Menu.SelectMenuItem({ value: 'archive' }),
        baseProps,
      )
      expect(disabledAttempt._tag).toBe('Ignored')

      // Enter selects currently active item
      const viaEnter = fold(
        [Menu.PressedMenuKey({ key: 'Enter' })],
        baseProps,
        opened,
      )
      expect(Menu.isOpen(viaEnter)).toBe(false)
      expect(Menu.lastSelectedOf(viaEnter)).toEqual(
        Option.some({ value: 'edit', index: 0 }),
      )

      // closeOnSelect: false keeps the menu open while recording selection
      const stayOpenProps: Menu.Props = { ...baseProps, closeOnSelect: false }
      const stayedOpen = fold(
        [Menu.SelectMenuItem({ value: 'duplicate' })],
        stayOpenProps,
        opened,
      )
      expect(Menu.isOpen(stayedOpen)).toBe(true)
      expect(Menu.lastSelectedOf(stayedOpen)).toEqual(
        Option.some({ value: 'duplicate', index: 1 }),
      )
    })
  })

  describe('layer-aware dismissal and placement', () => {
    it('dismisses on Escape and outside press only when topmost in layers', () => {
      const dialogLayer = Layers.layer('confirm-dialog', { isModal: true })
      const menuLayer = Layers.layer('actions')
      const opened = fold([Menu.ToggleMenu()])

      // Menu is below a modal dialog -> Escape and outside press do NOT close the menu
      const buriedProps: Menu.Props = {
        ...baseProps,
        layers: [menuLayer, dialogLayer],
      }
      expect(
        Menu.chart.step(
          opened,
          Menu.PressedMenuKey({ key: 'Escape' }),
          buriedProps,
        )._tag,
      ).toBe('Ignored')
      expect(
        Menu.chart.step(opened, Menu.DismissMenu(), buriedProps)._tag,
      ).toBe('Ignored')
      expect(
        Menu.chart.step(
          opened,
          Menu.PressedOutsideMenu({ insideIds: [] }),
          buriedProps,
        )._tag,
      ).toBe('Ignored')

      // Menu is above the dialog -> Escape and outside press close the menu
      const topProps: Menu.Props = {
        ...baseProps,
        layers: [dialogLayer, menuLayer],
      }
      expect(
        Menu.isOpen(
          fold([Menu.PressedMenuKey({ key: 'Escape' })], topProps, opened),
        ),
      ).toBe(false)
      expect(
        Menu.isOpen(
          fold(
            [Menu.PressedOutsideMenu({ insideIds: ['confirm-dialog'] })],
            topProps,
            opened,
          ),
        ),
      ).toBe(false)
      // Pressing inside the menu itself does not dismiss it
      expect(
        Menu.isOpen(
          fold(
            [Menu.PressedOutsideMenu({ insideIds: ['actions'] })],
            topProps,
            opened,
          ),
        ),
      ).toBe(true)
    })

    it('delegates panel placement to Placement.place with configured gap and edge', () => {
      const placed = Menu.placeFor(
        { placement: { gapPx: 4, edgePx: 12 } },
        {
          anchor: { left: 200, top: 100, width: 80, height: 24 },
          size: { width: 180, height: 140 },
          view: { width: 800, height: 600 },
        },
      )
      expect(placed).toEqual({ left: 200, top: 128, side: 'Below' })
    })
  })

  describe('synchronization: synced by default with a device-only option', () => {
    const DummyModel = S.Struct({ title: S.String })
    const DummyAction = Catalog.action('NoOp', {
      what: 'Keeps the title unchanged',
      why: 'To test part composition',
      meta: { label: 'No-op', keys: [] },
    })
    const dummyCatalog = Catalog.make([DummyAction])
    const BaseProgram = makeProgram({
      id: 'menu-sync-test',
      version: 1,
      Model: DummyModel,
      Message: dummyCatalog.Message,
      init: () => [{ title: 'Notes' }, []],
      update: model => [model, []],
      catalog: dummyCatalog,
    })

    it('syncs Menu state and Messages by default (Navigation category)', () => {
      const SyncedApp = Part.compose({
        of: BaseProgram,
        parts: [Part.given(Menu.part, () => baseProps)],
      })
      const [model] = SyncedApp.init()
      const sync = Option.getOrThrow(
        Option.fromNullishOr(SyncedApp.synchronization),
      )

      expect(sync.messageCategory(Menu.ToggleMenu())).toBe('Navigation')
      expect(sync.isLocalOnly?.(Menu.ToggleMenu())).toBe(false)
      expect(sync.paceOf?.(Menu.ToggleMenu())).toEqual(Synced())
      expect(sync.paceOf?.(Menu.SelectMenuItem({ value: 'edit' }))).toEqual(
        Synced(),
      )

      const encoded = S.encodeUnknownSync(SyncedApp.Model)(model)
      expect(encoded).toMatchObject({
        title: 'Notes',
        parts: { Menu: { _tag: 'Closed' } },
      })
    })

    it('keeps Menu device-only when configured with Menu.deviceOnly()', () => {
      const LocalMenu = Menu.deviceOnly({ name: 'LocalMenu' })
      const LocalApp = Part.compose({
        of: BaseProgram,
        parts: [Part.given(LocalMenu, () => baseProps)],
      })
      const [model] = LocalApp.init()
      const sync = Option.getOrThrow(
        Option.fromNullishOr(LocalApp.synchronization),
      )

      expect(sync.isLocalOnly?.(Menu.ToggleMenu())).toBe(true)
      expect(sync.paceOf?.(Menu.ToggleMenu())).toEqual(
        Device({ because: 'OwnView' }),
      )

      // Omitted from encoded Model when all parts are device-only
      const encoded = S.encodeUnknownSync(LocalApp.Model)(model)
      expect(JSON.stringify(encoded)).not.toContain('LocalMenu')

      // Preserved across refolds
      const [opened] = LocalApp.update(model, Menu.ToggleMenu())
      const kept = sync.keepOnRefold?.(opened, model)
      expect(kept?.parts['LocalMenu']).toEqual(opened.parts['LocalMenu'])
    })
  })

  describe('reference-stable projection', () => {
    it('returns identical View and SlotBinding objects for unchanged state and untouched slots', () => {
      const menuPart = Menu.make({ name: 'StableMenu' })
      const opened = fold([Menu.PressedTriggerKey({ key: 'ArrowDown' })])

      const v1 = Part.view(menuPart, opened, baseProps)
      const triggerBefore = v1.slot('Trigger')
      const editBefore = v1.slot('Item', 'edit')
      const duplicateBefore = v1.slot('Item', 'duplicate')
      const deleteBefore = v1.slot('Item', 'delete')
      const v2 = Part.view(menuPart, opened, { ...baseProps })
      expect(v2).toBe(v1)
      expect(v2.slot('Trigger')).toBe(triggerBefore)
      expect(v2.slot('Item', 'edit')).toBe(editBefore)

      // ARIA projection via Slot.ariaOf
      expect(Slot.ariaOf(triggerBefore)).toEqual({
        role: 'button',
        id: 'actions-button',
        'aria-expanded': 'true',
      })
      expect(Slot.ariaOf(v1.slot('Container'))).toEqual({
        role: 'menu',
        id: 'actions-items',
        'aria-activedescendant': 'actions-item-0',
      })
      expect(Slot.ariaOf(editBefore)).toEqual({
        role: 'menuitem',
        id: 'actions-item-0',
        'aria-current': 'true',
      })
      expect(Slot.ariaOf(v1.slot('Item', 'archive'))).toEqual({
        role: 'menuitem',
        id: 'actions-item-2',
        'aria-current': 'false',
        'aria-disabled': 'true',
      })

      // Highlight moves from 0 ('edit') to 1 ('duplicate'): untouched 'delete' and 'Trigger' keep exact object identity
      const moved = fold(
        [Menu.MovedHighlight({ move: 'Next' })],
        baseProps,
        opened,
      )
      const v3 = Part.view(menuPart, moved, baseProps)
      expect(v3).not.toBe(v1)
      expect(v3.slot('Trigger')).toBe(triggerBefore)
      expect(v3.slot('Item', 'delete')).toBe(deleteBefore)
      expect(v3.slot('Item', 'edit')).not.toBe(editBefore)
      expect(v3.slot('Item', 'duplicate')).not.toBe(duplicateBefore)
      expect(Slot.ariaOf(v3.slot('Container'))).toEqual({
        role: 'menu',
        id: 'actions-items',
        'aria-activedescendant': 'actions-item-1',
      })
    })
  })
})
