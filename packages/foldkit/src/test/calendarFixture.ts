import { Array, Match as M, Option, Schema as S } from 'effect'

import * as Calendar from '../behavior/calendar.js'
import * as DateGrid from '../behavior/dateGrid.js'
import * as Part from '../behavior/part.js'
import * as Catalog from '../catalog/catalog.js'
import { make } from '../program/program.js'
import { Button, Column, Row } from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'

// NOTE: shared test Program composing the core Calendar Part once, driven by
// the HTML, React, and React Native generic host tests. Every painter draws
// this same screen tree through its own generic host with zero Calendar-
// specific painter code.

export const FixtureModel = S.Struct({
  title: S.String,
})
export type FixtureModel = typeof FixtureModel.Type

const RenameCalendar = Catalog.action('RenameCalendar', {
  fields: { title: S.String },
  what: 'Updates the calendar title',
  why: 'To label the calendar fixture',
  meta: { label: 'Rename', keys: [] },
})

const fixtureCatalog = Catalog.make([RenameCalendar])

const BaseProgram = make({
  id: 'calendar-host-fixture',
  version: 1,
  Model: FixtureModel,
  Message: fixtureCatalog.Message,
  init: () => [{ title: 'Booking dates' }, []],
  update: (
    model: FixtureModel,
    message: typeof fixtureCatalog.Message.Type,
  ) => [{ ...model, title: message.title }, []],
  catalog: fixtureCatalog,
})

export const today: DateGrid.CalendarDate = DateGrid.makeDate(2026, 4, 13)

export const defaultProps: Calendar.Props = {
  id: 'fixture-calendar',
  today,
  minDate: DateGrid.makeDate(2026, 3, 1),
  maxDate: DateGrid.makeDate(2026, 6, 30),
  disabledDates: [DateGrid.makeDate(2026, 4, 15)],
}

const noView: Part.View<Calendar.State> = {
  state: Calendar.initial,
  slot: () => ({ gestures: [], maybeHold: Option.none() }),
}

const headingLabelOf = (
  state: Calendar.State,
  props: Calendar.Props,
): string => {
  const view = Calendar.viewMonthOf(state, props)
  return M.value(Calendar.viewModeOf(state)).pipe(
    M.withReturnType<string>(),
    M.when('Day', () => `${view.year}-${String(view.month).padStart(2, '0')}`),
    M.when('Month', () => String(view.year)),
    M.when('Year', () => {
      const years = Calendar.visibleYearsGridOf(state, props)
      return `${years.startYear}-${years.endYear}`
    }),
    M.exhaustive,
  )
}

export const calendarScreen = (
  _model: FixtureModel,
  calendar: Part.View<Calendar.State>,
  props: Calendar.Props = defaultProps,
): UiNode => {
  const monthGrid = Calendar.visibleMonthGridOf(calendar.state, props)
  const isDisabled = Calendar.isDisabledOf(props)
  const headingText = headingLabelOf(calendar.state, props)

  const header = Row(
    { gap: 1 },
    Button({
      label: 'Previous month',
      action: Calendar.PreviousCalendarMonth.tag,
      disabled: !Calendar.canNavigatePreviousMonth(calendar.state, props),
      slot: calendar.slot('PreviousMonthButton'),
    }),
    Button({
      label: headingText,
      action: Calendar.ZoomOutCalendarView.tag,
      disabled: isDisabled || Calendar.viewModeOf(calendar.state) === 'Year',
      slot: calendar.slot('Heading'),
    }),
    Button({
      label: 'Next month',
      action: Calendar.NextCalendarMonth.tag,
      disabled: !Calendar.canNavigateNextMonth(calendar.state, props),
      slot: calendar.slot('NextMonthButton'),
    }),
  )

  const weekRows = Array.map(monthGrid.weeks, week =>
    Row(
      { gap: 1 },
      ...Array.map(week.cells, cell =>
        Button({
          label: cell.iso,
          action: Part.pressOf(
            Calendar.SelectCalendarDate.tag,
            Option.some(cell.iso),
          ),
          disabled: isDisabled || cell.isDisabled,
          slot: calendar.slot('GridCell', cell.iso),
        }),
      ),
    ),
  )

  return Column(
    { gap: 1 },
    header,
    Column({ gap: 1, slot: calendar.slot('Grid') }, ...weekRows),
  )
}

export const makeApp = (
  overrides: Partial<Calendar.Props> = {},
  partOptions: Calendar.MakeOptions = {},
) => {
  const resolvedProps: Calendar.Props = { ...defaultProps, ...overrides }
  const part = Calendar.make({
    name: 'Calendar',
    ...partOptions,
  })
  return {
    props: resolvedProps,
    App: Part.compose({
      of: BaseProgram,
      parts: [Part.given(part, () => resolvedProps)],
      screen: (model, views) =>
        calendarScreen(model, views['Calendar'] ?? noView, resolvedProps),
    }),
  }
}

export const { App, props } = makeApp()

export type Model = typeof App.Model.Type

export type Running = Readonly<{
  props: Calendar.Props
  model: () => Model
  calendarState: () => Calendar.State
  tree: () => UiNode
  press: (tag: string) => void
  send: (message: Calendar.Message) => void
}>

export const start = (
  overrides: Partial<Calendar.Props> = {},
  partOptions: Calendar.MakeOptions = {},
): Running => {
  const { App: composed, props: resolvedProps } = makeApp(
    overrides,
    partOptions,
  )
  const [initialModel] = composed.init()
  const held: { model: Model } = { model: initialModel }

  const sendMessage = (message: Readonly<{ _tag: string }>): void => {
    const [nextModel] = composed.update(held.model, message)
    held.model = nextModel
  }

  const press = (tag: string): void => {
    const messages = composed.interaction?.press(held.model, tag) ?? []
    Array.forEach(messages, sendMessage)
  }

  return {
    props: resolvedProps,
    model: () => held.model,
    calendarState: () => held.model.parts['Calendar'],
    tree: () => composed.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    send: sendMessage,
  }
}
