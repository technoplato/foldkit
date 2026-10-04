import { Array, Option } from 'effect'
import { Navigation } from 'foldkit'
import { describe, expect, it } from 'vitest'

import {
  ClearCompletedQuestion,
  DeleteListQuestion,
  type Destination,
  DueDateSheet,
  HomePage,
  ListDetailsSheet,
  ListPage,
  MoveSheet,
  PrioritySheet,
  ProfilePage,
  ReminderPage,
  SearchPage,
  SharingSheet,
  SmartListPage,
  SortSheet,
  TagPage,
} from './destination.js'
import { ListId, ReminderId, SearchQuery, TagTitle } from './ids.js'
import { navigation } from './navigation.js'

const listId = ListId.make('2b7c1a0e-5d2f-4c1b-9a8e-3f6d7c8b9a01')
const reminderId = ReminderId.make('7e1f04c2-1d3f-4a56-9c78-90ab12cd3456')

const page = (destination: Destination) =>
  Navigation.presented<Destination>(destination, Navigation.Push())

const sheet = (destination: Destination) =>
  Navigation.presented<Destination>(destination, Navigation.Sheet())

const dialog = (destination: Destination) =>
  Navigation.presented<Destination>(destination, Navigation.Dialog())

const stackOf = (
  ...entries: ReadonlyArray<Navigation.Presented<Destination>>
) => Navigation.stackFrom<Destination>(HomePage(), entries)

const addressed: ReadonlyArray<
  readonly [string, Navigation.NavigationStack<Destination>]
> = [
  ['/reminders', stackOf()],
  ['/reminders/today', stackOf(page(SmartListPage({ smartList: 'Today' })))],
  [
    '/reminders/completed',
    stackOf(page(SmartListPage({ smartList: 'Completed' }))),
  ],
  [`/reminders/lists/${listId}`, stackOf(page(ListPage({ listId })))],
  [
    '/reminders/tags/errands',
    stackOf(page(TagPage({ tagTitle: TagTitle.make('errands') }))),
  ],
  [
    '/reminders/tags/home%20office',
    stackOf(page(TagPage({ tagTitle: TagTitle.make('home office') }))),
  ],
  [
    '/reminders/search?search.query=oat+milk',
    stackOf(page(SearchPage({ query: SearchQuery.make('oat milk') }))),
  ],
  ['/reminders/profile', stackOf(page(ProfilePage()))],
  [
    `/reminders/lists/${listId}/reminder/${reminderId}`,
    stackOf(page(ListPage({ listId })), page(ReminderPage({ reminderId }))),
  ],
  [
    `/reminders/flagged/reminder/${reminderId}`,
    stackOf(
      page(SmartListPage({ smartList: 'Flagged' })),
      page(ReminderPage({ reminderId })),
    ),
  ],
  [
    `/reminders/lists/${listId}/reminder/${reminderId}/due`,
    stackOf(
      page(ListPage({ listId })),
      page(ReminderPage({ reminderId })),
      sheet(DueDateSheet()),
    ),
  ],
  [
    `/reminders/lists/${listId}/reminder/${reminderId}/priority`,
    stackOf(
      page(ListPage({ listId })),
      page(ReminderPage({ reminderId })),
      sheet(PrioritySheet()),
    ),
  ],
  [
    `/reminders/lists/${listId}/reminder/${reminderId}/move`,
    stackOf(
      page(ListPage({ listId })),
      page(ReminderPage({ reminderId })),
      sheet(MoveSheet()),
    ),
  ],
  [
    `/reminders/lists/${listId}/details`,
    stackOf(page(ListPage({ listId })), sheet(ListDetailsSheet())),
  ],
  [
    `/reminders/lists/${listId}/sharing`,
    stackOf(page(ListPage({ listId })), sheet(SharingSheet())),
  ],
  [
    `/reminders/lists/${listId}/sort`,
    stackOf(page(ListPage({ listId })), sheet(SortSheet())),
  ],
  [
    `/reminders/lists/${listId}/delete/${listId}`,
    stackOf(page(ListPage({ listId })), dialog(DeleteListQuestion({ listId }))),
  ],
  [
    `/reminders/lists/${listId}/clear-completed/${listId}`,
    stackOf(
      page(ListPage({ listId })),
      dialog(ClearCompletedQuestion({ listId })),
    ),
  ],
]

describe('Reminders addresses', () => {
  it('prints every place it can show, and parses each address back to it', () => {
    Array.forEach(addressed, ([uri, stack]) => {
      expect(Navigation.printStack(navigation, stack)).toEqual(Option.some(uri))
      expect(Navigation.parseStack(navigation, uri)).toEqual(stack)
    })
  })
})
