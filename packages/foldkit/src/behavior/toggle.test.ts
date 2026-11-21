import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import { Device, Synced } from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'
import * as Toggle from './toggle.js'

const baseProps: Toggle.Props = {
  id: 'mute',
}

const fold = (
  messages: ReadonlyArray<Toggle.Message>,
  props: Toggle.Props = baseProps,
  from: Toggle.State = Toggle.initial,
): Toggle.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => Toggle.chart.transition(state, message, props)[0],
  )

describe('core Toggle / Button Part', () => {
  describe('declaration and chart integrity', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(Toggle.part)).toEqual([])
      expect(Part.problemsOf(Toggle.deviceOnly())).toEqual([])
      expect(Part.problemsOf(Toggle.make({ sync: 'OwnView' }))).toEqual([])
      expect(Part.problemsOf(Toggle.make({ defaultPressed: true }))).toEqual([])
      expect(Block.problemsOf({ name: 'Toggle', chart: Toggle.chart })).toEqual(
        [],
      )
      expect(
        Block.problemsOf({
          name: 'TogglePressed',
          chart: Toggle.chartOf(Toggle.Pressed()),
        }),
      ).toEqual([])
      for (const action of Toggle.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })
  })

  describe('state transitions and guards', () => {
    it('toggles between Unpressed and Pressed and supports PressButton, ReleaseButton, and SetButtonPressed', () => {
      expect(Toggle.isUnpressed(Toggle.initial)).toBe(true)
      expect(Toggle.isPressed(Toggle.initial)).toBe(false)
      expect(Toggle.dataStateOf(Toggle.initial)).toBe('off')

      const pressed = fold([Toggle.ToggleButton()])
      expect(pressed).toEqual(Toggle.Pressed())
      expect(Toggle.isPressed(pressed)).toBe(true)
      expect(Toggle.isUnpressed(pressed)).toBe(false)
      expect(Toggle.dataStateOf(pressed)).toBe('on')

      const unpressed = fold([Toggle.ToggleButton()], baseProps, pressed)
      expect(unpressed).toEqual(Toggle.Unpressed())

      const explicitlyPressed = fold([Toggle.PressButton()])
      expect(explicitlyPressed).toEqual(Toggle.Pressed())
      expect(
        Toggle.chart.step(explicitlyPressed, Toggle.PressButton(), baseProps),
      ).toMatchObject({ _tag: 'Ignored', reason: 'NotApplicable' })

      const explicitlyReleased = fold(
        [Toggle.ReleaseButton()],
        baseProps,
        explicitlyPressed,
      )
      expect(explicitlyReleased).toEqual(Toggle.Unpressed())
      expect(
        Toggle.chart.step(
          explicitlyReleased,
          Toggle.ReleaseButton(),
          baseProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'NotApplicable' })

      expect(fold([Toggle.SetButtonPressed({ isPressed: true })])).toEqual(
        Toggle.Pressed(),
      )
      expect(
        Toggle.chart.step(
          Toggle.Pressed(),
          Toggle.SetButtonPressed({ isPressed: true }),
          baseProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })

      expect(
        fold(
          [Toggle.SetButtonPressed({ isPressed: false })],
          baseProps,
          Toggle.Pressed(),
        ),
      ).toEqual(Toggle.Unpressed())
      expect(
        Toggle.chart.step(
          Toggle.Unpressed(),
          Toggle.SetButtonPressed({ isPressed: false }),
          baseProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
    })

    it('toggles on Space and Enter keys and ignores other keys', () => {
      const viaSpace = fold([Toggle.PressedButtonKey({ key: ' ' })])
      expect(viaSpace).toEqual(Toggle.Pressed())

      const viaEnter = fold(
        [Toggle.PressedButtonKey({ key: 'Enter' })],
        baseProps,
        viaSpace,
      )
      expect(viaEnter).toEqual(Toggle.Unpressed())

      expect(
        Toggle.chart.step(
          Toggle.Unpressed(),
          Toggle.PressedButtonKey({ key: 'Escape' }),
          baseProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
    })

    it('blocks all interactive transitions when disabled or readOnly', () => {
      const disabledProps: Toggle.Props = { ...baseProps, isDisabled: true }
      const readOnlyProps: Toggle.Props = { ...baseProps, isReadOnly: true }
      const bothProps: Toggle.Props = {
        ...baseProps,
        isDisabled: true,
        isReadOnly: true,
      }

      for (const guardedProps of [disabledProps, readOnlyProps, bothProps]) {
        const startedUnpressed = Toggle.Unpressed()
        expect(
          fold([Toggle.ToggleButton()], guardedProps, startedUnpressed),
        ).toBe(startedUnpressed)
        expect(
          fold([Toggle.PressButton()], guardedProps, startedUnpressed),
        ).toBe(startedUnpressed)
        expect(
          fold(
            [Toggle.SetButtonPressed({ isPressed: true })],
            guardedProps,
            startedUnpressed,
          ),
        ).toBe(startedUnpressed)
        expect(
          fold(
            [Toggle.PressedButtonKey({ key: ' ' })],
            guardedProps,
            startedUnpressed,
          ),
        ).toBe(startedUnpressed)

        const startedPressed = Toggle.Pressed()
        expect(
          fold([Toggle.ToggleButton()], guardedProps, startedPressed),
        ).toBe(startedPressed)
        expect(
          fold([Toggle.ReleaseButton()], guardedProps, startedPressed),
        ).toBe(startedPressed)
        expect(
          fold(
            [Toggle.SetButtonPressed({ isPressed: false })],
            guardedProps,
            startedPressed,
          ),
        ).toBe(startedPressed)
        expect(
          fold(
            [Toggle.PressedButtonKey({ key: 'Enter' })],
            guardedProps,
            startedPressed,
          ),
        ).toBe(startedPressed)
      }
    })

    it('resets to defaultPressed on ResetToggle', () => {
      expect(fold([Toggle.ResetToggle()], baseProps, Toggle.Pressed())).toEqual(
        Toggle.Unpressed(),
      )
      expect(
        Toggle.chart.step(Toggle.Unpressed(), Toggle.ResetToggle(), baseProps),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })

      const defaultPressedProps: Toggle.Props = {
        ...baseProps,
        defaultPressed: true,
      }
      expect(
        fold([Toggle.ResetToggle()], defaultPressedProps, Toggle.Unpressed()),
      ).toEqual(Toggle.Pressed())
      expect(
        Toggle.chart.step(
          Toggle.Pressed(),
          Toggle.ResetToggle(),
          defaultPressedProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
    })

    it('round-trips State and Message through Schema JSON codecs', () => {
      for (const state of [
        Toggle.initialPressed(false),
        Toggle.initialPressed(true),
      ]) {
        const encoded = S.encodeSync(Toggle.State)(state)
        expect(S.decodeUnknownSync(Toggle.State)(encoded)).toEqual(state)
      }
      for (const message of [
        Toggle.ToggleButton(),
        Toggle.SetButtonPressed({ isPressed: true }),
        Toggle.PressButton(),
        Toggle.ReleaseButton(),
        Toggle.PressedButtonKey({ key: ' ' }),
        Toggle.ResetToggle(),
      ]) {
        const encoded = S.encodeSync(Toggle.Message)(message)
        expect(S.decodeUnknownSync(Toggle.Message)(encoded)).toEqual(message)
        expect(Toggle.isMessage(message)).toBe(true)
      }
    })
  })

  describe('pure button rules and element IDs', () => {
    it('derives element IDs consistently from the base id', () => {
      expect(Toggle.buttonId('bold')).toBe('bold-button')
      expect(Toggle.labelId('bold')).toBe('bold-label')
      expect(Toggle.descriptionId('bold')).toBe('bold-description')
    })

    it('evaluates ButtonType, isInteractive, canActivate, canClick, isActivationKey, and nextPressedOf', () => {
      expect(Toggle.defaultButtonType).toBe('button')
      expect(Toggle.buttonTypeOf()).toBe('button')
      expect(Toggle.buttonTypeOf({})).toBe('button')
      expect(Toggle.buttonTypeOf({ type: 'submit' })).toBe('submit')
      expect(Toggle.buttonTypeOf({ type: 'reset' })).toBe('reset')
      expect(S.is(Toggle.ButtonType)('button')).toBe(true)
      expect(S.is(Toggle.ButtonType)('submit')).toBe(true)
      expect(S.is(Toggle.ButtonType)('reset')).toBe(true)
      expect(S.is(Toggle.ButtonType)('other')).toBe(false)

      expect(Toggle.isInteractive({})).toBe(true)
      expect(Toggle.isInteractive({ isDisabled: true })).toBe(false)
      expect(Toggle.isInteractive({ isReadOnly: true })).toBe(false)

      expect(Toggle.canActivate({})).toBe(true)
      expect(Toggle.canActivate({ isDisabled: true })).toBe(false)
      expect(Toggle.canActivate({ isReadOnly: true })).toBe(false)

      expect(Toggle.canClick({})).toBe(true)
      expect(Toggle.canClick({ isDisabled: false, hasHandler: true })).toBe(
        true,
      )
      expect(Toggle.canClick({ isDisabled: true, hasHandler: true })).toBe(
        false,
      )
      expect(Toggle.canClick({ isReadOnly: true, hasHandler: true })).toBe(
        false,
      )
      expect(Toggle.canClick({ isDisabled: false, hasHandler: false })).toBe(
        false,
      )

      expect(Toggle.isActivationKey(' ')).toBe(true)
      expect(Toggle.isActivationKey('Enter')).toBe(true)
      expect(Toggle.isActivationKey('Tab')).toBe(false)

      expect(Toggle.nextPressedOf({ isPressed: false })).toEqual(
        Option.some(true),
      )
      expect(Toggle.nextPressedOf({ isPressed: true })).toEqual(
        Option.some(false),
      )
      expect(
        Toggle.nextPressedOf({ isPressed: false, isDisabled: true }),
      ).toEqual(Option.none())
      expect(
        Toggle.nextPressedOf({ isPressed: true, isReadOnly: true }),
      ).toEqual(Option.none())
    })
  })

  describe('slot projection, WAI-ARIA, and reference stability', () => {
    it('projects role=button and WAI-ARIA attributes across Button, Label, and Description', () => {
      const unpressedView = Part.view(
        Toggle.part,
        Toggle.Unpressed(),
        baseProps,
      )
      expect(Slot.ariaOf(unpressedView.slot('Button'))).toEqual({
        role: 'button',
        id: 'mute-button',
        'aria-pressed': 'false',
        'aria-labelledby': 'mute-label',
        'aria-describedby': 'mute-description',
        tabindex: '0',
      })
      expect(unpressedView.slot('Button').gestures).toEqual([
        { gesture: 'Pressed', press: 'ToggleButton' },
      ])
      expect(Slot.ariaOf(unpressedView.slot('Label'))).toEqual({
        id: 'mute-label',
      })
      expect(unpressedView.slot('Label').gestures).toEqual([
        { gesture: 'Pressed', press: 'ToggleButton' },
      ])
      expect(Slot.ariaOf(unpressedView.slot('Description'))).toEqual({
        id: 'mute-description',
      })
      expect(unpressedView.slot('Description').gestures).toEqual([])

      const pressedView = Part.view(Toggle.part, Toggle.Pressed(), {
        id: 'bold',
        label: 'Bold text',
        hasDescription: false,
        isDisabled: true,
        isReadOnly: true,
      })
      expect(Slot.ariaOf(pressedView.slot('Button'))).toEqual({
        role: 'button',
        id: 'bold-button',
        'aria-pressed': 'true',
        'aria-label': 'Bold text',
        'aria-disabled': 'true',
        'aria-readonly': 'true',
        tabindex: '0',
      })
      expect(Slot.ariaOf(pressedView.slot('Label'))).toEqual({
        id: 'bold-label',
        'aria-disabled': 'true',
      })

      const customLinked = Part.view(Toggle.part, Toggle.Unpressed(), {
        id: 'custom',
        labelledBy: 'heading-1',
        describedBy: 'hint-1',
      })
      expect(Slot.ariaOf(customLinked.slot('Button'))).toEqual({
        role: 'button',
        id: 'custom-button',
        'aria-pressed': 'false',
        'aria-labelledby': 'heading-1',
        'aria-describedby': 'hint-1',
        tabindex: '0',
      })

      const unlabelled = Part.view(Toggle.part, Toggle.Unpressed(), {
        id: 'bare',
        hasLabel: false,
        hasDescription: false,
      })
      expect(Slot.ariaOf(unlabelled.slot('Button'))).toEqual({
        role: 'button',
        id: 'bare-button',
        'aria-pressed': 'false',
        tabindex: '0',
      })

      // Generic Slot.ariaOf also supports mixed pressed state for ToggleGroup reuse
      expect(
        Slot.ariaOf(Slot.bound([], { role: 'Button', isPressed: 'mixed' })),
      ).toEqual({
        role: 'button',
        'aria-pressed': 'mixed',
      })
    })

    it('keeps view and unchanged slot bindings referentially stable', () => {
      const part = Toggle.make({ name: 'StabilityToggle' })
      const unpressed = Toggle.Unpressed()
      const first = Part.view(part, unpressed, { id: 'sync-toggle' })
      const second = Part.view(part, unpressed, { id: 'sync-toggle' })
      expect(second).toBe(first)
      expect(second.slot('Button')).toBe(first.slot('Button'))
      expect(second.slot('Label')).toBe(first.slot('Label'))
      expect(second.slot('Description')).toBe(first.slot('Description'))

      const buttonBefore = first.slot('Button')
      const labelBefore = first.slot('Label')
      const descriptionBefore = first.slot('Description')

      const after = Part.view(part, Toggle.Pressed(), { id: 'sync-toggle' })
      expect(after).not.toBe(first)
      expect(after.slot('Button')).not.toBe(buttonBefore)
      expect(after.slot('Button').isPressed).toBe(true)
      expect(after.slot('Label')).toBe(labelBefore)
      expect(after.slot('Description')).toBe(descriptionBefore)
    })
  })

  describe('Part.compose and synchronization', () => {
    const BaseModel = S.Struct({ title: S.String })
    const Rename = Catalog.action('Rename', {
      fields: { title: S.String },
      what: 'Renames the toolbar',
      why: 'To identify the formatting controls',
      meta: { label: 'Rename', keys: [] },
    })
    const baseCatalog = Catalog.make([Rename])
    const BaseProgram = makeProgram({
      id: 'toggle-compose-test',
      version: 1,
      Model: BaseModel,
      Message: baseCatalog.Message,
      init: () => [{ title: 'Toolbar' }, []],
      update: (
        model: typeof BaseModel.Type,
        message: typeof baseCatalog.Message.Type,
      ) => [{ ...model, title: message.title }, []],
      catalog: baseCatalog,
    })

    it('syncs Toggle state by default under Domain, preserves state on projectLocal, and joins the Catalog', () => {
      const App = Part.compose({
        of: BaseProgram,
        parts: [Part.given(Toggle.part, () => baseProps)],
      })
      const [model] = App.init()
      expect(model.parts['Toggle']).toEqual(Toggle.Unpressed())

      const [pressed] = App.update(model, Toggle.ToggleButton())
      expect(pressed.parts['Toggle']).toEqual(Toggle.Pressed())

      const encoded = S.encodeUnknownSync(App.Model)(pressed)
      expect(encoded).toMatchObject({
        title: 'Toolbar',
        parts: { Toggle: { _tag: 'Pressed' } },
      })

      const synchronization = Option.getOrThrow(
        Option.fromNullishOr(App.synchronization),
      )
      expect(synchronization.messageCategory(Toggle.ToggleButton())).toBe(
        'Domain',
      )
      expect(synchronization.isLocalOnly?.(Toggle.ToggleButton())).toBe(false)
      expect(synchronization.paceOf?.(Toggle.ToggleButton())).toEqual(Synced())
      expect(synchronization.projectLocal?.(pressed).parts['Toggle']).toEqual(
        Toggle.Pressed(),
      )

      const entryTags = Array.map(
        App.interaction?.entries(model) ?? [],
        entry => entry.tag,
      )
      expect(entryTags).toEqual([
        'Rename',
        'ToggleButton',
        'SetButtonPressed',
        'PressButton',
        'ReleaseButton',
      ])
    })

    it('supports Toggle.deviceOnly and defaultPressed in Part.compose', () => {
      const localToggle = Toggle.deviceOnly({
        name: 'LocalToggle',
        because: 'OwnChoice',
        defaultPressed: true,
      })
      const App = Part.compose({
        of: BaseProgram,
        parts: [Part.given(localToggle, () => baseProps)],
      })
      const [model] = App.init()
      expect(model.parts['LocalToggle']).toEqual(Toggle.Pressed())

      const [released] = App.update(model, Toggle.ReleaseButton())
      expect(released.parts['LocalToggle']).toEqual(Toggle.Unpressed())

      const encoded = S.encodeUnknownSync(App.Model)(released)
      expect(JSON.stringify(encoded)).not.toContain('LocalToggle')

      const synchronization = Option.getOrThrow(
        Option.fromNullishOr(App.synchronization),
      )
      expect(synchronization.isLocalOnly?.(Toggle.ToggleButton())).toBe(true)
      expect(synchronization.paceOf?.(Toggle.ToggleButton())).toEqual(
        Device({ because: 'OwnChoice' }),
      )

      const kept = synchronization.keepOnRefold?.(released, model)
      expect(kept?.parts['LocalToggle']).toEqual(Toggle.Unpressed())
    })
  })
})
