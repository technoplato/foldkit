import { Array, Option } from 'effect'
import { Navigation } from 'foldkit'

import type { Reminder } from './board.js'
import {
  type Destination,
  HomePage,
  ListPage,
  type Place,
  ReminderPage,
  isPlace,
  isReminderPage,
} from './destination.js'
import { type Model, reminderOf } from './model.js'
import { declared } from './routes.js'

// LINKS

type PlaceStack = Navigation.NavigationStack<Place>

const stackAbove = (
  pages: ReadonlyArray<Place>,
  maybeModal: PlaceStack['maybeModal'],
): PlaceStack => ({
  root: HomePage(),
  pages,
  maybeModal,
})

/**
 * The pages a stack holds as places a link can name. None while one of
 * them is a URI no route matched.
 */
export const placesOf = (
  pages: ReadonlyArray<Destination>,
): Option.Option<ReadonlyArray<Place>> =>
  Array.every(pages, isPlace) ? Option.some(pages) : Option.none()

/**
 * The address of pages above home, the same one the address bar shows on
 * them.
 *
 * @example
 * ```typescript
 * pathOfPages([ListPage({ listId })]) // Some('/reminders/lists/2b7c1a0e-…')
 * ```
 */
export const pathOfPages = (
  pages: ReadonlyArray<Place>,
): Option.Option<string> =>
  Navigation.printStack(declared, stackAbove(pages, Option.none()))

/**
 * The address of a Sheet or Dialog presented over pages.
 *
 * @example
 * ```typescript
 * pathOfPresented([ListPage({ listId }), ReminderPage({ reminderId })], DueDateSheet(), Navigation.Sheet())
 * // Some('/reminders/lists/2b7c1a0e-…/reminder/7e1f04c2-…/due')
 * ```
 */
export const pathOfPresented = (
  pages: ReadonlyArray<Place>,
  destination: Place,
  style: Navigation.ModalStyle,
): Option.Option<string> =>
  Navigation.printStack(
    declared,
    stackAbove(pages, Option.some({ destination, style })),
  )

/**
 * The address to share a reminder at, above its own list, whichever page
 * it was opened from: `/reminders/lists/2b7c1a0e-…/reminder/7e1f04c2-…`.
 */
export const reminderPathOf = (reminder: Reminder): Option.Option<string> =>
  pathOfPages([
    ListPage({ listId: reminder.listId }),
    ReminderPage({ reminderId: reminder.reminderId }),
  ])

/**
 * The address of a reminder opened from a listing, the page it sits above:
 * `/reminders/today/reminder/7e1f04c2-…` from Today.
 */
export const reminderPathAbove = (
  listing: Place,
  reminder: Reminder,
): Option.Option<string> =>
  pathOfPages([listing, ReminderPage({ reminderId: reminder.reminderId })])

/**
 * The address to share the page on screen at, any Sheet over it left
 * out: a reminder at its own list's address, any other page at the one the
 * address bar shows. None on home and on a URI no route matched.
 *
 * @example
 * ```typescript
 * shownPathOf(model) // Some('/reminders/tags/errands')
 * ```
 */
export const shownPathOf = (model: Model): Option.Option<string> =>
  Option.flatMap(Array.last(model.navigation.pages), page => {
    if (isReminderPage(page)) {
      return Option.flatMap(reminderOf(model, page.reminderId), reminderPathOf)
    } else {
      return Option.flatMap(placesOf(model.navigation.pages), pathOfPages)
    }
  })
