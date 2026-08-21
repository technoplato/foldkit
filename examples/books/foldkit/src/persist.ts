import {
  Bookmark,
  CompletedSaveBookmark,
  CompletedSaveNote,
  CompletedSaveProgress,
  CompletedSignOut,
  FailedCatalog,
  FailedSaveBookmark,
  FailedSaveNote,
  FailedSaveProgress,
  FailedSharedNote,
  FailedSignIn,
  HeardCatalog,
  HeardSharedNote,
  HeardSignedIn,
  HeardUserData,
  Note,
  Progress,
} from 'books-core-example'
import { Effect, Option, Schema as S } from 'effect'
import { Command } from 'foldkit'

import {
  ensureHostedInstantSession,
  noteViewRuleParams,
} from '@foldkit/instant'
import { id } from '@instantdb/core'

import type { BooksInstantDatabase } from '../instant.schema.js'
import { itemsFromCatalog, userDataFromAccount } from './catalog.js'
import { booksDatabase } from './database.js'

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isInstantId = (value: string): boolean => uuidPattern.test(value)

const catalogQuery = {
  items: {
    book: {
      authors: {},
      chapters: {},
      cover: {},
    },
    preferredAudio: {
      files: {},
      segments: {},
    },
    preferredText: {},
  },
} as const

const accountQuery = (userId: string) => ({
  accounts: {
    $: { where: { 'user.id': userId } },
    preference: {},
    bookmarks: { chapter: {}, rendition: {}, item: {} },
    notes: { chapter: {}, rendition: {}, item: {} },
    progress: { chapter: {}, rendition: {}, item: {} },
  },
})

const requireDatabase = (): BooksInstantDatabase => {
  const database = booksDatabase()
  if (database === undefined) {
    throw new Error('Instant is not configured')
  }
  return database
}

const requireTx = <T>(value: T | undefined, label: string): T => {
  if (value === undefined) {
    throw new Error(`missing Instant tx for ${label}`)
  }
  return value
}

const accountName = (email: string | null | undefined): string => {
  if (email === undefined || email === null || email === '') {
    return 'Guest'
  } else {
    return email
  }
}

const ensureAccount = async (
  database: BooksInstantDatabase,
  userId: string,
  name: string,
): Promise<string> => {
  const existing = await database.queryOnce(accountQuery(userId))
  const account = existing.data.accounts[0]
  if (account !== undefined) {
    await database.transact(
      requireTx(database.tx.accounts[account.id], 'accounts').update({
        lastSeenAt: Date.now(),
      }),
    )
    return account.id
  }
  const accountId = id()
  await database.transact([
    requireTx(database.tx.accounts[accountId], 'accounts')
      .update({
        name,
        kind: 'person',
        life: 'alive',
        accessKind: 'root',
        rights: ['own'],
        createdAt: Date.now(),
        lastSeenAt: Date.now(),
      })
      .link({ user: userId }),
    requireTx(database.tx.preferences[id()], 'preferences')
      .update({ speechRate: 1 })
      .link({ account: accountId }),
  ])
  return accountId
}

const signInAndEnsureAccount = async (): Promise<string> => {
  const database = requireDatabase()
  let user = await ensureHostedInstantSession(database)
  if (user == null) {
    await database.auth.signInAsGuest()
    user = await database.getAuth()
  }
  if (user == null) {
    throw new Error('sign-in returned no user')
  }
  return ensureAccount(database, user.id, accountName(user.email))
}

const loadCatalogRows = async (): Promise<ReadonlyArray<unknown>> => {
  const database = requireDatabase()
  const result = await database.queryOnce(catalogQuery)
  return result.data.items
}

const loadAccountRow = async (accountId: string): Promise<unknown> => {
  const database = requireDatabase()
  const user = await database.getAuth()
  if (user == null) {
    throw new Error('not signed in')
  }
  const result = await database.queryOnce(accountQuery(user.id))
  return (
    result.data.accounts.find(row => row.id === accountId) ??
    result.data.accounts[0]
  )
}

