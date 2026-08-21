/**
 * Instant host mapping of the books domain schema.
 * Canonical types:
 * /Users/laptop/Sync/skills/domain-as-tree/references/schemas/books.md
 *
 * Instant cannot store nested ADTs. Exclusive cases become kind strings plus
 * the fields that case owns. Duration is milliseconds. Time is i.date().
 * segment.words is JSON of spoken tokens (value objects, not entities).
 */
import { InstantCoreDatabase, i } from '@instantdb/core'

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
    }),
    accounts: i.entity({
      name: i.string(),
      kind: i.string().indexed(),
      life: i.string().indexed(),
      accessKind: i.string().indexed(),
      rights: i.json<string[]>(),
      createdAt: i.date().indexed(),
      lastSeenAt: i.date().optional(),
    }),
    preferences: i.entity({
      speechRate: i.number(),
    }),
    shelves: i.entity({
      name: i.string().indexed(),
      createdAt: i.date().indexed(),
      updatedAt: i.date(),
    }),
    folders: i.entity({
      path: i.string().indexed(),
      watch: i.string().indexed(),
      createdAt: i.date().indexed(),
    }),
    collections: i.entity({
      name: i.string().indexed(),
      description: i.string().optional(),
      createdAt: i.date().indexed(),
      updatedAt: i.date(),
    }),
    collectionEntries: i.entity({
      index: i.number().indexed(),
    }),
    files: i.entity({
      name: i.string(),
      path: i.string().indexed(),
      size: i.number(),
      presenceKind: i.string().indexed(),
      bodyKind: i.string().indexed(),
      durationMs: i.number().optional(),
      index: i.number().optional(),
      discKind: i.string().optional(),
      discNumber: i.number().optional(),
      textFormat: i.string().optional(),
      textLength: i.number().optional(),
      addedAt: i.date().indexed(),
      updatedAt: i.date(),
    }),
    genres: i.entity({
      name: i.string().unique().indexed(),
    }),
    series: i.entity({
      title: i.string().indexed(),
      description: i.string().optional(),
    }),
    authors: i.entity({
      name: i.string().indexed(),
      sortName: i.string().indexed(),
      description: i.string().optional(),
    }),
    narrators: i.entity({
      name: i.string().indexed(),
      sortName: i.string().indexed(),
    }),
    publishers: i.entity({
      name: i.string().unique().indexed(),
    }),
    tags: i.entity({
      name: i.string().unique().indexed(),
    }),
    books: i.entity({
      title: i.string().indexed(),
      subtitle: i.string().optional(),
      description: i.string().optional(),
      identifiers: i.json<{ kind: string; value: string }[]>(),
      bindingKind: i.string(),
      seriesIndex: i.string().optional(),
      publishedKind: i.string(),
      publishedYear: i.number().optional(),
      explicitKind: i.string(),
      matchKind: i.string(),
      matchProvider: i.string().optional(),
      matchValue: i.string().optional(),
      language: i.string().indexed(),
      createdAt: i.date().indexed(),
      updatedAt: i.date(),
    }),
    volumes: i.entity({
      index: i.number().indexed(),
      title: i.string().optional(),
    }),
    chapters: i.entity({
      index: i.number().indexed(),
      title: i.string(),
      bindingKind: i.string(),
      startMs: i.number().indexed(),
      endMs: i.number(),
    }),
    renditions: i.entity({
      language: i.string().indexed(),
      title: i.string().optional(),
      originKind: i.string().indexed(),
      volumeKind: i.string(),
      bodyKind: i.string().indexed(),
      durationMs: i.number().optional(),
      length: i.number().optional(),
      createdAt: i.date().indexed(),
      updatedAt: i.date(),
    }),
    segments: i.entity({
      index: i.number().indexed(),
      isFinal: i.boolean().indexed(),
      wallStart: i.date(),
      wallEnd: i.date(),
      relativeStartMs: i.number().indexed(),
      relativeEndMs: i.number(),
      words: i.json<
        ReadonlyArray<{
          kind: 'spoken'
          text: string
          language: string
          relativeStartMs: number
          relativeEndMs: number
          wallStartMs: number
          wallEndMs: number
        }>
      >(),
    }),
    items: i.entity({
      addedAt: i.date().indexed(),
      presenceKind: i.string().indexed(),
      /**
       * Persist discriminant for domain Packaging.
       * Catalog decode rejects kind/link mismatches.
       */
      preferredKind: i.string().indexed(),
    }),
    bookmarks: i.entity({
      markKind: i.string(),
      relativeMs: i.number().optional(),
      textOffset: i.number().optional(),
      createdAt: i.date().indexed(),
    }),
    notes: i.entity({
      body: i.string(),
      anchorKind: i.string().indexed(),
      relativeMs: i.number().optional(),
      textOffset: i.number().optional(),
      createdAt: i.date().indexed(),
      updatedAt: i.date(),
      audience: i.string().indexed(),
    }),
    progress: i.entity({
      relativeMs: i.number(),
      finishedKind: i.string().indexed(),
      finishedAt: i.date().optional(),
      hiddenKind: i.string(),
      startedAt: i.date().indexed(),
      updatedAt: i.date().indexed(),
    }),
    noteLinks: i.entity({
      secret: i.string().indexed(),
      role: i.string().indexed(),
    }),
    shares: i.entity({
      subjectKind: i.string().indexed(),
      role: i.string().indexed(),
    }),
  },
  links: {
    $usersLinkedPrimaryUser: {
      forward: {
        on: '$users',
        has: 'one',
        label: 'linkedPrimaryUser',
        onDelete: 'cascade',
      },
      reverse: { on: '$users', has: 'many', label: 'linkedGuestUsers' },
    },
    accountUser: {
      forward: {
        on: 'accounts',
        has: 'one',
        label: 'user',
        onDelete: 'cascade',
        required: true,
      },
      reverse: { on: '$users', has: 'one', label: 'account' },
    },
    preferenceAccount: {
      forward: {
        on: 'preferences',
        has: 'one',
        label: 'account',
        onDelete: 'cascade',
        required: true,
      },
      reverse: { on: 'accounts', has: 'one', label: 'preference' },
    },
    accountShelves: {
      forward: { on: 'accounts', has: 'many', label: 'shelves' },
      reverse: { on: 'shelves', has: 'many', label: 'accounts' },
    },
    folderShelf: {
      forward: {
        on: 'folders',
        has: 'one',
        label: 'shelf',
        onDelete: 'cascade',
        required: true,
      },
      reverse: { on: 'shelves', has: 'many', label: 'folders' },
    },
    collectionShelf: {
      forward: {
        on: 'collections',
        has: 'one',
        label: 'shelf',
        onDelete: 'cascade',
        required: true,
      },
      reverse: { on: 'shelves', has: 'many', label: 'collections' },
    },
    collectionAccount: {
      forward: {
        on: 'collections',
        has: 'one',
        label: 'account',
        required: true,
      },
      reverse: { on: 'accounts', has: 'many', label: 'collections' },
    },
    collectionEntryCollection: {
      forward: {
        on: 'collectionEntries',
        has: 'one',
        label: 'collection',
        onDelete: 'cascade',
        required: true,
      },
      reverse: { on: 'collections', has: 'many', label: 'entries' },
    },
    collectionEntryItem: {
      forward: {
        on: 'collectionEntries',
        has: 'one',
        label: 'item',
        required: true,
      },
      reverse: { on: 'items', has: 'many', label: 'collectionEntries' },
    },
    fileFolder: {
      forward: { on: 'files', has: 'one', label: 'folder' },
      reverse: { on: 'folders', has: 'many', label: 'files' },
    },
    fileRendition: {
      forward: { on: 'files', has: 'one', label: 'rendition' },
      reverse: { on: 'renditions', has: 'many', label: 'files' },
    },
    fileBlob: {
      forward: { on: 'files', has: 'one', label: 'blob' },
      reverse: { on: '$files', has: 'one', label: 'mediaFile' },
    },
    bookCover: {
      forward: { on: 'books', has: 'one', label: 'cover' },
      reverse: { on: 'files', has: 'one', label: 'coverFor' },
    },
    bookPublisher: {
      forward: { on: 'books', has: 'one', label: 'publisher' },
      reverse: { on: 'publishers', has: 'many', label: 'books' },
    },
    bookSeries: {
      forward: { on: 'books', has: 'one', label: 'series' },
      reverse: { on: 'series', has: 'many', label: 'books' },
    },
    bookAuthors: {
      forward: { on: 'books', has: 'many', label: 'authors' },
      reverse: { on: 'authors', has: 'many', label: 'books' },
    },
    bookNarrators: {
      forward: { on: 'books', has: 'many', label: 'narrators' },
      reverse: { on: 'narrators', has: 'many', label: 'books' },
    },
    bookGenres: {
      forward: { on: 'books', has: 'many', label: 'genres' },
      reverse: { on: 'genres', has: 'many', label: 'books' },
    },
    bookTags: {
      forward: { on: 'books', has: 'many', label: 'tags' },
      reverse: { on: 'tags', has: 'many', label: 'books' },
    },
    volumeBook: {
      forward: {
        on: 'volumes',
        has: 'one',
        label: 'book',
        onDelete: 'cascade',
        required: true,
      },
      reverse: { on: 'books', has: 'many', label: 'volumes' },
    },
    chapterBook: {
      forward: {
        on: 'chapters',
        has: 'one',
        label: 'book',
        onDelete: 'cascade',
        required: true,
      },
      reverse: { on: 'books', has: 'many', label: 'chapters' },
    },
    chapterVolume: {
      forward: { on: 'chapters', has: 'one', label: 'volume' },
      reverse: { on: 'volumes', has: 'many', label: 'chapters' },
    },
    renditionBook: {
      forward: {
        on: 'renditions',
        has: 'one',
        label: 'book',
        onDelete: 'cascade',
        required: true,
      },
      reverse: { on: 'books', has: 'many', label: 'renditions' },
    },
    renditionVolume: {
      forward: { on: 'renditions', has: 'one', label: 'volume' },
      reverse: { on: 'volumes', has: 'many', label: 'renditions' },
    },
    renditionFolder: {
      forward: { on: 'renditions', has: 'one', label: 'folder' },
      reverse: { on: 'folders', has: 'many', label: 'renditions' },
    },
    segmentRendition: {
      forward: {
        on: 'segments',
        has: 'one',
        label: 'rendition',
        onDelete: 'cascade',
        required: true,
      },
      reverse: { on: 'renditions', has: 'many', label: 'segments' },
    },
    segmentChapter: {
      forward: {
        on: 'segments',
        has: 'one',
        label: 'chapter',
        required: true,
      },
      reverse: { on: 'chapters', has: 'many', label: 'segments' },
    },
    itemBook: {
      forward: {
        on: 'items',
        has: 'one',
        label: 'book',
        required: true,
      },
      reverse: { on: 'books', has: 'many', label: 'items' },
    },
    itemShelf: {
      forward: {
        on: 'items',
        has: 'one',
        label: 'shelf',
        onDelete: 'cascade',
        required: true,
      },
      reverse: { on: 'shelves', has: 'many', label: 'items' },
    },
    itemPreferredAudio: {
      forward: { on: 'items', has: 'one', label: 'preferredAudio' },
      reverse: { on: 'renditions', has: 'many', label: 'preferredByAudio' },
    },
    itemPreferredText: {
      forward: { on: 'items', has: 'one', label: 'preferredText' },
      reverse: { on: 'renditions', has: 'many', label: 'preferredByText' },
    },
    bookmarkAccount: {
      forward: {
        on: 'bookmarks',
        has: 'one',
        label: 'account',
        onDelete: 'cascade',
        required: true,
      },
      reverse: { on: 'accounts', has: 'many', label: 'bookmarks' },
    },
    bookmarkItem: {
      forward: {
        on: 'bookmarks',
        has: 'one',
        label: 'item',
        required: true,
      },
      reverse: { on: 'items', has: 'many', label: 'bookmarks' },
    },
    bookmarkRendition: {
      forward: {
        on: 'bookmarks',
        has: 'one',
        label: 'rendition',
        required: true,
      },
      reverse: { on: 'renditions', has: 'many', label: 'bookmarks' },
    },
    bookmarkChapter: {
      forward: {
        on: 'bookmarks',
        has: 'one',
        label: 'chapter',
        required: true,
      },
      reverse: { on: 'chapters', has: 'many', label: 'bookmarks' },
    },
    noteAccount: {
      forward: {
        on: 'notes',
        has: 'one',
        label: 'account',
        onDelete: 'cascade',
        required: true,
      },
      reverse: { on: 'accounts', has: 'many', label: 'notes' },
    },
    noteItem: {
      forward: {
        on: 'notes',
        has: 'one',
        label: 'item',
        required: true,
      },
      reverse: { on: 'items', has: 'many', label: 'notes' },
    },
    noteRendition: {
      forward: { on: 'notes', has: 'one', label: 'rendition' },
      reverse: { on: 'renditions', has: 'many', label: 'notes' },
    },
    noteChapter: {
      forward: { on: 'notes', has: 'one', label: 'chapter' },
      reverse: { on: 'chapters', has: 'many', label: 'notes' },
    },
    progressAccount: {
      forward: {
        on: 'progress',
        has: 'one',
        label: 'account',
        onDelete: 'cascade',
        required: true,
      },
      reverse: { on: 'accounts', has: 'many', label: 'progress' },
    },
    progressItem: {
      forward: {
        on: 'progress',
        has: 'one',
        label: 'item',
        required: true,
      },
      reverse: { on: 'items', has: 'many', label: 'progress' },
    },
    progressRendition: {
      forward: {
        on: 'progress',
        has: 'one',
        label: 'rendition',
        required: true,
      },
      reverse: { on: 'renditions', has: 'many', label: 'progress' },
    },
    progressChapter: {
      forward: {
        on: 'progress',
        has: 'one',
        label: 'chapter',
        required: true,
      },
      reverse: { on: 'chapters', has: 'many', label: 'progress' },
    },
    shareAccount: {
      forward: {
        on: 'shares',
        has: 'one',
        label: 'account',
        onDelete: 'cascade',
        required: true,
      },
      reverse: { on: 'accounts', has: 'many', label: 'shares' },
    },
    shareShelf: {
      forward: { on: 'shares', has: 'one', label: 'shelf' },
      reverse: { on: 'shelves', has: 'many', label: 'shares' },
    },
    noteLinkNote: {
      forward: {
        on: 'noteLinks',
        has: 'one',
        label: 'note',
        onDelete: 'cascade',
        required: true,
      },
      reverse: { on: 'notes', has: 'many', label: 'noteLinks' },
    },
    shareItem: {
      forward: { on: 'shares', has: 'one', label: 'item' },
      reverse: { on: 'items', has: 'many', label: 'shares' },
    },
  },
  rooms: {},
})

type _AppSchema = typeof _schema
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema

export type { AppSchema }
export type BooksInstantDatabase = InstantCoreDatabase<AppSchema>
export default schema
