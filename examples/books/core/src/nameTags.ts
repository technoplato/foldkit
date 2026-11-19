import { Array, Option, Schema as S } from 'effect'
import { Navigation } from 'foldkit'

import { App } from './app.js'
import {
  type Destination,
  LibraryPage,
  ListenPage,
  TitlePage,
  isTitlePage,
} from './destination.js'
import { TitleSlug } from './ids.js'

// NAME TAGS

const tagsOf = (
  stack: Navigation.NavigationStack<{ _tag: string }>,
): ReadonlyArray<string> =>
  Array.map(
    [
      stack.root,
      ...Array.map(Navigation.entriesOf(stack), entry => entry.destination),
    ],
    destination => destination._tag,
  )

const comesBack = (
  slug: TitleSlug,
  above: ReadonlyArray<Destination>,
): boolean => {
  const stack = Navigation.stackFrom<Destination>(
    LibraryPage(),
    Array.map([TitlePage({ slug }), ...above], destination =>
      Navigation.presented(destination, Navigation.Push()),
    ),
  )
  return Option.exists(Option.fromNullishOr(App.navigation), navigation =>
    Option.exists(Navigation.printStack(navigation, stack), printed => {
      const parsed = Navigation.parseStack(navigation, printed)
      return (
        Array.join(tagsOf(parsed), '/') === Array.join(tagsOf(stack), '/') &&
        Option.exists(
          Array.head(parsed.pages),
          page => isTitlePage(page) && page.slug === slug,
        )
      )
    }),
  )
}

// NOTE: The routes never change while a Program runs, so a tag's answer
// is worked out once: a shelf is read again each time a place is saved,
// and asking the parser about every title each time took about half a
// millisecond a title.
const answered = new Map<string, boolean>()

/**
 * Whether a name tag can be a title's: its page's address and its
 * player's both parse back to that title. A tag that is one of Books' own
 * screens' words cannot, since the exact word opens the screen:
 * `/books/menu` is the action menu and `/books/profile` who is signed in.
 * Asked of the Program's own routes, the session's and the menu's among
 * them, so no list of words is kept here. An answer is remembered.
 *
 * @example
 * ```typescript
 * titleTagStands('the-lantern-keeper') // true
 * titleTagStands('menu') // false: `/books/menu` is the action menu
 * titleTagStands('authors') // false: `/books/authors/listen` is a person's page
 * ```
 */
export const titleTagStands = (tag: string): boolean => {
  const known = answered.get(tag)
  if (known !== undefined) {
    return known
  }
  const stands = Option.exists(
    S.decodeUnknownOption(TitleSlug)(tag),
    slug => comesBack(slug, []) && comesBack(slug, [ListenPage()]),
  )
  answered.set(tag, stands)
  return stands
}
