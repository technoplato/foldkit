/**
 * Books product UI as an atomic tree (host-neutral).
 * TUI paints via renderAscii; a React mapper can consume the same tree later.
 */
import { Column, Image, Row, Text } from './elements.js'
import type { UiNode } from './types.js'

export type ShelfBrowseItem = {
  title: string
  authorLabel: string
  /** Cover URL or empty placeholder; ASCII does not decode the bytes. */
  coverSrc: string
}

/** Screen: Column of Row(Image(cover), Column(title, author)). */
export const ShelfBrowse = (items: ReadonlyArray<ShelfBrowseItem>): UiNode =>
  Column(
    { gap: 0 },
    ...items.map((item, index) =>
      Row(
        { gap: 1 },
        Image({
          src: item.coverSrc,
          alt: item.title,
          cols: 5,
          rows: 3,
        }),
        Column(
          { gap: 0 },
          Text(`[${index + 1}] ${item.title}`),
          Text(item.authorLabel, { dim: true }),
        ),
      ),
    ),
  )

export type TitlePageChapter = {
  index: number
  title: string
  durationLabel: string
}

export type TitlePageItem = {
  title: string
  authorLabel: string
  coverSrc: string
  durationLabel: string
  playLabel: string
  chapters: ReadonlyArray<TitlePageChapter>
}

/** Screen: cover, title, author, duration, then chapter rows. */
export const BookTitle = (item: TitlePageItem): UiNode =>
  Column(
    { gap: 0 },
    Image({
      src: item.coverSrc,
      alt: item.title,
      cols: 9,
      rows: 5,
    }),
    Text(item.title),
    Text(item.authorLabel, { dim: true }),
    Text(item.durationLabel, { dim: true }),
    Text(item.playLabel),
    ...item.chapters.map(chapter =>
      Text(`${chapter.index}  ${chapter.title}  ${chapter.durationLabel}`),
    ),
  )
