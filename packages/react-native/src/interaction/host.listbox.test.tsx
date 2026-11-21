import { Listbox } from 'foldkit/behavior'
import type { ButtonNode } from 'foldkit/renderers'
import { ListboxFixture } from 'foldkit/test'
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

// NOTE: proves the core Listbox Part on the React Native painter through the
// existing generic RN host (`interaction/host.ts`), with zero Listbox-specific
// painter logic.

const stage = (overrides: Partial<Listbox.Props> = {}) => {
  const fixture = ListboxFixture.start(overrides)
  const onPress = (button: ButtonNode): void => {
    const tag = button.action ?? button.token
    if (tag !== undefined) {
      fixture.press(tag)
    }
  }
  const painted = (): ReactElement => paintTree(fixture.tree(), { onPress })
  const buttonNamed = (label: string): ReactElement =>
    firstOf(
      hostsOf(painted(), 'Pressable'),
      element => propsOf(element)['accessibilityLabel'] === label,
    )
  const viewWithId = (nativeID: string): ReactElement =>
    firstOf(
      hostsOf(painted(), 'View'),
      element => propsOf(element)['nativeID'] === nativeID,
    )

  return { fixture, buttonNamed, viewWithId }
}

describe('core Listbox Part on the React Native generic host', () => {
  it('paints listbox container, label, and option selected/disabled accessibility state through generic RN host', () => {
    const staged = stage({ label: 'Favorite fruit' })

    const container = staged.viewWithId('fixture-listbox-items')
    expect(propsOf(container)['nativeID']).toBe('fixture-listbox-items')
    expect(propsOf(container)['accessibilityLabel']).toBe('Favorite fruit')
    expect(
      propsOf(staged.viewWithId('fixture-listbox-label'))['nativeID'],
    ).toBe('fixture-listbox-label')

    expect(
      propsOf(staged.buttonNamed('Apple'))['accessibilityState'],
    ).toMatchObject({ selected: false, disabled: false })
    expect(
      propsOf(staged.buttonNamed('Banana'))['accessibilityState'],
    ).toMatchObject({ selected: false, disabled: true })

    // Tap Apricot -> selected
    callProp(staged.buttonNamed('Apricot'), 'onPress')
    expect(Listbox.selectedValuesOf(staged.fixture.listboxState())).toEqual([
      'apricot',
    ])
    expect(
      propsOf(staged.buttonNamed('Apricot'))['accessibilityState'],
    ).toMatchObject({ selected: true })
    expect(
      propsOf(staged.buttonNamed('Apple'))['accessibilityState'],
    ).toMatchObject({ selected: false })

    // Disabled Banana ignores press
    staged.fixture.press('SelectListboxOption:banana')
    expect(Listbox.selectedValuesOf(staged.fixture.listboxState())).toEqual([
      'apricot',
    ])
  })

  it('supports Multiple mode toggling and range selection on the RN generic host', () => {
    const multi = stage({ selectionMode: 'Multiple' })

    callProp(multi.buttonNamed('Apple'), 'onPress')
    callProp(multi.buttonNamed('Cherry'), 'onPress')
    expect(Listbox.selectedValuesOf(multi.fixture.listboxState())).toEqual([
      'apple',
      'cherry',
    ])
    expect(
      propsOf(multi.buttonNamed('Apple'))['accessibilityState'],
    ).toMatchObject({ selected: true })
    expect(
      propsOf(multi.buttonNamed('Cherry'))['accessibilityState'],
    ).toMatchObject({ selected: true })

    // Tap Apple again -> toggles off
    callProp(multi.buttonNamed('Apple'), 'onPress')
    expect(Listbox.selectedValuesOf(multi.fixture.listboxState())).toEqual([
      'cherry',
    ])
    expect(
      propsOf(multi.buttonNamed('Apple'))['accessibilityState'],
    ).toMatchObject({ selected: false })

    // SelectAll selects all enabled options
    multi.fixture.send(Listbox.SelectAllListboxOptions())
    expect(
      propsOf(multi.buttonNamed('Date'))['accessibilityState'],
    ).toMatchObject({ selected: true })
    expect(
      propsOf(multi.buttonNamed('Banana'))['accessibilityState'],
    ).toMatchObject({ selected: false, disabled: true })
  })
})
