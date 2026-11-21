import { Option } from 'effect'
import { Dialog } from 'foldkit/behavior'
import type { ButtonNode } from 'foldkit/renderers'
import { DialogFixture } from 'foldkit/test'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { callProp, firstOf, hostsOf, propsOf } from '../test/elements.js'
import { paintTree } from './screen.js'

vi.mock('react-native', async () => (await import('../test/native.js')).native)
vi.mock('react-native-svg', async () => (await import('../test/native.js')).svg)
vi.mock('../theme/themed.js', async () => {
  const { lightLook: look } = await import('./look.js')
  return { useLook: () => look }
})

// NOTE: proves the core Dialog Part on the React Native painter through the
// existing generic RN host (`interaction/host.ts`), with zero Dialog-specific
// painter logic.

const stage = (mode: 'dialog' | 'alertdialog' = 'dialog') => {
  const fixture =
    mode === 'alertdialog' ? DialogFixture.startAlert() : DialogFixture.start()
  const onPress = (button: ButtonNode): void => {
    const tag = button.action ?? button.token
    if (tag !== undefined) {
      fixture.press(tag)
    }
  }
  const buttonNamed = (label: string): ReactElement =>
    firstOf(hostsOf(paintTree(fixture.tree(), { onPress }), 'Pressable'), el =>
      String(propsOf(el)['accessibilityLabel']).endsWith(label),
    )

  return { fixture, buttonNamed }
}

describe('core Dialog Part on the React Native generic host', () => {
  it('opens, reflects expanded and focused state, traps Tab, dismisses via backdrop, and restores return focus', () => {
    const staged = stage('dialog')

    expect(
      propsOf(staged.buttonNamed('Open dialog'))['accessibilityState'],
    ).toMatchObject({ expanded: false })

    // Tap trigger -> opens dialog
    callProp(staged.buttonNamed('Open dialog'), 'onPress')
    expect(Dialog.isOpen(staged.fixture.dialogState())).toBe(true)
    expect(
      propsOf(staged.buttonNamed('Open dialog'))['accessibilityState'],
    ).toMatchObject({ expanded: true })
    expect(
      propsOf(staged.buttonNamed('Close dialog'))['accessibilityState'],
    ).toMatchObject({ selected: true })

    // Tab moves focus off CloseButton onto confirm target
    staged.fixture.send(Dialog.PressedDialogKey({ key: 'Tab' }))
    expect(Dialog.focusedIdOf(staged.fixture.dialogState())).toEqual(
      Option.some('fixture-dialog-confirm'),
    )
    expect(
      propsOf(staged.buttonNamed('Close dialog'))['accessibilityState'],
    ).toMatchObject({ selected: false })

    // Tap backdrop -> dismisses dialog and records return focus
    callProp(staged.buttonNamed('Dismiss backdrop'), 'onPress')
    expect(Dialog.isOpen(staged.fixture.dialogState())).toBe(false)
    expect(Dialog.returnFocusIdOf(staged.fixture.dialogState())).toEqual(
      Option.some('fixture-dialog-trigger'),
    )
  })

  it('refuses backdrop dismissal for alertdialog and closes on CloseButton tap', () => {
    const staged = stage('alertdialog')

    callProp(staged.buttonNamed('Open dialog'), 'onPress')
    expect(Dialog.isOpen(staged.fixture.dialogState())).toBe(true)

    callProp(staged.buttonNamed('Dismiss backdrop'), 'onPress')
    expect(Dialog.isOpen(staged.fixture.dialogState())).toBe(true)

    callProp(staged.buttonNamed('Close dialog'), 'onPress')
    expect(Dialog.isOpen(staged.fixture.dialogState())).toBe(false)
  })
})