/** Restores a persisted Instant session, or signs in through hosted Access. */
export const RestoreSession = Command.define(
  'RestoreSession',
  HeardSignedIn,
  FailedSignIn,
)(
  Effect.gen(function* () {
    const database = booksDatabase()
    if (database === undefined) {
      return FailedSignIn()
    }
    const user = yield* Effect.tryPromise({
      try: () => ensureHostedInstantSession(database),
      catch: () => new Error('auth restore failed'),
    }).pipe(Effect.option)
    if (user._tag === 'None' || user.value == null) {
      return FailedSignIn()
    }
    const authUser = user.value
    const accountId = yield* Effect.tryPromise({
      try: () =>
        ensureAccount(database, authUser.id, accountName(authUser.email)),
      catch: () => new Error('account restore failed'),
    }).pipe(Effect.option)
    if (accountId._tag === 'None') {
      return FailedSignIn()
    }
    return HeardSignedIn({ accountId: accountId.value })
  }),
)

/** Signs in through hosted Access, then Instant guest when Access is absent. */
export const SignInGuest = Command.define(
  'SignInGuest',
  HeardSignedIn,
  FailedSignIn,
)(
  Effect.gen(function* () {
    const accountId = yield* Effect.tryPromise({
      try: () => signInAndEnsureAccount(),
      catch: () => new Error('sign-in failed'),
    }).pipe(Effect.option)
    if (accountId._tag === 'None') {
      return FailedSignIn()
    }
    return HeardSignedIn({ accountId: accountId.value })
  }),
)

/** Signs out of Instant. */
export const SignOutGuest = Command.define(
  'SignOutGuest',
  CompletedSignOut,
)(
  Effect.gen(function* () {
    const database = booksDatabase()
    if (database !== undefined) {
      yield* Effect.tryPromise({
        try: () => database.auth.signOut(),
        catch: () => new Error('sign-out failed'),
      }).pipe(Effect.option)
    }
    return CompletedSignOut()
  }),
)

/** Loads the Instant catalog onto the shelf. */
export const LoadCatalog = Command.define(
  'LoadCatalog',
  HeardCatalog,
  FailedCatalog,
)(
  Effect.gen(function* () {
    const rows = yield* Effect.tryPromise({
      try: () => loadCatalogRows(),
      catch: () => new Error('catalog failed'),
    }).pipe(Effect.option)
    if (rows._tag === 'None') {
      return FailedCatalog()
    }
    const items = itemsFromCatalog(rows.value)
    if (items.length === 0) {
      return FailedCatalog()
    }
    return HeardCatalog({ items })
  }),
)

/** Loads bookmarks, notes, and progress for one account. */
export const LoadUserData = Command.define(
  'LoadUserData',
  { accountId: S.String },
  HeardUserData,
)(({ accountId }) =>
  Effect.gen(function* () {
    const account = yield* Effect.tryPromise({
      try: () => loadAccountRow(accountId),
      catch: () => new Error('user data failed'),
    }).pipe(Effect.option)
    if (account._tag === 'None') {
      return HeardUserData({ bookmarks: [], notes: [], progress: [] })
    }
    return HeardUserData(userDataFromAccount(account.value))
  }),
)

