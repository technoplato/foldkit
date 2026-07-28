import { Array, String } from 'effect'
import { describe, expect, it } from 'vitest'

import { authoredPageTexts, authoredTextForPage } from './authoredPages.js'

describe('authored page text', () => {
  it('represents every official reveal page as selectable text', () => {
    expect(authoredPageTexts).toHaveLength(158)
    expect(new Set(Array.map(authoredPageTexts, page => page.page)).size).toBe(
      158,
    )
    expect(
      Array.every(authoredPageTexts, page =>
        String.isNonEmpty(String.trim(page.text)),
      ),
    ).toBe(true)
  })

  it('preserves the authored title and code examples', () => {
    expect(authoredTextForPage(1)).toContain(
      'The unreasonable effectiveness of',
    )
    expect(authoredTextForPage(89)).toContain('struct User {')
    expect(authoredTextForPage(89)).toContain('Option<EmailAddress>')
    expect(authoredTextForPage(93)).toContain('enum Ior<A, B> {')
    expect(authoredTextForPage(101)).toBe('What is the type system for?')
  })

  it('gives image-only pages explicit textual equivalents', () => {
    expect(authoredTextForPage(6)).toContain('August Health eMAR')
    expect(authoredTextForPage(140)).toContain('Me sowing:')
    expect(authoredTextForPage(140)).toContain('Me reaping:')
  })
})
