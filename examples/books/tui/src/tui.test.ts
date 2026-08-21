import {
  PressedOpenBook,
  PressedOpenChapter,
  PressedSignIn,
  ShelfBrowse,
  TitlePage,
  initialModel,
  newEarth,
  withView,
} from 'books-core-example'
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { messageForInput, renderBooksScreen } from './host.js'

describe('Books TUI', () => {
  it('renders signed out and every interactive control', () => {
    const screen = renderBooksScreen(initialModel)

    expect(screen).toContain('Books')
    expect(screen).toContain('[S] sign in')
    expect(screen).toContain('[Q] quit')
  })

  it('maps controls to the imported Message constructors', () => {
    expect(messageForInput(initialModel, 's')).toEqual(
      Option.some(PressedSignIn()),
    )
    expect(messageForInput(initialModel, '1')).toEqual(Option.none())
    expect(messageForInput(initialModel, 'q')).toEqual(Option.none())
  })

  it('opens the first shelf row after sign in', () => {
    const signedIn = withView(initialModel, { screen: ShelfBrowse() })
    expect(messageForInput(signedIn, '1')).toEqual(
      Option.some(PressedOpenBook({ itemId: newEarth.id })),
    )
  })

  it('renders shelf covers as ASCII boxes', () => {
    const signedIn = withView(initialModel, { screen: ShelfBrowse() })
    const screen = renderBooksScreen(signedIn)

    expect(screen).toContain('|ANE|')
    expect(screen).toContain('[1] A New Earth')
    expect(screen).toContain('Eckhart Tolle')
  })

  it('renders the title page and opens a numbered chapter', () => {
    const title = withView(initialModel, {
      screen: TitlePage({ itemId: newEarth.id }),
    })
    const screen = renderBooksScreen(title)

    expect(screen).toContain('A New Earth')
    expect(screen).toContain('Eckhart Tolle')
    expect(screen).toContain('Opening Credits')
    expect(screen).toContain('THE NEW EARTH IS NO UTOPIA')
    expect(messageForInput(title, '1')).toEqual(
      Option.some(
        PressedOpenChapter({ itemId: newEarth.id, chapterId: 'ch-000' }),
      ),
    )
  })
})
