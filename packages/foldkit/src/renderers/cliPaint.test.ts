import { describe, expect, it } from 'vitest'

import * as Checkbox from '../behavior/checkbox.js'
import * as Dialog from '../behavior/dialog.js'
import * as Fieldset from '../behavior/fieldset.js'
import * as Listbox from '../behavior/listbox.js'
import * as RadioGroup from '../behavior/radioGroup.js'
import * as Slot from '../behavior/slot.js'
import * as Switch from '../behavior/switch.js'
import * as Tabs from '../behavior/tabs.js'
import * as Toast from '../behavior/toast.js'
import * as Tooltip from '../behavior/tooltip.js'
import * as CheckboxFixture from '../test/checkboxFixture.js'
import * as DialogFixture from '../test/dialogFixture.js'
import * as FieldsetFixture from '../test/fieldsetFixture.js'
import * as ListboxFixture from '../test/listboxFixture.js'
import * as RadioGroupFixture from '../test/radioGroupFixture.js'
import * as SwitchFixture from '../test/switchFixture.js'
import * as TabsFixture from '../test/tabsFixture.js'
import * as ToastFixture from '../test/toastFixture.js'
import * as TooltipFixture from '../test/tooltipFixture.js'
import { paintCli, renderCli, renderPlainCli, stripAnsi } from './cliPaint.js'
import { Box, Button, Column, Row, Text, TextInput } from './elements.js'

