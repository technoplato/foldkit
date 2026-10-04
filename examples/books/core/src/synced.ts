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
