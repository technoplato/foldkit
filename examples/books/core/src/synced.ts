import { Interaction, Program } from 'foldkit'

import { App } from './app.js'
import { BooksProjection, MessageWire } from './wire.js'

/**
 * The App wrapped for sync. The Model is Starting until the log is read,
 * then Ready with the books, the session, and the stack flat on it.
 */
export const SyncedBooks = Program.compose.sync({
  of: App,
  snapshot: BooksProjection,
  message: MessageWire,
  foldRevision: 'books-fold-v2',
})

/** A synced Books Model: Starting, Ready, or Failed. */
export type SyncedBooksModel = ReturnType<typeof SyncedBooks.init>[0]

/** A synced Books Message. */
export type SyncedBooksMessage = typeof SyncedBooks.Message.Type

/** Live Books bound to the generic interaction. */
export type BoundBooks = Interaction.BoundInteraction<
  SyncedBooksModel,
  SyncedBooksMessage
>

/**
 * Binds a live handle to its interaction.
 *
 * @example
 * ```typescript
 * const books = bindBooks(handle)
 * books.press('Play:the-lantern-keeper')
 * ```
 */
export const bindBooks = (
  handle: Interaction.ProgramHandle<SyncedBooksModel, SyncedBooksMessage>,
): BoundBooks => Interaction.bind(SyncedBooks, handle)

type ReadyBooks = Extract<SyncedBooksModel, { _tag: 'Ready' }>

/**
 * Waits until the Books Model is Ready and `isSo` holds of it: on the
 * Model's own change, at once when it already holds, and after
 * `timeoutMs` whatever happened, so a caller paints what there is.
 *
 * @example
 * ```typescript
 * await whenBooks(handle, model => model.library._tag === 'ShelfReady', 15_000)
 * ```
 */
export const whenBooks = (
  handle: Interaction.ProgramHandle<SyncedBooksModel, SyncedBooksMessage>,
  isSo: (model: ReadyBooks) => boolean,
  timeoutMs: number,
): Promise<void> =>
  new Promise(resolve => {
    const holds = (): boolean => {
      const model = handle.readModel()
      return model._tag === 'Ready' && isSo(model)
    }
    if (holds()) {
      resolve()
    } else {
      const finish = (): void => {
        clearTimeout(limit)
        stopListening()
        resolve()
      }
      const stopListening = handle.subscribe(() => {
        if (holds()) {
          finish()
        }
      })
      const limit = setTimeout(finish, timeoutMs)
    }
  })

/**
 * Waits until the shelf has opened, or could not: a Program is settled
 * before its shelf arrives, and a title that is not on the shelf yet
 * cannot be opened or played. Gives up after `timeoutMs`.
 *
 * @example
 * ```typescript
 * await whenShelfOpened(handle, 15_000)
 * books.press('Open:the-lantern-keeper') // true
 * ```
 */
export const whenShelfOpened = (
  handle: Interaction.ProgramHandle<SyncedBooksModel, SyncedBooksMessage>,
  timeoutMs: number,
): Promise<void> =>
  whenBooks(handle, model => model.library._tag !== 'ShelfLoading', timeoutMs)
