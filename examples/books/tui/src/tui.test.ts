import {
  PressedOpenBook,
  PressedSignIn,
  ShelfBrowse,
  initialModel,
  newEarth,
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
    const signedIn = { ...initialModel, screen: ShelfBrowse() }
    expect(messageForInput(signedIn, '1')).toEqual(
      Option.some(PressedOpenBook({ itemId: newEarth.id })),
    )
  })
})
