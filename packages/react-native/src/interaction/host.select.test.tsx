import { Select } from 'foldkit/behavior'
import type { ButtonNode } from 'foldkit/renderers'
import { SelectFixture } from 'foldkit/test'
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

// NOTE: proves the core Select Part on the React Native painter through the
// existing generic RN host (`interaction/host.ts`), with zero Select-specific
// painter logic.

const stage = (overrides: Partial<Select.Props> = {}) => {
  const fixture = SelectFixture.start(overrides)
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

describe('core Select Part on the React Native generic host', () => {
  it('paints trigger expanded state, hidden/visible content container, and option selected/disabled accessibility state through generic RN host', () => {
    const staged = stage({ label: 'Favorite fruit' })

    expect(propsOf(staged.viewWithId('fixture-select-label'))['nativeID']).toBe(
      'fixture-select-label',
    )
    expect(
      propsOf(staged.viewWithId('fixture-select-description'))['nativeID'],
    ).toBe('fixture-select-description')

    // Closed initially: trigger expanded=false, content hidden from accessibility
    const closedTrigger = staged.buttonNamed('Choose a fruit')
    expect(propsOf(closedTrigger)['accessibilityState']).toMatchObject({
      expanded: false,
      disabled: false,
    })
    const closedContent = staged.viewWithId('fixture-select-content')
    expect(propsOf(closedContent)['accessibilityElementsHidden']).toBe(true)

    // Tap trigger -> opens popup
    callProp(closedTrigger, 'onPress')
    expect(Select.isOpen(staged.fixture.selectState())).toBe(true)
    expect(
      propsOf(staged.buttonNamed('Choose a fruit'))['accessibilityState'],
    ).toMatchObject({ expanded: true })
    expect(
      propsOf(staged.viewWithId('fixture-select-content'))[
        'accessibilityElementsHidden'
      ],
    ).toBeUndefined()

    // Disabled Banana option reports disabled: true and ignores press
    expect(
      propsOf(staged.buttonNamed('Banana'))['accessibilityState'],
    ).toMatchObject({ selected: false, disabled: true })
    staged.fixture.press('SelectOption:banana')
    expect(Select.isSelectionEmpty(staged.fixture.selectState())).toBe(true)

    // Tap Apricot -> selects Apricot, closes popup, updates trigger label
    callProp(staged.buttonNamed('Apricot'), 'onPress')
    expect(Select.isClosed(staged.fixture.selectState())).toBe(true)
    expect(Select.selectedValuesOf(staged.fixture.selectState())).toEqual([
      'apricot',
    ])
    expect(
      propsOf(staged.buttonNamed('Apricot'))['accessibilityState'],
    ).toMatchObject({ expanded: false })
  })

  it('supports Multiple mode toggling and backdrop dismissal on the RN generic host', () => {
    const multi = stage({ selectionMode: 'Multiple' })

    callProp(multi.buttonNamed('Choose a fruit'), 'onPress')
    callProp(multi.buttonNamed('Apple'), 'onPress')
    callProp(multi.buttonNamed('Cherry'), 'onPress')

    expect(Select.isOpen(multi.fixture.selectState())).toBe(true)
    expect(Select.selectedValuesOf(multi.fixture.selectState())).toEqual([
      'apple',
      'cherry',
    ])
    expect(
      propsOf(multi.buttonNamed('Apple'))['accessibilityState'],
    ).toMatchObject({ selected: true })
    expect(
      propsOf(multi.buttonNamed('Cherry'))['accessibilityState'],
    ).toMatchObject({ selected: true })
    expect(
      propsOf(multi.buttonNamed('Apple, Cherry'))['accessibilityState'],
    ).toMatchObject({ expanded: true })

    // Tap backdrop dismiss button -> closes while preserving both selections
    callProp(multi.buttonNamed('Dismiss select'), 'onPress')
    expect(Select.isClosed(multi.fixture.selectState())).toBe(true)
    expect(Select.selectedValuesOf(multi.fixture.selectState())).toEqual([
      'apple',
      'cherry',
    ])
  })
})
