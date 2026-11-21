import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import { Device, Synced } from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'
import * as Toolbar from './toolbar.js'

const baseProps: Toolbar.Props = {
  id: 'editor-bar',
  label: 'Formatting tools',
  items: [
    { value: 'bold', label: 'Bold' },
    { value: 'italic', label: 'Italic', isDisabled: true },
    { value: 'underline', label: 'Underline' },
    { value: 'link', label: 'Link' },
  ],
}

const fold = (
  messages: ReadonlyArray<Toolbar.Message>,
  props: Toolbar.Props = baseProps,
  from: Toolbar.State = Toolbar.initial,
): Toolbar.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => Toolbar.chart.transition(state, message, props)[0],
  )

describe('core Toolbar Part', () => {
  describe('declaration, chart integrity, IDs, and schema round-trip', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(Toolbar.part)).toEqual([])
      expect(Part.problemsOf(Toolbar.deviceOnly())).toEqual([])
      expect(Part.problemsOf(Toolbar.make({ sync: 'OwnView' }))).toEqual([])
      expect(
        Block.problemsOf({ name: 'Toolbar', chart: Toolbar.chart }),
      ).toEqual([])

      for (const action of Toolbar.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })

    it('derives element IDs and round-trips Idle and Focused states through Effect Schema JSON encoding', () => {
      expect(Toolbar.rootId('editor-bar')).toBe('editor-bar-root')
      expect(Toolbar.itemId('editor-bar', 2)).toBe('editor-bar-item-2')

      const focused = fold([Toolbar.ActivateToolbarItem({ value: 'bold' })])
      for (const state of [Toolbar.initial, focused]) {
        const encoded = S.encodeUnknownSync(Toolbar.State)(state)
        const decoded = S.decodeUnknownSync(Toolbar.State)(encoded)
        expect(decoded).toEqual(state)
      }
    })
  })

  describe('roving focus: horizontal/vertical, LTR/RTL, loop, disabled items, activation, and blur', () => {
    it('roves horizontally skipping disabled items, wraps when loop is true, and clamps when loop is false', () => {
      expect(Toolbar.focusedValueOf(Toolbar.initial, baseProps)).toEqual(
        Option.some('bold'),
      )

      // ArrowRight from bold skips disabled italic -> underline
      const onUnderline = fold([
        Toolbar.PressedToolbarKey({ key: 'ArrowRight' }),
      ])
      expect(Toolbar.isFocused(onUnderline)).toBe(true)
      expect(Toolbar.focusedValueOf(onUnderline, baseProps)).toEqual(
        Option.some('underline'),
      )

      // ArrowRight -> link, then wraps -> bold
      const wrapped = fold(
        [
          Toolbar.PressedToolbarKey({ key: 'ArrowRight' }),
          Toolbar.PressedToolbarKey({ key: 'ArrowRight' }),
        ],
        baseProps,
        onUnderline,
      )
      expect(Toolbar.focusedValueOf(wrapped, baseProps)).toEqual(
        Option.some('bold'),
      )

      // loop: false clamps at edges
      const noLoopProps: Toolbar.Props = { ...baseProps, loop: false }
      const atEnd = fold(
        [Toolbar.PressedToolbarKey({ key: 'End' })],
        noLoopProps,
      )
      expect(Toolbar.focusedValueOf(atEnd, noLoopProps)).toEqual(
        Option.some('link'),
      )
      const clamped = fold(
        [Toolbar.PressedToolbarKey({ key: 'ArrowRight' })],
        noLoopProps,
        atEnd,
      )
      expect(Toolbar.focusedValueOf(clamped, noLoopProps)).toEqual(
        Option.some('link'),
      )

      // Home jumps to first enabled
      const atHome = fold(
        [Toolbar.PressedToolbarKey({ key: 'Home' })],
        noLoopProps,
        atEnd,
      )
      expect(Toolbar.focusedValueOf(atHome, noLoopProps)).toEqual(
        Option.some('bold'),
      )
    })

    it('supports Vertical orientation, RTL horizontal arrows, Enter/Space activation, disabled guards, and atRest', () => {
      const verticalProps: Toolbar.Props = {
        ...baseProps,
        orientation: 'Vertical',
      }
      // Horizontal arrows ignored in Vertical toolbar
      const ignoredH = fold(
        [Toolbar.PressedToolbarKey({ key: 'ArrowRight' })],
        verticalProps,
      )
      expect(Toolbar.isFocused(ignoredH)).toBe(false)

      // ArrowDown moves forward skipping disabled italic -> underline
      const movedV = fold(
        [Toolbar.PressedToolbarKey({ key: 'ArrowDown' })],
        verticalProps,
      )
      expect(Toolbar.focusedValueOf(movedV, verticalProps)).toEqual(
        Option.some('underline'),
      )

      // RTL flips ArrowLeft to forward and ArrowRight to backward
      const rtlProps: Toolbar.Props = { ...baseProps, direction: 'Rtl' }
      const movedRtl = fold(
        [Toolbar.PressedToolbarKey({ key: 'ArrowLeft' })],
        rtlProps,
      )
      expect(Toolbar.focusedValueOf(movedRtl, rtlProps)).toEqual(
        Option.some('underline'),
      )

      // Enter / Space activates focused item
      const activated = fold(
        [Toolbar.PressedToolbarKey({ key: 'Enter' })],
        baseProps,
        movedV,
      )
      expect(Toolbar.lastActivatedValueOf(activated)).toEqual(
        Option.some('underline'),
      )

      // Disabled item cannot be activated or focused
      const ignoredDisabled = fold([
        Toolbar.ActivateToolbarItem({ value: 'italic' }),
      ])
      expect(Toolbar.lastActivatedValueOf(ignoredDisabled)).toEqual(
        Option.none(),
      )

      // Whole disabled toolbar blocks all input
      const disabledProps: Toolbar.Props = { ...baseProps, isDisabled: true }
      expect(Toolbar.focusedValueOf(Toolbar.initial, disabledProps)).toEqual(
        Option.none(),
      )
      expect(
        Toolbar.isFocused(
          fold(
            [Toolbar.PressedToolbarKey({ key: 'ArrowRight' })],
            disabledProps,
          ),
        ),
      ).toBe(false)

      // Blur returns to Idle while keeping lastActivatedValue; atRest does the same
      const blurred = fold([Toolbar.BlurToolbar()], baseProps, activated)
      expect(Toolbar.isFocused(blurred)).toBe(false)
      expect(Toolbar.lastActivatedValueOf(blurred)).toEqual(
        Option.some('underline'),
      )
      expect(Toolbar.atRest(activated)).toEqual(blurred)
    })
  })

  describe('slot projections, reference stability, and Part.compose sync durability', () => {
    it('projects Root and Item slots with roving tabindex and reference stability', () => {
      const idleView1 = Part.view(Toolbar.part, Toolbar.initial, baseProps)
      const idleView2 = Part.view(Toolbar.part, Toolbar.initial, baseProps)
      expect(idleView1).toBe(idleView2)

      expect(Slot.ariaOf(idleView1.slot('Root'))).toMatchObject({
        role: 'group',
        id: 'editor-bar-root',
        'aria-orientation': 'horizontal',
        'aria-label': 'Formatting tools',
      })
      const boldIdle = idleView1.slot('Item', 'bold')
      const italicIdle = idleView1.slot('Item', 'italic')
      const linkIdle = idleView1.slot('Item', 'link')
      expect(Slot.ariaOf(boldIdle)).toMatchObject({
        role: 'button',
        id: 'editor-bar-item-0',
        tabindex: '0',
      })
      expect(Slot.ariaOf(italicIdle)).toMatchObject({
        'aria-disabled': 'true',
        tabindex: '-1',
      })
      expect(Slot.ariaOf(linkIdle)['tabindex']).toBe('-1')

      const focused = fold([Toolbar.FocusToolbarItem({ value: 'underline' })])
      const focusedView = Part.view(Toolbar.part, focused, baseProps)
      expect(focusedView.slot('Item', 'link')).toBe(linkIdle)
      expect(Slot.ariaOf(focusedView.slot('Item', 'underline'))).toMatchObject({
        tabindex: '0',
        'aria-current': 'true',
      })
      expect(Slot.ariaOf(focusedView.slot('Item', 'bold'))['tabindex']).toBe(
        '-1',
      )
    })

    it('syncs by default under Navigation and supports deviceOnly omission', () => {
      expect(Toolbar.synced.ActivateToolbarItem).toEqual(Synced())
      expect(Toolbar.deviceSync('OwnView').ActivateToolbarItem).toEqual(
        Device({ because: 'OwnView' }),
      )

      const HostModel = S.Struct({ count: S.Number })
      const HostMsg = S.Struct({ _tag: S.Literal('Tick') })
      const Base = makeProgram({
        id: 'toolbar-sync-test',
        version: 1,
        Model: HostModel,
        Message: HostMsg,
        init: () => [{ count: 0 }, []],
        update: (model: typeof HostModel.Type) => [model, []],
      })

      const SyncedApp = Part.compose({
        of: Base,
        parts: [Part.given(Toolbar.part, () => baseProps)],
      })
      const [initSynced] = SyncedApp.init()
      const [focusedSynced] = SyncedApp.update(
        initSynced,
        Toolbar.ActivateToolbarItem({ value: 'bold' }),
      )
      expect(
        S.encodeUnknownSync(SyncedApp.Model)(focusedSynced),
      ).toHaveProperty('parts.Toolbar._tag', 'Focused')

      const LocalApp = Part.compose({
        of: Base,
        parts: [Part.given(Toolbar.deviceOnly(), () => baseProps)],
      })
      const [initLocal] = LocalApp.init()
      const [focusedLocal] = LocalApp.update(
        initLocal,
        Toolbar.ActivateToolbarItem({ value: 'bold' }),
      )
      expect(
        S.encodeUnknownSync(LocalApp.Model)(focusedLocal),
      ).not.toHaveProperty('parts')
    })
  })
})
