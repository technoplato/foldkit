import { NonEmptyString } from 'foldkit/adt'

/** Opaque bookmark id. Emptiness is never switched on. */
export const BookmarkId = NonEmptyString
/** Opaque bookmark id. */
export type BookmarkId = typeof BookmarkId.Type