/** Persists one progress row. */
export const SaveProgress = Command.define(
  'SaveProgress',
  { accountId: S.String, progress: Progress },
  CompletedSaveProgress,
  FailedSaveProgress,
)(({ accountId, progress }) =>
  Effect.gen(function* () {
    const result = yield* Effect.tryPromise({
      try: async () => {
        if (
          !isInstantId(accountId) ||
          !isInstantId(progress.itemId) ||
          !isInstantId(progress.renditionId) ||
          !isInstantId(progress.chapterId)
        ) {
          return CompletedSaveProgress()
        }
        const database = requireDatabase()
        const progressId = isInstantId(progress.id) ? progress.id : id()
        const now = Date.now()
        await database.transact(
          requireTx(database.tx.progress[progressId], 'progress')
            .update({
              relativeMs: Math.round(progress.relative * 1000),
              finishedKind: progress.finished ? 'finished' : 'unfinished',
              hiddenKind: progress.hidden ? 'hidden' : 'visible',
              startedAt: progress.startedAt === 0 ? now : progress.startedAt,
              updatedAt: now,
            })
            .link({
              account: accountId,
              item: progress.itemId,
              rendition: progress.renditionId,
              chapter: progress.chapterId,
            }),
        )
        return CompletedSaveProgress()
      },
      catch: () => new Error('save progress failed'),
    }).pipe(Effect.option)
    if (result._tag === 'None') {
      return FailedSaveProgress()
    }
    return result.value
  }),
)

/** Persists one bookmark. */
export const SaveBookmark = Command.define(
  'SaveBookmark',
  { accountId: S.String, bookmark: Bookmark },
  CompletedSaveBookmark,
  FailedSaveBookmark,
)(({ accountId, bookmark }) =>
  Effect.gen(function* () {
    const result = yield* Effect.tryPromise({
      try: async () => {
        if (
          !isInstantId(accountId) ||
          !isInstantId(bookmark.itemId) ||
          !isInstantId(bookmark.renditionId) ||
          !isInstantId(bookmark.chapterId)
        ) {
          return CompletedSaveBookmark()
        }
        const database = requireDatabase()
        const bookmarkId = isInstantId(bookmark.id) ? bookmark.id : id()
        await database.transact(
          requireTx(database.tx.bookmarks[bookmarkId], 'bookmarks')
            .update({
              markKind: 'audio',
              relativeMs: Math.round(bookmark.relative * 1000),
              createdAt:
                bookmark.createdAt === 0 ? Date.now() : bookmark.createdAt,
            })
            .link({
              account: accountId,
              item: bookmark.itemId,
              rendition: bookmark.renditionId,
              chapter: bookmark.chapterId,
            }),
        )
        return CompletedSaveBookmark()
      },
      catch: () => new Error('save bookmark failed'),
    }).pipe(Effect.option)
    if (result._tag === 'None') {
      return FailedSaveBookmark()
    }
    return result.value
  }),
)

/** Deletes one bookmark. */
export const DeleteBookmark = Command.define(
  'DeleteBookmark',
  { bookmarkId: S.String },
  CompletedSaveBookmark,
  FailedSaveBookmark,
)(({ bookmarkId }) =>
  Effect.gen(function* () {
    const result = yield* Effect.tryPromise({
      try: async () => {
        if (!isInstantId(bookmarkId)) {
          return CompletedSaveBookmark()
        }
        const database = requireDatabase()
        await database.transact(
          requireTx(database.tx.bookmarks[bookmarkId], 'bookmarks').delete(),
        )
        return CompletedSaveBookmark()
      },
      catch: () => new Error('delete bookmark failed'),
    }).pipe(Effect.option)
    if (result._tag === 'None') {
      return FailedSaveBookmark()
    }
    return result.value
  }),
)

