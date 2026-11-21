import { Array, Duration, Effect, Fiber, Option, Schema as S } from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import * as Layers from './layers.js'
import * as Menubar from './menubar.js'
import { Device, Synced } from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'

const baseProps: Menubar.Props = {
  id: 'app-bar',
  label: 'Application menu',
  menus: [
    {
      value: 'file',
      label: 'File',
      items: [
        { value: 'new', label: 'New' },
        { value: 'open', label: 'Open' },
        { value: 'print', label: 'Print', isDisabled: true },
        { value: 'save', label: 'Save' },
      ],
    },
    {
      value: 'disabled-menu',
      label: 'Tools',
      isDisabled: true,
      items: [{ value: 'lint', label: 'Lint' }],
    },
    {
      value: 'edit',
      label: 'Edit',
      items: [
        { value: 'undo', label: 'Undo' },
        { value: 'redo', label: 'Redo' },
      ],
    },
    {
      value: 'view',
      label: 'View',
      items: [{ value: 'zoom', label: 'Zoom In' }],
    },
  ],
}

const fold = (
  messages: ReadonlyArray<Menubar.Message>,
  props: Menubar.Props = baseProps,
  from: Menubar.State = Menubar.initial,
): Menubar.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => Menubar.chart.transition(state, message, props)[0],
  )

