import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import { Device, Synced } from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'
import * as Switch from './switch.js'

const baseProps: Switch.Props = {
  id: 'notifications',
  name: 'notifications',
}

const fold = (
  messages: ReadonlyArray<Switch.Message>,
  props: Switch.Props = baseProps,
  from: Switch.State = Switch.initial,
): Switch.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => Switch.chart.transition(state, message, props)[0],
  )

describe('core Switch Part', () => {
  describe('declaration and chart integrity', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(Switch.part)).toEqual([])
      expect(Part.problemsOf(Switch.deviceOnly())).toEqual([])
      expect(Part.problemsOf(Switch.make({ sync: 'OwnView' }))).toEqual([])
      expect(Part.problemsOf(Switch.make({ defaultChecked: true }))).toEqual([])
      expect(Block.problemsOf({ name: 'Switch', chart: Switch.chart })).toEqual(
        [],
      )
      expect(
        Block.problemsOf({
          name: 'SwitchOn',
          chart: Switch.chartOf(Switch.On()),
        }),
      ).toEqual([])
      for (const action of Switch.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })
  })

  describe('state transitions and guards', () => {
    it('toggles between Off and On and supports TurnSwitchOn, TurnSwitchOff, and SetSwitchChecked', () => {
      expect(Switch.isOff(Switch.initial)).toBe(true)
      expect(Switch.isChecked(Switch.initial)).toBe(false)
      expect(Switch.dataStateOf(Switch.initial)).toBe('unchecked')

      const on = fold([Switch.ToggleSwitch()])
      expect(on).toEqual(Switch.On())
      expect(Switch.isOn(on)).toBe(true)
      expect(Switch.isChecked(on)).toBe(true)
      expect(Switch.dataStateOf(on)).toBe('checked')

      const off = fold([Switch.ToggleSwitch()], baseProps, on)
      expect(off).toEqual(Switch.Off())

      const turnedOn = fold([Switch.TurnSwitchOn()])
      expect(turnedOn).toEqual(Switch.On())
      expect(
        Switch.chart.step(turnedOn, Switch.TurnSwitchOn(), baseProps),
      ).toMatchObject({ _tag: 'Ignored', reason: 'NotApplicable' })

      const turnedOff = fold([Switch.TurnSwitchOff()], baseProps, turnedOn)
      expect(turnedOff).toEqual(Switch.Off())
      expect(
        Switch.chart.step(turnedOff, Switch.TurnSwitchOff(), baseProps),
      ).toMatchObject({ _tag: 'Ignored', reason: 'NotApplicable' })

      expect(fold([Switch.SetSwitchChecked({ isChecked: true })])).toEqual(
        Switch.On(),
      )
      expect(
        Switch.chart.step(
          Switch.On(),
          Switch.SetSwitchChecked({ isChecked: true }),
          baseProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })

      expect(
        fold(
          [Switch.SetSwitchChecked({ isChecked: false })],
          baseProps,
          Switch.On(),
        ),
      ).toEqual(Switch.Off())
      expect(
        Switch.chart.step(
          Switch.Off(),
          Switch.SetSwitchChecked({ isChecked: false }),
          baseProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
    })

    it('toggles on Space and Enter keys and ignores other keys', () => {
      const viaSpace = fold([Switch.PressedSwitchKey({ key: ' ' })])
      expect(viaSpace).toEqual(Switch.On())

      const viaEnter = fold(
        [Switch.PressedSwitchKey({ key: 'Enter' })],
        baseProps,
        viaSpace,
      )
      expect(viaEnter).toEqual(Switch.Off())

      expect(
        Switch.chart.step(
          Switch.Off(),
          Switch.PressedSwitchKey({ key: 'Escape' }),
          baseProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
    })

    it('blocks all interactive transitions when disabled or readOnly', () => {
      const disabledProps: Switch.Props = { ...baseProps, isDisabled: true }
      const readOnlyProps: Switch.Props = { ...baseProps, isReadOnly: true }
      const bothProps: Switch.Props = {
        ...baseProps,
        isDisabled: true,
        isReadOnly: true,
      }

      for (const guardedProps of [disabledProps, readOnlyProps, bothProps]) {
        const startedOff = Switch.Off()
        expect(fold([Switch.ToggleSwitch()], guardedProps, startedOff)).toBe(
          startedOff,
        )
        expect(fold([Switch.TurnSwitchOn()], guardedProps, startedOff)).toBe(
          startedOff,
        )
        expect(
          fold(
            [Switch.SetSwitchChecked({ isChecked: true })],
            guardedProps,
            startedOff,
          ),
        ).toBe(startedOff)
        expect(
          fold(
            [Switch.PressedSwitchKey({ key: ' ' })],
            guardedProps,
            startedOff,
          ),
        ).toBe(startedOff)

        const startedOn = Switch.On()
        expect(fold([Switch.ToggleSwitch()], guardedProps, startedOn)).toBe(
          startedOn,
        )
        expect(fold([Switch.TurnSwitchOff()], guardedProps, startedOn)).toBe(
          startedOn,
        )
        expect(
          fold(
            [Switch.SetSwitchChecked({ isChecked: false })],
            guardedProps,
            startedOn,
          ),
        ).toBe(startedOn)
        expect(
          fold(
            [Switch.PressedSwitchKey({ key: 'Enter' })],
            guardedProps,
            startedOn,
          ),
        ).toBe(startedOn)
      }
    })

    it('resets to defaultChecked on ResetSwitch', () => {
      expect(fold([Switch.ResetSwitch()], baseProps, Switch.On())).toEqual(
        Switch.Off(),
      )
      expect(
        Switch.chart.step(Switch.Off(), Switch.ResetSwitch(), baseProps),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })

      const defaultOnProps: Switch.Props = {
        ...baseProps,
        defaultChecked: true,
      }
      expect(
        fold([Switch.ResetSwitch()], defaultOnProps, Switch.Off()),
      ).toEqual(Switch.On())
      expect(
        Switch.chart.step(Switch.On(), Switch.ResetSwitch(), defaultOnProps),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
    })

    it('round-trips State and Message through Schema JSON codecs', () => {
      for (const state of [
        Switch.initialChecked(false),
        Switch.initialChecked(true),
      ]) {
        const encoded = S.encodeSync(Switch.State)(state)
        expect(S.decodeUnknownSync(Switch.State)(encoded)).toEqual(state)
      }
      for (const message of [
        Switch.ToggleSwitch(),
        Switch.SetSwitchChecked({ isChecked: true }),
        Switch.TurnSwitchOn(),
        Switch.TurnSwitchOff(),
        Switch.PressedSwitchKey({ key: ' ' }),
        Switch.ResetSwitch(),
      ]) {
        const encoded = S.encodeSync(Switch.Message)(message)
        expect(S.decodeUnknownSync(Switch.Message)(encoded)).toEqual(message)
        expect(Switch.isMessage(message)).toBe(true)
      }
    })
  })

  describe('pure rules and element IDs', () => {
    it('derives element IDs consistently from the base id', () => {
      expect(Switch.controlId('alerts')).toBe('alerts-control')
      expect(Switch.labelId('alerts')).toBe('alerts-label')
      expect(Switch.descriptionId('alerts')).toBe('alerts-description')
      expect(Switch.thumbId('alerts')).toBe('alerts-thumb')
      expect(Switch.hiddenInputId('alerts')).toBe('alerts-input')
    })

    it('evaluates keyboard helpers, nextCheckedOf, and form values', () => {
      expect(Switch.isToggleKey(' ')).toBe(true)
      expect(Switch.isToggleKey('Enter')).toBe(false)
      expect(Switch.isToggleKey('Escape')).toBe(false)

      expect(Switch.isActivationKey(' ')).toBe(true)
      expect(Switch.isActivationKey('Enter')).toBe(true)
      expect(Switch.isActivationKey('Tab')).toBe(false)

      expect(Switch.nextCheckedOf({ isChecked: false })).toEqual(
        Option.some(true),
      )
      expect(Switch.nextCheckedOf({ isChecked: true })).toEqual(
        Option.some(false),
      )
      expect(
        Switch.nextCheckedOf({ isChecked: false, isDisabled: true }),
      ).toEqual(Option.none())
      expect(
        Switch.nextCheckedOf({ isChecked: true, isReadOnly: true }),
      ).toEqual(Option.none())

      expect(Switch.formValueOf(true)).toBe('on')
      expect(Switch.formValueOf(false)).toBe('')
      expect(Switch.formValueOf(true, 'enabled')).toBe('enabled')
      expect(Switch.formValueOf(false, 'enabled')).toBe('')

      expect(Switch.stateFormValueOf(Switch.On(), baseProps)).toBe('on')
      expect(
        Switch.stateFormValueOf(Switch.On(), { ...baseProps, value: 'yes' }),
      ).toBe('yes')
      expect(
        Switch.stateFormValueOf(Switch.Off(), { ...baseProps, value: 'yes' }),
      ).toBe('')

      expect(Switch.isInvalidOf(baseProps)).toBe(false)
      expect(Switch.isInvalidOf({ ...baseProps, isInvalid: true })).toBe(true)
    })
  })

  describe('slot projection, WAI-ARIA, and reference stability', () => {
    it('projects role=switch and WAI-ARIA attributes across Control, Label, and Description', () => {
      const offView = Part.view(Switch.part, Switch.Off(), baseProps)
      expect(Slot.ariaOf(offView.slot('Control'))).toEqual({
        role: 'switch',
        id: 'notifications-control',
        'aria-checked': 'false',
        'aria-labelledby': 'notifications-label',
        'aria-describedby': 'notifications-description',
        tabindex: '0',
      })
      expect(offView.slot('Control').gestures).toEqual([
        { gesture: 'Pressed', press: 'ToggleSwitch' },
      ])
      expect(Slot.ariaOf(offView.slot('Label'))).toEqual({
        id: 'notifications-label',
      })
      expect(offView.slot('Label').gestures).toEqual([
        { gesture: 'Pressed', press: 'ToggleSwitch' },
      ])
      expect(Slot.ariaOf(offView.slot('Description'))).toEqual({
        id: 'notifications-description',
      })
      expect(offView.slot('Description').gestures).toEqual([])

      const onView = Part.view(Switch.part, Switch.On(), {
        id: 'alerts',
        label: 'Email alerts',
        hasDescription: false,
        isDisabled: true,
        isReadOnly: true,
        isRequired: true,
      })
      expect(Slot.ariaOf(onView.slot('Control'))).toEqual({
        role: 'switch',
        id: 'alerts-control',
        'aria-checked': 'true',
        'aria-label': 'Email alerts',
        'aria-disabled': 'true',
        'aria-readonly': 'true',
        'aria-required': 'true',
        tabindex: '0',
      })
      expect(Slot.ariaOf(onView.slot('Label'))).toEqual({
        id: 'alerts-label',
        'aria-disabled': 'true',
      })

      const unlabelled = Part.view(Switch.part, Switch.Off(), {
        id: 'bare',
        hasLabel: false,
        hasDescription: false,
      })
      expect(Slot.ariaOf(unlabelled.slot('Control'))).toEqual({
        role: 'switch',
        id: 'bare-control',
        'aria-checked': 'false',
        tabindex: '0',
      })

      // Generic Slot.ariaOf also supports mixed state for Checkbox reuse
      expect(
        Slot.ariaOf(Slot.bound([], { role: 'Switch', isChecked: 'mixed' })),
      ).toEqual({
        role: 'switch',
        'aria-checked': 'mixed',
      })
    })

    it('keeps view and unchanged slot bindings referentially stable', () => {
      const part = Switch.make({ name: 'StabilitySwitch' })
      const off = Switch.Off()
      const first = Part.view(part, off, { id: 'sync-toggle' })
      const second = Part.view(part, off, { id: 'sync-toggle' })
      expect(second).toBe(first)
      expect(second.slot('Control')).toBe(first.slot('Control'))
      expect(second.slot('Label')).toBe(first.slot('Label'))
      expect(second.slot('Description')).toBe(first.slot('Description'))

      const controlBefore = first.slot('Control')
      const labelBefore = first.slot('Label')
      const descriptionBefore = first.slot('Description')

      const after = Part.view(part, Switch.On(), { id: 'sync-toggle' })
      expect(after).not.toBe(first)
      expect(after.slot('Control')).not.toBe(controlBefore)
      expect(after.slot('Control').isChecked).toBe(true)
      expect(after.slot('Label')).toBe(labelBefore)
      expect(after.slot('Description')).toBe(descriptionBefore)
    })
  })

  describe('Part.compose and synchronization', () => {
    const BaseModel = S.Struct({ label: S.String })
    const Rename = Catalog.action('Rename', {
      fields: { label: S.String },
      what: 'Renames the settings panel',
      why: 'To identify the settings group',
      meta: { label: 'Rename', keys: [] },
    })
    const baseCatalog = Catalog.make([Rename])
    const BaseProgram = makeProgram({
      id: 'switch-compose-test',
      version: 1,
      Model: BaseModel,
      Message: baseCatalog.Message,
      init: () => [{ label: 'Settings' }, []],
      update: (
        model: typeof BaseModel.Type,
        message: typeof baseCatalog.Message.Type,
      ) => [{ ...model, label: message.label }, []],
      catalog: baseCatalog,
    })

    it('syncs Switch state by default under Domain, preserves state on projectLocal, and joins the Catalog', () => {
      const App = Part.compose({
        of: BaseProgram,
        parts: [Part.given(Switch.part, () => baseProps)],
      })
      const [model] = App.init()
      expect(model.parts['Switch']).toEqual(Switch.Off())

      const [toggled] = App.update(model, Switch.ToggleSwitch())
      expect(toggled.parts['Switch']).toEqual(Switch.On())

      const encoded = S.encodeUnknownSync(App.Model)(toggled)
      expect(encoded).toMatchObject({
        label: 'Settings',
        parts: { Switch: { _tag: 'On' } },
      })

      const synchronization = Option.getOrThrow(
        Option.fromNullishOr(App.synchronization),
      )
      expect(synchronization.messageCategory(Switch.ToggleSwitch())).toBe(
        'Domain',
      )
      expect(synchronization.isLocalOnly?.(Switch.ToggleSwitch())).toBe(false)
      expect(synchronization.paceOf?.(Switch.ToggleSwitch())).toEqual(Synced())
      expect(synchronization.projectLocal?.(toggled).parts['Switch']).toEqual(
        Switch.On(),
      )

      const entryTags = Array.map(
        App.interaction?.entries(model) ?? [],
        entry => entry.tag,
      )
      expect(entryTags).toEqual([
        'Rename',
        'ToggleSwitch',
        'SetSwitchChecked',
        'TurnSwitchOn',
        'TurnSwitchOff',
      ])
    })

    it('supports Switch.deviceOnly and defaultChecked in Part.compose', () => {
      const localSwitch = Switch.deviceOnly({
        name: 'LocalSwitch',
        because: 'OwnChoice',
        defaultChecked: true,
      })
      const App = Part.compose({
        of: BaseProgram,
        parts: [Part.given(localSwitch, () => baseProps)],
      })
      const [model] = App.init()
      expect(model.parts['LocalSwitch']).toEqual(Switch.On())

      const [turnedOff] = App.update(model, Switch.TurnSwitchOff())
      expect(turnedOff.parts['LocalSwitch']).toEqual(Switch.Off())

      const encoded = S.encodeUnknownSync(App.Model)(turnedOff)
      expect(JSON.stringify(encoded)).not.toContain('LocalSwitch')

      const synchronization = Option.getOrThrow(
        Option.fromNullishOr(App.synchronization),
      )
      expect(synchronization.isLocalOnly?.(Switch.ToggleSwitch())).toBe(true)
      expect(synchronization.paceOf?.(Switch.ToggleSwitch())).toEqual(
        Device({ because: 'OwnChoice' }),
      )

      const kept = synchronization.keepOnRefold?.(turnedOff, model)
      expect(kept?.parts['LocalSwitch']).toEqual(Switch.Off())
    })
  })
})