/** Persists one note. */
export const SaveNote = Command.define(
  'SaveNote',
  {
    accountId: S.String,
    audience: S.Literals(['public', 'unlisted', 'private']),
    note: Note,
    shareSecret: S.Option(S.String),
  },
  CompletedSaveNote,
  FailedSaveNote,
)(({ accountId, audience, note, shareSecret }) =>
  Effect.gen(function* () {
    const result = yield* Effect.tryPromise({
      try: async () => {
        if (!isInstantId(accountId) || !isInstantId(note.itemId)) {
          return CompletedSaveNote()
        }
        const database = requireDatabase()
        const noteId = isInstantId(note.id) ? note.id : id()
        const now = Date.now()
        const relativeMs = Option.isSome(note.relative)
          ? Math.round(note.relative.value * 1000)
          : null
        const links: {
          account: string
          item: string
          rendition?: string
          chapter?: string
        } = { account: accountId, item: note.itemId }
        if (
          Option.isSome(note.renditionId) &&
          isInstantId(note.renditionId.value)
        ) {
          links.rendition = note.renditionId.value
        }
        if (
          Option.isSome(note.chapterId) &&
          isInstantId(note.chapterId.value)
        ) {
          links.chapter = note.chapterId.value
        }
        await database.transact(
          requireTx(database.tx.notes[noteId], 'notes')
            .update({
              body: note.body,
              anchorKind: relativeMs === null ? 'item' : 'audio',
              relativeMs,
              createdAt: note.createdAt === 0 ? now : note.createdAt,
              updatedAt: now,
              audience,
            })
            .link(links),
        )
        if (Option.isSome(shareSecret)) {
          const linkId = id()
          await database.transact(
            requireTx(database.tx.noteLinks[linkId], 'noteLinks')
              .update({
                secret: shareSecret.value,
                role: 'reader',
              })
              .link({ note: noteId }),
          )
        }
        return CompletedSaveNote()
      },
      catch: () => new Error('save note failed'),
    }).pipe(Effect.option)
    if (result._tag === 'None') {
      return FailedSaveNote()
    }
    return result.value
  }),
)

/** Deletes one note. */
export const DeleteNote = Command.define(
  'DeleteNote',
  { noteId: S.String },
  CompletedSaveNote,
  FailedSaveNote,
)(({ noteId }) =>
  Effect.gen(function* () {
    const result = yield* Effect.tryPromise({
      try: async () => {
        if (!isInstantId(noteId)) {
          return CompletedSaveNote()
        }
        const database = requireDatabase()
        await database.transact(
          requireTx(database.tx.notes[noteId], 'notes').delete(),
        )
        return CompletedSaveNote()
      },
      catch: () => new Error('delete note failed'),
    }).pipe(Effect.option)
    if (result._tag === 'None') {
      return FailedSaveNote()
    }
    return result.value
  }),
)

/** Loads one note with Instant ruleParams (knownDocId + optional secret). */
export const LoadSharedNote = Command.define(
  'LoadSharedNote',
  { noteId: S.String, secret: S.Option(S.String) },
  HeardSharedNote,
  FailedSharedNote,
)(({ noteId, secret }) =>
  Effect.gen(function* () {
    const result = yield* Effect.tryPromise({
      try: async () => {
        const database = requireDatabase()
        const ruleParams = noteViewRuleParams({
          subjectId: noteId,
          ...(Option.isSome(secret) ? { secret: secret.value } : {}),
        })
        const queried = await database.queryOnce(
          {
            notes: {
              $: { where: { id: noteId } },
              item: {},
              chapter: {},
              rendition: {},
            },
          },
          { ruleParams },
        )
        return queried.data.notes[0]
      },
      catch: () => new Error('shared note failed'),
    }).pipe(Effect.option)
    if (result._tag === 'None' || result.value === undefined) {
      return HeardSharedNote({ note: Option.none() })
    }
    const row = result.value
    return HeardSharedNote({
      note: Option.some({
        id: row.id,
        itemId: row.item?.id ?? '',
        body: row.body,
        chapterId:
          row.chapter?.id === undefined
            ? Option.none()
            : Option.some(row.chapter.id),
        renditionId:
          row.rendition?.id === undefined
            ? Option.none()
            : Option.some(row.rendition.id),
        relative:
          row.relativeMs === undefined || row.relativeMs === null
            ? Option.none()
            : Option.some(row.relativeMs / 1000),
        createdAt: Number(row.createdAt),
        updatedAt: Number(row.updatedAt),
      }),
    })
  }),
)
