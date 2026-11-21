import { Array, Match as M, Option, Schema as S } from 'effect'

import * as DateGrid from '../behavior/dateGrid.js'
import * as DatePicker from '../behavior/datePicker.js'
import * as Part from '../behavior/part.js'
import * as Catalog from '../catalog/catalog.js'
import { make } from '../program/program.js'
import {
  Box,
  Button,
  Column,
  Row,
  Text,
  TextInput,
} from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'

// NOTE: shared test Program composing the core DatePicker Part once, driven by
// the HTML, React, and React Native generic host tests. Every painter draws
// this same screen tree through its own generic host with zero DatePicker-
// specific painter code.

export const FixtureModel = S.Struct({
  heading: S.String,
})
export type FixtureModel = typeof FixtureModel.Type

const RenameDatePicker = Catalog.action('RenameDatePicker', {
  fields: { heading: S.String },
  what: 'Updates the date picker heading',
  why: 'To label the date picker fixture',
  meta: { label: 'Rename', keys: [] },
})

const fixtureCatalog = Catalog.make([RenameDatePicker])

const BaseProgram = make({
  id: 'date-picker-host-fixture',
  version: 1,
  Model: FixtureModel,
  Message: fixtureCatalog.Message,
  init: () => [{ heading: 'Departure date' }, []],
  update: (
    model: FixtureModel,
    message: typeof fixtureCatalog.Message.Type,
  ) => [{ ...model, heading: message.heading }, []],
  catalog: fixtureCatalog,
})

export const today: DateGrid.CalendarDate = DateGrid.makeDate(2026, 4, 13)

export const defaultProps: DatePicker.Props = {
  id: 'fixture-date-picker',
  today,
  placeholder: 'Pick a date',
  hasLabel: true,
  hasDescription: true,
  hasError: true,
  name: 'departureDate',
  minDate: DateGrid.makeDate(2026, 3, 1),
  maxDate: DateGrid.makeDate(2026, 6, 30),
  disabledDates: [DateGrid.makeDate(2026, 4, 15)],
}

const noView: Part.View<DatePicker.State> = {
  state: DatePicker.initial,
  slot: () => ({ gestures: [], maybeHold: Option.none() }),
}

const headingLabelOf = (
  state: DatePicker.State,
  props: DatePicker.Props,
): string => {
  const view = DatePicker.viewMonthOf(state, props)
  return M.value(DatePicker.viewModeOf(state)).pipe(
    M.withReturnType<string>(),
    M.when('Day', () => `${view.year}-${String(view.month).padStart(2, '0')}`),
    M.when('Month', () => String(view.year)),
    M.when('Year', () => {
      const years = DatePicker.visibleYearsGridOf(state, props)
      return `${years.startYear}-${years.endYear}`
    }),
    M.exhaustive,
  )
}

export const datePickerScreen = (
  model: FixtureModel,
  picker: Part.View<DatePicker.State>,
  props: DatePicker.Props = defaultProps,
): UiNode => {
  const monthGrid = DatePicker.visibleMonthGridOf(picker.state, props)
  const isDisabled = DatePicker.isDisabledOf(props)
  const headingText = headingLabelOf(picker.state, props)

  const header = Row(
    { gap: 1 },
    Button({
      label: 'Previous month',
      action: DatePicker.PreviousDatePickerMonth.tag,
      disabled: !DatePicker.canNavigatePreviousMonth(picker.state, props),
      slot: picker.slot('PreviousMonthButton'),
    }),
    Button({
      label: headingText,
      action: DatePicker.ZoomOutDatePickerView.tag,
      disabled: isDisabled || DatePicker.viewModeOf(picker.state) === 'Year',
      slot: picker.slot('Heading'),
    }),
    Button({
      label: 'Next month',
      action: DatePicker.NextDatePickerMonth.tag,
      disabled: !DatePicker.canNavigateNextMonth(picker.state, props),
      slot: picker.slot('NextMonthButton'),
    }),
  )

  const weekRows = Array.map(monthGrid.weeks, week =>
    Row(
      { gap: 1 },
      ...Array.map(week.cells, cell =>
        Button({
          label: cell.iso,
          action: Part.pressOf(
            DatePicker.SelectDatePickerDate.tag,
            Option.some(cell.iso),
          ),
          disabled: isDisabled || cell.isDisabled,
          slot: picker.slot('GridCell', cell.iso),
        }),
      ),
    ),
  )

  return Column(
    { gap: 1 },
    Box(
      { padding: 0, slot: picker.slot('Label') },
      Text(props.label ?? model.heading),
    ),
    Row(
      { gap: 1 },
      TextInput({
        value: DatePicker.inputValueOf(picker.state, props),
        placeholder: DatePicker.placeholderOf(props),
        token: `${DatePicker.ChangeDateInput.tag}:`,
        blurToken: DatePicker.CommitDateInput.tag,
        slot: picker.slot('Input'),
      }),
      Button({
        label: DatePicker.displayLabelOf(picker.state, props),
        action: DatePicker.ToggleDatePicker.tag,
        disabled: isDisabled,
        slot: picker.slot('Trigger'),
      }),
      Button({
        label: 'Clear date',
        action: DatePicker.ClearDatePicker.tag,
        disabled: !DatePicker.canPickDate(props),
        slot: picker.slot('ClearButton'),
      }),
    ),
    Column(
      { gap: 1, slot: picker.slot('Content') },
      header,
      Column({ gap: 1, slot: picker.slot('Grid') }, ...weekRows),
    ),
    ...(DatePicker.isOpen(picker.state)
      ? [
          Button({
            label: 'Dismiss date picker',
            action: DatePicker.DismissDatePicker.tag,
            slot: picker.slot('Backdrop'),
          }),
        ]
      : []),
    Box(
      { padding: 0, slot: picker.slot('Description') },
      Text('Choose a travel date'),
    ),
    Box(
      { padding: 0, slot: picker.slot('Error') },
      Text('Please enter a valid date'),
    ),
  )
}

export const makeApp = (
  overrides: Partial<DatePicker.Props> = {},
  partOptions: DatePicker.MakeOptions = {},
) => {
  const resolvedProps: DatePicker.Props = { ...defaultProps, ...overrides }
  const part = DatePicker.make({
    name: 'DatePicker',
    ...partOptions,
  })
  return {
    props: resolvedProps,
    App: Part.compose({
      of: BaseProgram,
      parts: [Part.given(part, () => resolvedProps)],
      screen: (model, views) =>
        datePickerScreen(model, views['DatePicker'] ?? noView, resolvedProps),
    }),
  }
}

export const { App, props } = makeApp()

export type Model = typeof App.Model.Type

export type Running = Readonly<{
  props: DatePicker.Props
  model: () => Model
  datePickerState: () => DatePicker.State
  tree: () => UiNode
  press: (tag: string) => void
  type: (token: string, value: string) => void
  send: (message: DatePicker.Message) => void
}>

const changePrefix = `${DatePicker.ChangeDateInput.tag}:`

export const start = (
  overrides: Partial<DatePicker.Props> = {},
  partOptions: DatePicker.MakeOptions = {},
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
    if (tag === changePrefix) {
      sendMessage(DatePicker.ChangeDateInput({ value: '' }))
      return
    }
    const messages = composed.interaction?.press(held.model, tag) ?? []
    Array.forEach(messages, sendMessage)
  }

  const type = (token: string, value: string): void => {
    press(`${token}${value}`)
  }

  return {
    props: resolvedProps,
    model: () => held.model,
    datePickerState: () => held.model.parts['DatePicker'],
    tree: () => composed.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    type,
    send: sendMessage,
  }
}
