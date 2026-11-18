import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { Milliseconds, TitleSlug } from './ids.js'
import {
  CoverLink,
  MomentLink,
  TitleLink,
  booksLinkOf,
  previewLineOf,
} from './linkPreview.js'
import { sampleShelf } from './sample.js'

const slug = TitleSlug.make('the-lantern-keeper')

describe('booksLinkOf', () => {
  it('names a title, a moment in it, and its cover', () => {
    expect(booksLinkOf('/books/the-lantern-keeper')).toEqual(
      Option.some(TitleLink({ slug })),
    )
    expect(booksLinkOf('/books/the-lantern-keeper/listen')).toEqual(
      Option.some(TitleLink({ slug })),
    )
    expect(booksLinkOf('/books/the-lantern-keeper/listen/12m03s')).toEqual(
      Option.some(MomentLink({ slug, atMs: Milliseconds.make(723_000) })),
    )
    expect(booksLinkOf('/books/the-lantern-keeper/cover')).toEqual(
      Option.some(CoverLink({ slug })),
    )
  })

  it('names nothing past a title, a moment, and a cover', () => {
    expect(booksLinkOf('/books')).toEqual(Option.none())
    expect(booksLinkOf('/books/the-lantern-keeper/contents')).toEqual(
      Option.none(),
    )
    expect(booksLinkOf('/books/the-lantern-keeper/listen/soon')).toEqual(
      Option.none(),
    )
    expect(booksLinkOf('/books/The_Lantern')).toEqual(Option.none())
    expect(booksLinkOf('/assets/the-lantern-keeper')).toEqual(Option.none())
  })
})

describe('previewLineOf', () => {
  it('says who wrote a title, and where a moment starts', () => {
    const title = Option.getOrThrow(
      Array.findFirst(sampleShelf.titles, each => each.slug === slug),
    )
    expect(previewLineOf(title, TitleLink({ slug }))).toBe('by Ada Quill')
    expect(
      previewLineOf(
        title,
        MomentLink({ slug, atMs: Milliseconds.make(723_000) }),
      ),
    ).toBe('Listen from 12:03, by Ada Quill')
  })
})
