import { Toast } from 'foldkit/behavior'
import type { ButtonNode } from 'foldkit/renderers'
import { ToastFixture } from 'foldkit/test'
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

// NOTE: proves the core Toast Part on the React Native painter through the
// existing generic RN host (`interaction/host.ts`), with zero Toast-specific
// painter logic.

const stageRunning = (fixture: ToastFixture.Running) => {
  const onPress = (button: ButtonNode): void => {
    if (button.action !== undefined) {
      fixture.press(button.action)
    }
  }
  const painted = (): ReactElement => paintTree(fixture.tree(), { onPress })
  const buttonNamed = (label: string): ReactElement =>
    firstOf(hostsOf(painted(), 'Pressable'), element =>
      String(propsOf(element)['accessibilityLabel']).endsWith(label),
    )
  const maybeViewWithId = (nativeID: string): ReactElement | undefined =>
    hostsOf(painted(), 'View').find(
      element => propsOf(element)['nativeID'] === nativeID,
    )
  const viewWithId = (nativeID: string): ReactElement =>
    firstOf(
      hostsOf(painted(), 'View'),
      element => propsOf(element)['nativeID'] === nativeID,
    )

  return { fixture, buttonNamed, viewWithId, maybeViewWithId }
}

describe('core Toast Part on the React Native generic host', () => {
  it('paints Toast live region, Variant accessibilityLiveRegion/alert role, and Dismiss/DismissAll via generic RN hostPropsOf and containerPropsOf', () => {
    const staged = stageRunning(ToastFixture.start())

    const region = staged.viewWithId('fixture-toast-region')
    expect(propsOf(region)['accessibilityLabel']).toBe('Notifications')
    expect(propsOf(region)['accessibilityLiveRegion']).toBe('polite')

    staged.fixture.send(
      Toast.ShowToast({
        title: 'Saved',
        description: 'Changes persisted.',
        variant: 'Success',
      }),
    )
    staged.fixture.send(
      Toast.ShowToast({
        title: 'Sync failed',
        variant: 'Error',
      }),
    )

    const successEntry = staged.viewWithId('fixture-toast-entry-0')
    expect(propsOf(successEntry)['accessibilityLiveRegion']).toBe('polite')
    expect(propsOf(successEntry)['accessibilityRole']).toBeUndefined()

    const errorEntry = staged.viewWithId('fixture-toast-entry-1')
    expect(propsOf(errorEntry)['accessibilityRole']).toBe('alert')
    expect(propsOf(errorEntry)['accessibilityLiveRegion']).toBe('assertive')

    // Hover pauses and protects against stale elapsed
    staged.fixture.send(Toast.HoverToast({ entryId: 'fixture-toast-entry-0' }))
    staged.fixture.send(
      Toast.ElapsedToast({ entryId: 'fixture-toast-entry-0', version: 1 }),
    )
    expect(staged.maybeViewWithId('fixture-toast-entry-0')).toBeDefined()

    // Pressing dismiss removes entry-0
    callProp(staged.buttonNamed('Dismiss Saved'), 'onPress')
    expect(staged.maybeViewWithId('fixture-toast-entry-0')).toBeUndefined()
    expect(staged.maybeViewWithId('fixture-toast-entry-1')).toBeDefined()

    // Pressing Dismiss all clears entry-1
    callProp(staged.buttonNamed('Dismiss all'), 'onPress')
    expect(staged.maybeViewWithId('fixture-toast-entry-1')).toBeUndefined()
  })

  it('keeps animated leaving entries mounted with disabled dismiss button until Presence settles', () => {
    const staged = stageRunning(ToastFixture.start({ isAnimated: true }))
    staged.fixture.send(Toast.ShowToast({ title: 'Sending', variant: 'Info' }))
    staged.fixture.send(
      Toast.AdvanceToastFrame({ entryId: 'fixture-toast-entry-0' }),
    )
    staged.fixture.send(
      Toast.EndToastAnimation({ entryId: 'fixture-toast-entry-0' }),
    )

    callProp(staged.buttonNamed('Dismiss Sending'), 'onPress')
    expect(staged.maybeViewWithId('fixture-toast-entry-0')).toBeDefined()
    expect(
      propsOf(staged.buttonNamed('Dismiss Sending'))['accessibilityState'],
    ).toMatchObject({ disabled: true })

    staged.fixture.send(
      Toast.AdvanceToastFrame({ entryId: 'fixture-toast-entry-0' }),
    )
    staged.fixture.send(
      Toast.EndToastAnimation({ entryId: 'fixture-toast-entry-0' }),
    )
    expect(staged.maybeViewWithId('fixture-toast-entry-0')).toBeUndefined()
  })
})
