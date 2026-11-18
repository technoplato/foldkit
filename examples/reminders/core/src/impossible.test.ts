import { Option } from 'effect'
import { Navigation } from 'foldkit'
import { describe, expect, it } from 'vitest'

import {
  DeleteListQuestion,
  type Destination,
  DueDateSheet,
  HomePage,
  ReminderPage,
} from './destination.js'
import { ListId, ReminderId } from './ids.js'
import {
  AddReminder,
  Complete,
  ConfirmDeleteList,
  SetPriority,
  SortBy,
} from './message.js'
import { InsertReminder } from './store.js'

const listId = ListId.make('2b7c1a0e-5d2f-4c1b-9a8e-3f6d7c8b9a01')
const reminderId = ReminderId.make('7e1f04c2-1d3f-4a56-9c78-90ab12cd3456')

describe('states Reminders rules out by type', () => {
  it('refuses each of them at compile time', () => {
    const attempts = [
      () =>
        // @ts-expect-error a plain string is not a reminder's id
        Complete({ reminderId: '7e1f04c2-1d3f-4a56-9c78-90ab12cd3456' }),
      () =>
        // @ts-expect-error a title must be trimmed and not empty, so it is branded
        AddReminder({ title: 'Buy milk' }),
      () =>
        // @ts-expect-error a list's id cannot stand in for a reminder's
        Complete({ reminderId: listId }),
      () =>
        // @ts-expect-error Urgent is not one of Reminders V3's priorities
        SetPriority({ priority: 'Urgent' }),
      () =>
        // @ts-expect-error Reminders V3 has no order by color
        SortBy({ ordering: 'Color' }),
      () =>
        // @ts-expect-error the question must name the list it deletes
        DeleteListQuestion(),
      () =>
        // @ts-expect-error deleting must name the list it deletes
        ConfirmDeleteList(),
      () =>
        // @ts-expect-error a new reminder always says where it goes
        InsertReminder({ title: 'Buy milk', position: 0 }),
      (): Navigation.NavigationStack<Destination> => ({
        root: HomePage(),
        pages: [ReminderPage({ reminderId })],
        // @ts-expect-error at most one modal: there is no list of them
        maybeModal: Option.some([
          { destination: DueDateSheet(), style: Navigation.Sheet() },
          { destination: DueDateSheet(), style: Navigation.Sheet() },
        ]),
      }),
      (): Navigation.NavigationStack<Destination> => ({
        root: HomePage(),
        // @ts-expect-error no screen exists that the Destination does not name
        pages: [{ _tag: 'Calendar' }],
        maybeModal: Option.none(),
      }),
    ]
    expect(attempts).toHaveLength(10)
  })
})
