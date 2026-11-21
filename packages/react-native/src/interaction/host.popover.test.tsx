import { Option } from 'effect'
import { Popover } from 'foldkit/behavior'
import type { ButtonNode } from 'foldkit/renderers'
import { PopoverFixture } from 'foldkit/test'
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

// NOTE: proves the core Popover Part on the React Native painter through the
// existing generic RN host (`interaction/host.ts`), with zero Popover-specific
// painter logic.

const stage = (mode: 'non-modal' | 'modal' = 'non-modal') => {
  const fixture =
    mode === 'modal' ? PopoverFixture.startModal() : PopoverFixture.start()
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

describe('core Popover Part on the React Native generic host', () => {
  it('opens non-modal popover, reflects expanded and focused state, dismisses on blur and backdrop', () => {
    const staged = stage('non-modal')

    expect(
      propsOf(staged.buttonNamed('Open popover'))['accessibilityState'],
    ).toMatchObject({ expanded: false })

    // Tap trigger -> opens popover
    callProp(staged.buttonNamed('Open popover'), 'onPress')
    expect(Popover.isOpen(staged.fixture.popoverState())).toBe(true)
    expect(
      propsOf(staged.buttonNamed('Open popover'))['accessibilityState'],
    ).toMatchObject({ expanded: true })
    expect(
      propsOf(staged.buttonNamed('Close popover'))['accessibilityState'],
    ).toMatchObject({ selected: true })

    // Panel blur closes without restoring focus
    staged.fixture.send(Popover.BlurredPopoverPanel())
    expect(Popover.isOpen(staged.fixture.popoverState())).toBe(false)
    expect(Popover.returnFocusIdOf(staged.fixture.popoverState())).toEqual(
      Option.none(),
    )

    // Reopen and tap backdrop -> dismisses popover and records return focus
    callProp(staged.buttonNamed('Open popover'), 'onPress')
    callProp(staged.buttonNamed('Dismiss backdrop'), 'onPress')
    expect(Popover.isOpen(staged.fixture.popoverState())).toBe(false)
    expect(Popover.returnFocusIdOf(staged.fixture.popoverState())).toEqual(
      Option.some('fixture-popover-button'),
    )
  })

  it('traps Tab focus in modal mode and closes on CloseButton tap', () => {
    const staged = stage('modal')

    callProp(staged.buttonNamed('Open popover'), 'onPress')
    expect(Popover.isOpen(staged.fixture.popoverState())).toBe(true)
    expect(
      propsOf(staged.buttonNamed('Close popover'))['accessibilityState'],
    ).toMatchObject({ selected: true })

    // Tab moves focus off CloseButton onto apply target
    staged.fixture.send(Popover.PressedPopoverKey({ key: 'Tab' }))
    expect(Popover.focusedIdOf(staged.fixture.popoverState())).toEqual(
      Option.some('fixture-modal-popover-apply'),
    )
    expect(
      propsOf(staged.buttonNamed('Close popover'))['accessibilityState'],
    ).toMatchObject({ selected: false })

    // CloseButton closes modal popover and restores return focus
    callProp(staged.buttonNamed('Close popover'), 'onPress')
    expect(Popover.isOpen(staged.fixture.popoverState())).toBe(false)
    expect(Popover.returnFocusIdOf(staged.fixture.popoverState())).toEqual(
      Option.some('fixture-modal-popover-button'),
    )
  })
})
