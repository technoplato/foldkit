import { Tooltip } from 'foldkit/behavior'
import type { ButtonNode } from 'foldkit/renderers'
import { TooltipFixture } from 'foldkit/test'
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

// NOTE: proves the core Tooltip Part on the React Native painter through the
// existing generic RN host (`interaction/host.ts`), with zero Tooltip-specific
// painter logic.

const stageRunning = (fixture: TooltipFixture.Running) => {
  const onPress = (button: ButtonNode): void => {
    const tag = button.action ?? button.token
    if (tag !== undefined) {
      fixture.press(tag)
    }
  }
  const painted = (): ReactElement => paintTree(fixture.tree(), { onPress })
  const buttonNamed = (label: string): ReactElement =>
    firstOf(hostsOf(painted(), 'Pressable'), element =>
      String(propsOf(element)['accessibilityLabel']).endsWith(label),
    )
  const viewWithId = (nativeID: string): ReactElement =>
    firstOf(
      hostsOf(painted(), 'View'),
      element => propsOf(element)['nativeID'] === nativeID,
    )

  return { fixture, buttonNamed, viewWithId }
}

describe('core Tooltip Part on the React Native generic host', () => {
  it('opens on long press, hides panel accessibility when closed, supports focus/Escape, and preserves primary tap action via generic RN host', () => {
    const staged = stageRunning(TooltipFixture.start())

    // Closed initially: content container is hidden from accessibility
    const closedPanel = staged.viewWithId('fixture-tooltip-panel')
    expect(propsOf(closedPanel)['accessibilityElementsHidden']).toBe(true)
    expect(propsOf(closedPanel)['importantForAccessibility']).toBe(
      'no-hide-descendants',
    )

    // Primary tap runs the trigger's own ConfirmAction without breaking tooltip state
    callProp(staged.buttonNamed('Save'), 'onPress')
    expect(staged.fixture.model().confirmedCount).toBe(1)
    expect(Tooltip.isOpen(staged.fixture.tooltipState())).toBe(false)

    // Long press on trigger invokes ShowTooltip via generic HeldLong hostPropsOf
    callProp(staged.buttonNamed('Save'), 'onLongPress')
    expect(Tooltip.isOpen(staged.fixture.tooltipState())).toBe(true)

    const openPanel = staged.viewWithId('fixture-tooltip-panel')
    expect(propsOf(openPanel)['accessibilityElementsHidden']).toBeUndefined()

    // Pressing Hide tooltip closes and hides accessibility again
    callProp(staged.buttonNamed('Hide tooltip'), 'onPress')
    expect(Tooltip.isOpen(staged.fixture.tooltipState())).toBe(false)
    expect(
      propsOf(staged.viewWithId('fixture-tooltip-panel'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)

    // Keyboard/touch focus opens and Escape dismisses
    staged.fixture.send(Tooltip.FocusTooltipTrigger())
    expect(Tooltip.isOpen(staged.fixture.tooltipState())).toBe(true)
    staged.fixture.send(Tooltip.PressTooltipEscape())
    expect(Tooltip.isOpen(staged.fixture.tooltipState())).toBe(false)
  })

  it('reflects disabled accessibilityState and blocks opening when disabled', () => {
    const staged = stageRunning(TooltipFixture.start({ isDisabled: true }))
    expect(
      propsOf(staged.buttonNamed('Save'))['accessibilityState'],
    ).toMatchObject({ disabled: true })

    staged.fixture.send(Tooltip.FocusTooltipTrigger())
    expect(Tooltip.isOpen(staged.fixture.tooltipState())).toBe(false)
  })
})