describe('core Menubar Part', () => {
  describe('declaration, chart integrity, IDs, placement, and schema round-trip', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(Menubar.part)).toEqual([])
      expect(Part.problemsOf(Menubar.deviceOnly())).toEqual([])
      expect(Part.problemsOf(Menubar.make({ sync: 'OwnView' }))).toEqual([])
      expect(
        Block.problemsOf({ name: 'Menubar', chart: Menubar.chart }),
      ).toEqual([])

      for (const action of Menubar.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })

    it('derives element IDs and delegates placement to Menu.placeFor', () => {
      expect(Menubar.barId('app-bar')).toBe('app-bar-bar')
      expect(Menubar.triggerId('app-bar', 'file')).toBe('app-bar-trigger-file')
      expect(Menubar.contentId('app-bar', 'file')).toBe('app-bar-content-file')
      expect(Menubar.itemId('app-bar', 'file', 0)).toBe(
        'app-bar-menu-file-item-0',
      )

      const placed = Menubar.placeFor(baseProps, {
        anchor: { left: 40, top: 20, width: 60, height: 24 },
        size: { width: 180, height: 120 },
        view: { width: 800, height: 600 },
      })
      expect(placed).toEqual({ left: 40, top: 52, side: 'Below' })
    })

    it('round-trips Idle and Open states through Effect Schema JSON encoding', () => {
      const opened = fold([Menubar.OpenMenubarMenu({ value: 'file' })])
      for (const state of [Menubar.initial, opened]) {
        const encoded = S.encodeUnknownSync(Menubar.State)(state)
        const decoded = S.decodeUnknownSync(Menubar.State)(encoded)
        expect(decoded).toEqual(state)
      }
    })
  })

  describe('roving focus, Left/Right menu switching, hover-switch while open, and Menu delegation', () => {
    it('roves horizontally across top-level triggers while Idle (skipping disabled menus) and opens via keyboard', () => {
      expect(Menubar.focusedMenuValueOf(Menubar.initial, baseProps)).toEqual(
        Option.some('file'),
      )

      // Hover while Idle does not open
      const hoveredIdle = fold([
        Menubar.HoverMenubarTrigger({ menuValue: 'edit' }),
      ])
      expect(Menubar.isOpen(hoveredIdle)).toBe(false)

      // ArrowRight skips disabled-menu -> edit
      const movedRight = fold([
        Menubar.PressedMenubarKey({ key: 'ArrowRight' }),
      ])
      expect(Menubar.isOpen(movedRight)).toBe(false)
      expect(Menubar.focusedMenuValueOf(movedRight, baseProps)).toEqual(
        Option.some('edit'),
      )

      // ArrowDown opens focused menu with first enabled item highlighted
      const opened = fold(
        [Menubar.PressedMenubarKey({ key: 'ArrowDown' })],
        baseProps,
        movedRight,
      )
      expect(Menubar.isOpen(opened)).toBe(true)
      expect(Menubar.openMenuValueOf(opened)).toEqual(Option.some('edit'))
      expect(Menubar.activeItemIndexOf(opened)).toEqual(Option.some(0))
    })

    it('switches open menus on Left/Right (with LTR/RTL and loop) and hover-switches while open', () => {
      const fileOpen = fold([Menubar.OpenMenubarMenu({ value: 'file' })])
      expect(Menubar.openMenuValueOf(fileOpen)).toEqual(Option.some('file'))

      // ArrowRight while Open switches to edit (skipping disabled-menu) and highlights first item
      const editOpen = fold(
        [Menubar.PressedMenubarKey({ key: 'ArrowRight' })],
        baseProps,
        fileOpen,
      )
      expect(Menubar.openMenuValueOf(editOpen)).toEqual(Option.some('edit'))
      expect(Menubar.activeItemIndexOf(editOpen)).toEqual(Option.some(0))

      // Hover while Open switches to view immediately
      const viewOpen = fold(
        [Menubar.HoverMenubarTrigger({ menuValue: 'view' })],
        baseProps,
        editOpen,
      )
      expect(Menubar.openMenuValueOf(viewOpen)).toEqual(Option.some('view'))

      // ArrowRight wraps around to file
      const wrapped = fold(
        [Menubar.PressedMenubarKey({ key: 'ArrowRight' })],
        baseProps,
        viewOpen,
      )
      expect(Menubar.openMenuValueOf(wrapped)).toEqual(Option.some('file'))

      // RTL reverses Left/Right
      const rtlProps: Menubar.Props = { ...baseProps, direction: 'Rtl' }
      const rtlNext = fold(
        [Menubar.PressedMenubarKey({ key: 'ArrowLeft' })],
        rtlProps,
        fileOpen,
      )
      expect(Menubar.openMenuValueOf(rtlNext)).toEqual(Option.some('edit'))
    })

    it('delegates vertical navigation, disabled item skipping, selection, typeahead, Escape, and outside dismiss', () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const opened = fold([Menubar.PressedMenubarKey({ key: 'ArrowDown' })])
          // Move down: 0 (new) -> 1 (open) -> skips 2 (print disabled) -> 3 (save)
          const onSave = fold(
            [
              Menubar.PressedMenubarKey({ key: 'ArrowDown' }),
              Menubar.PressedMenubarKey({ key: 'ArrowDown' }),
            ],
            baseProps,
            opened,
          )
          expect(Menubar.activeItemIndexOf(onSave)).toEqual(Option.some(3))

          // Typeahead delegates to Menu and emits WaitToClearMenubarSearch
          const [searched, searchCommands] = Menubar.chart.transition(
            onSave,
            Menubar.PressedMenubarKey({ key: 'o' }),
            baseProps,
          )
          expect(Menubar.activeItemIndexOf(searched)).toEqual(Option.some(1))
          expect(Menubar.searchQueryOf(searched)).toBe('o')
          expect(Array.map(searchCommands, c => c.name)).toEqual([
            'WaitToClearMenubarSearch',
          ])

          const waitClear = Option.getOrThrow(Array.head(searchCommands))
          const fiber = yield* Effect.forkChild(waitClear.effect)
          yield* TestClock.adjust(Duration.millis(500))
          const clearedMsg = yield* Fiber.join(fiber)
          const [afterClear] = Menubar.chart.transition(
            searched,
            clearedMsg,
            baseProps,
          )
          expect(Menubar.searchQueryOf(afterClear)).toBe('')

          // Enter selects active item and closes dropdown back to Idle
          const selected = fold(
            [Menubar.PressedMenubarKey({ key: 'Enter' })],
            baseProps,
            afterClear,
          )
          expect(Menubar.isOpen(selected)).toBe(false)
          expect(Menubar.lastSelectedOf(selected)).toEqual(
            Option.some({ menuValue: 'file', itemValue: 'open', itemIndex: 1 }),
          )

          // Escape and outside press close when topmost layer, ignored when covered
          const reopened = fold([Menubar.OpenMenubarMenu({ value: 'edit' })])
          expect(
            Menubar.isOpen(
              fold(
                [Menubar.PressedMenubarKey({ key: 'Escape' })],
                baseProps,
                reopened,
              ),
            ),
          ).toBe(false)
          expect(
            Menubar.isOpen(
              fold(
                [Menubar.PressedOutsideMenubar({ insideIds: [] })],
                baseProps,
                reopened,
              ),
            ),
          ).toBe(false)

          const coveredProps: Menubar.Props = {
            ...baseProps,
            layers: [
              Layers.layer('app-bar'),
              Layers.layer('modal-dialog', { isModal: true }),
            ],
          }
          expect(
            Menubar.isOpen(
              fold(
                [Menubar.PressedMenubarKey({ key: 'Escape' })],
                coveredProps,
                reopened,
              ),
            ),
          ).toBe(true)

          expect(Menubar.atRest(reopened)).toEqual(Menubar.initial)
        }).pipe(Effect.provide(TestClock.layer())),
      ))
  })

  describe('slot projections, reference stability, and Part.compose sync durability', () => {
    it('projects Bar, Trigger, Content, and Item slots with roving tabindex and reference stability', () => {
      const idleView1 = Part.view(Menubar.part, Menubar.initial, baseProps)
      const idleView2 = Part.view(Menubar.part, Menubar.initial, baseProps)
      expect(idleView1).toBe(idleView2)

      expect(Slot.ariaOf(idleView1.slot('Bar'))).toMatchObject({
        role: 'menu',
        id: 'app-bar-bar',
        'aria-orientation': 'horizontal',
        'aria-label': 'Application menu',
      })
      const fileTriggerIdle = idleView1.slot('Trigger', 'file')
      const editTriggerIdle = idleView1.slot('Trigger', 'edit')
      const viewTriggerIdle = idleView1.slot('Trigger', 'view')
      expect(Slot.ariaOf(fileTriggerIdle)).toMatchObject({
        role: 'menuitem',
        id: 'app-bar-trigger-file',
        'aria-haspopup': 'menu',
        'aria-expanded': 'false',
        tabindex: '0',
      })
      expect(Slot.ariaOf(editTriggerIdle)['tabindex']).toBe('-1')
      expect(Slot.ariaOf(idleView1.slot('Content', 'file'))['hidden']).toBe('')

      const opened = fold([Menubar.OpenMenubarMenu({ value: 'file' })])
      const openView = Part.view(Menubar.part, opened, baseProps)
      // Unchanged sibling trigger keeps reference identity
      expect(openView.slot('Trigger', 'view')).toBe(viewTriggerIdle)
      expect(Slot.ariaOf(openView.slot('Trigger', 'file'))).toMatchObject({
        'aria-expanded': 'true',
        'aria-controls': 'app-bar-content-file',
        tabindex: '0',
      })
      expect(
        Slot.ariaOf(openView.slot('Content', 'file'))['hidden'],
      ).toBeUndefined()
      expect(Slot.ariaOf(openView.slot('Item', 'new'))).toMatchObject({
        role: 'menuitem',
        id: 'app-bar-menu-file-item-0',
      })
      expect(Slot.ariaOf(openView.slot('Item', 'print'))['aria-disabled']).toBe(
        'true',
      )
    })

    it('syncs by default under Navigation and supports deviceOnly omission', () => {
      expect(Menubar.synced.OpenMenubarMenu).toEqual(Synced())
      expect(Menubar.deviceSync('OwnView').OpenMenubarMenu).toEqual(
        Device({ because: 'OwnView' }),
      )

      const HostModel = S.Struct({ count: S.Number })
      const HostMsg = S.Struct({ _tag: S.Literal('Tick') })
      const Base = makeProgram({
        id: 'menubar-sync-test',
        version: 1,
        Model: HostModel,
        Message: HostMsg,
        init: () => [{ count: 0 }, []],
        update: (model: typeof HostModel.Type) => [model, []],
      })

      const SyncedApp = Part.compose({
        of: Base,
        parts: [Part.given(Menubar.part, () => baseProps)],
      })
      const [initSynced] = SyncedApp.init()
      const [openSynced] = SyncedApp.update(
        initSynced,
        Menubar.OpenMenubarMenu({ value: 'file' }),
      )
      expect(S.encodeUnknownSync(SyncedApp.Model)(openSynced)).toHaveProperty(
        'parts.Menubar._tag',
        'Open',
      )

      const LocalApp = Part.compose({
        of: Base,
        parts: [Part.given(Menubar.deviceOnly(), () => baseProps)],
      })
      const [initLocal] = LocalApp.init()
      const [openLocal] = LocalApp.update(
        initLocal,
        Menubar.OpenMenubarMenu({ value: 'file' }),
      )
      expect(S.encodeUnknownSync(LocalApp.Model)(openLocal)).not.toHaveProperty(
        'parts',
      )
    })
  })
})