describe('static non-interactive CLI painter (renderCli / paintCli)', () => {
  it('supports both ANSI-styled output and deterministic plain-text no-color mode', () => {
    const tree = Column(
      { gap: 1 },
      Text('Dashboard', { emphasis: 'Headline' }),
      Button({
        label: 'Notifications',
        slot: Slot.bound([], { role: 'Switch', isChecked: true }),
      }),
    )

    const ansi = renderCli(tree, { width: 50, color: true, ground: 'Dark' })
    const plain = renderCli(tree, { width: 50, color: false })
    const plainHelper = renderPlainCli(tree, { width: 50 })

    expect(ansi).toContain('\u001b[')
    expect(plain).not.toContain('\u001b[')
    expect(plain).toBe(plainHelper)
    expect(stripAnsi(ansi)).toBe(plain)
  })

  it('renders Switch slots as [● ON] and [○ OFF] including from the real Switch fixture', () => {
    const fixture = SwitchFixture.start()
    expect(renderPlainCli(fixture.tree(), { width: 60 })).toContain(
      '[○ OFF] Notifications',
    )

    fixture.send(Switch.ToggleSwitch())
    const painted = paintCli(fixture.tree(), {
      width: 60,
      color: true,
      ground: 'Dark',
    })
    expect(painted.plainText).toContain('[● ON] Notifications')
    expect(painted.text).toContain('\u001b[')
  })

  it('renders Checkbox slots as [x], [ ], and [-]', () => {
    const fixture = CheckboxFixture.start()
    expect(renderPlainCli(fixture.tree(), { width: 60 })).toContain(
      '[ ] Accept terms checkbox',
    )

    fixture.send(Checkbox.SetCheckboxChecked({ isChecked: true }))
    expect(renderPlainCli(fixture.tree(), { width: 60 })).toContain(
      '[x] Accept terms checkbox',
    )

    fixture.send(Checkbox.SetCheckboxIndeterminate())
    expect(renderPlainCli(fixture.tree(), { width: 60 })).toContain(
      '[-] Accept terms checkbox',
    )
  })

  it('renders Radio slots as (●) and ( ) from RadioGroup fixture', () => {
    const fixture = RadioGroupFixture.start()
    fixture.send(RadioGroup.SelectRadioOption({ value: 'fill' }))
    const plain = renderPlainCli(fixture.tree(), { width: 60 })
    expect(plain).toContain('( ) Brush')
    expect(plain).toContain('(●) Fill')
    expect(plain).toContain('( ) Lasso')
  })

  it('renders Tab slots as [Active] / Inactive and omits hidden TabPanels', () => {
    const fixture = TabsFixture.start()
    fixture.send(Tabs.SelectTab({ value: 'details' }))
    const plain = renderPlainCli(fixture.tree(), { width: 70 })

    expect(plain).toContain('Overview')
    expect(plain).toContain('[Details]')
    expect(plain).toContain('Profile details and preferences')
    expect(plain).not.toContain('Account overview summary')
    expect(plain).not.toContain('Two-factor keys and sessions')
  })

  it('renders Button pressed, mixed, and unpressed states', () => {
    const tree = Row(
      { gap: 1 },
      Button({
        label: 'Bold',
        slot: Slot.bound([], { role: 'Button', isPressed: true }),
      }),
      Button({
        label: 'Italic',
        slot: Slot.bound([], { role: 'Button', isPressed: false }),
      }),
      Button({
        label: 'Mixed',
        slot: Slot.bound([], { role: 'Button', isPressed: 'mixed' }),
      }),
    )

    const plain = renderPlainCli(tree, { width: 60 })
    expect(plain).toContain('[● Bold ]')
    expect(plain).toContain('[ Italic ]')
    expect(plain).toContain('[◐ Mixed ]')
  })

  it('renders TextBox slots with value, placeholder, invalid marker, and multiline frame', () => {
    const tree = Column(
      { gap: 1 },
      TextInput({
        value: 'ada@example.com',
        slot: Slot.bound([], { role: 'TextBox' }),
      }),
      TextInput({
        value: '',
        placeholder: 'Required email',
        slot: Slot.bound([], { role: 'TextBox', isInvalid: true }),
      }),
      TextInput({
        value: 'Line one\nLine two',
        label: 'Notes',
        slot: Slot.bound([], {
          role: 'TextBox',
          isMultiline: true,
          isInvalid: true,
        }),
      }),
    )

    const painted = paintCli(tree, { width: 50, color: true, ground: 'Dark' })
    expect(painted.plainText).toContain('[ ada@example.com ]')
    expect(painted.plainText).toContain('[ Required email ] !')
    expect(painted.plainText).toContain('┌─ Notes !')
    expect(painted.plainText).toContain('│ Line one')
    expect(painted.plainText).toContain('│ Line two')
    expect(painted.text).toContain('\u001b[')
  })

  it('renders Status and Alert slots as rounded banners including from Toast fixture', () => {
    const fixture = ToastFixture.start()
    fixture.send(
      Toast.ShowToast({
        id: 't1',
        title: 'Saved changes',
        description: 'Synced across devices',
        variant: 'Success',
      }),
    )
    const plain = renderPlainCli(fixture.tree(), { width: 60 })
    expect(plain).toContain('╭─ Status')
    expect(plain).toContain('Saved changes')

    const alertBox = Box(
      { slot: Slot.bound([], { role: 'Alert', label: 'Error' }) },
      Text('Connection failed'),
    )
    const alertPlain = renderPlainCli(alertBox, { width: 50 })
    expect(alertPlain).toContain('╭─ Error')
    expect(alertPlain).toContain('│ Connection failed')
  })

  it('renders Dialog (rounded) and AlertDialog (double border) as framed modal boxes', () => {
    const dialogBox = Box(
      {
        padding: 1,
        slot: Slot.bound([], {
          role: 'Dialog',
          label: 'Preferences',
          isModal: true,
        }),
      },
      Text('Theme settings'),
    )
    const dialogPlain = renderPlainCli(dialogBox, { width: 50 })
    expect(dialogPlain).toContain('╭─ Preferences')
    expect(dialogPlain).toContain('│ Theme settings')
    expect(dialogPlain).toContain('╰')

    const alertDialogBox = Box(
      {
        padding: 1,
        slot: Slot.bound([], {
          role: 'AlertDialog',
          label: 'Delete account',
          isModal: true,
        }),
      },
      Text('This cannot be undone.'),
    )
    const alertPlain = renderPlainCli(alertDialogBox, { width: 50 })
    expect(alertPlain).toContain('╔═ Delete account')
    expect(alertPlain).toContain('║ This cannot be undone.')
    expect(alertPlain).toContain('╚')

    const fixture = DialogFixture.start()
    fixture.send(Dialog.OpenDialog())
    const fixturePlain = renderPlainCli(fixture.tree(), { width: 60 })
    expect(fixturePlain).toContain('╭─ Delete item')
    expect(fixturePlain).toContain('Close dialog')
  })

  it('renders Listbox and Option slots with active and selected markers', () => {
    const fixture = ListboxFixture.start()
    fixture.send(Listbox.FocusListbox())
    fixture.send(Listbox.SelectListboxOption({ value: 'cherry' }))
    fixture.send(
      Listbox.HighlightListboxItem({
        index: 1,
        activationTrigger: 'Keyboard',
      }),
    )
    const plain = renderPlainCli(fixture.tree(), { width: 50 })

    expect(plain).toContain('┌')
    expect(plain).toContain('›   Apricot')
    expect(plain).toContain('  ✓ Cherry')
    expect(plain).toContain('└')

    fixture.send(
      Listbox.HighlightListboxItem({
        index: 3,
        activationTrigger: 'Keyboard',
      }),
    )
    const activeSelected = renderPlainCli(fixture.tree(), { width: 50 })
    expect(activeSelected).toContain('› ● Cherry')
  })

  it('renders Group slots as a fieldset border with legend derived from labelledBy', () => {
    const fixture = FieldsetFixture.start()
    fixture.send(
      Fieldset.SetFieldError({ field: 'email', message: 'Email is invalid' }),
    )
    const plain = renderPlainCli(fixture.tree(), { width: 64 })

    expect(plain).toContain('┌─ Account details')
    expect(plain).toContain('Manage contact settings for the account.')
    expect(plain).toContain('Email is invalid')
    expect(plain).toContain('[ Submit ]')
    expect(plain.split('Account details')).toHaveLength(2)
  })

  it('renders Tooltip slots only when visible as a rounded hint callout', () => {
    const fixture = TooltipFixture.start()
    const closedPlain = renderPlainCli(fixture.tree(), { width: 50 })
    expect(closedPlain).toContain('[ Save ]')
    expect(closedPlain).not.toContain('Saves your changes')

    fixture.send(Tooltip.ShowTooltip())
    const openPlain = renderPlainCli(fixture.tree(), { width: 50 })
    expect(openPlain).toContain('╭─ ⓘ')
    expect(openPlain).toContain('Saves your changes')
  })
})
