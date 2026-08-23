import { Schema as S } from 'effect'
import { NonEmptyString } from 'foldkit/adt'
import { ts } from 'foldkit/schema'

import { Category } from './category.js'
import { BookmarkId } from './ids.js'
import { Source, sourceLabel } from './source.js'

/** No excerpt. */
export const ExcerptNone = ts('None')
/** An excerpt. */
export const ExcerptSome = ts('Some', { text: NonEmptyString })
/** Bookmark excerpt. */
export const Excerpt = S.Union([ExcerptNone, ExcerptSome])
/** Bookmark excerpt. */
export type Excerpt = typeof Excerpt.Type

/** A classified capture. Source and category are exclusive unions. */
export const Bookmark = S.Struct({
  id: BookmarkId,
  title: NonEmptyString,
  excerpt: Excerpt,
  category: Category,
  source: Source,
})
/** A classified capture. */
export type Bookmark = typeof Bookmark.Type

/** Title shown on the shelf. */
export const displayTitle = (bookmark: Bookmark): string => bookmark.title

/** One line: title, category, source. */
export const displayLine = (bookmark: Bookmark): string =>
  `${bookmark.title} ${bookmark.category._tag} ${sourceLabel(bookmark.source)}`
