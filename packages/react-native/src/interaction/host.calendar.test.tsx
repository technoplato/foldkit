import { Option } from 'effect'
import { Calendar, DateGrid } from 'foldkit/behavior'
import type { ButtonNode } from 'foldkit/renderers'
import { CalendarFixture } from 'foldkit/test'
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

// NOTE: proves the core Calendar Part on the React Native painter through the
// existing generic RN host (`interaction/host.ts`), with zero Calendar-specific
// painter logic.

const stage = (overrides: Partial<Calendar.Props> = {}) => {
  const fixture = CalendarFixture.start(overrides)
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

describe('core Calendar Part on the React Native generic host', () => {
  it('paints grid container and day cells, handles single selection, disabled cells, and month stepping through generic RN host', () => {
    const staged = stage({ label: 'Booking calendar' })

    const grid = staged.viewWithId('fixture-calendar-grid')
    expect(propsOf(grid)['nativeID']).toBe('fixture-calendar-grid')
    expect(propsOf(grid)['accessibilityLabel']).toBe('Booking calendar')

    expect(
      propsOf(staged.buttonNamed('2026-04-13'))['accessibilityState'],
    ).toMatchObject({ selected: false, disabled: false })
    expect(
      propsOf(staged.buttonNamed('2026-04-15'))['accessibilityState'],
    ).toMatchObject({ selected: false, disabled: true })

    // Tap 2026-04-14 -> selected
    callProp(staged.buttonNamed('2026-04-14'), 'onPress')
    expect(Calendar.selectedDateOf(staged.fixture.calendarState())).toEqual(
      Option.some(DateGrid.makeDate(2026, 4, 14)),
    )
    expect(
      propsOf(staged.buttonNamed('2026-04-14'))['accessibilityState'],
    ).toMatchObject({ selected: true })

    // Disabled 2026-04-15 ignores press
    staged.fixture.press('SelectCalendarDate:2026-04-15')
    expect(Calendar.selectedDateOf(staged.fixture.calendarState())).toEqual(
      Option.some(DateGrid.makeDate(2026, 4, 14)),
    )

    // Tap Next month -> May 2026
    callProp(staged.buttonNamed('Next month'), 'onPress')
    expect(
      Calendar.viewMonthOf(
        staged.fixture.calendarState(),
        staged.fixture.props,
      ),
    ).toEqual({ year: 2026, month: 5 })
    expect(propsOf(staged.buttonNamed('2026-05'))['accessibilityLabel']).toBe(
      '2026-05',
    )

    // Tap Heading -> zooms out to Month view
    callProp(staged.buttonNamed('2026-05'), 'onPress')
    expect(Calendar.viewModeOf(staged.fixture.calendarState())).toBe('Month')
  })

  it('supports Range selection mode on the RN generic host', () => {
    const ranged = stage({ selectionMode: 'Range' })

    callProp(ranged.buttonNamed('2026-04-10'), 'onPress')
    callProp(ranged.buttonNamed('2026-04-14'), 'onPress')

    expect(Calendar.selectedRangeOf(ranged.fixture.calendarState())).toEqual(
      Option.some({
        start: DateGrid.makeDate(2026, 4, 10),
        end: DateGrid.makeDate(2026, 4, 14),
      }),
    )
    expect(
      propsOf(ranged.buttonNamed('2026-04-10'))['accessibilityState'],
    ).toMatchObject({ selected: true })
    expect(
      propsOf(ranged.buttonNamed('2026-04-12'))['accessibilityState'],
    ).toMatchObject({ selected: true })
    expect(
      propsOf(ranged.buttonNamed('2026-04-14'))['accessibilityState'],
    ).toMatchObject({ selected: true })
    expect(
      propsOf(ranged.buttonNamed('2026-04-16'))['accessibilityState'],
    ).toMatchObject({ selected: false })
  })
})
