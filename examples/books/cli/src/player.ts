import {
  type BookSearch,
  BookSearchJson,
  type BoundBooks,
  type LibraryStoreService,
  type SpokenWords,
  SpokenWordsJson,
  type SyncedBooksMessage,
  type SyncedBooksModel,
  bookSearchLines,
  bookSearchOf,
  briefScreen,
  clockOf,
  isBookSearchSettled,
  isSameParagraph,
  loadedTitleOf,
  placeOf,
  spokenWordsLines,
  spokenWordsOf,
  suggestedPressesOf,
  titlesOf,
} from 'books-core-example'
import {
  Array,
  Deferred,
  Duration,
  Effect,
  Option,
  Schema as S,
  Stream,
  pipe,
} from 'effect'
import { Interaction, type Processor } from 'foldkit'
import {
  CliDaemonError,
  type CliDaemonFlags,
  type CliDaemonPaintedResult,
  type CliDaemonSurface,
  type CliFollowing,
  type HostCommand,
  type TerminalPaintReporting,
  followTopicOf,
  isTerminalViewRequest,
  makeProgramTerminalView,
  paintCommands,
  paintProgram,
  paintScreen,
  programCliSurface,
  programFollowings,
  runProgramCommand,
} from 'foldkit/cli'
import { renderScreen } from 'foldkit/renderers'
import * as Theme from 'foldkit/theme'
import * as TranscriptPlayer from 'transcript-player-core-example'

import { booksCommandName } from './settings.js'

// BRIEF

const readyOf = (
  model: SyncedBooksModel,
): Option.Option<Extract<SyncedBooksModel, { _tag: 'Ready' }>> =>
  model._tag === 'Ready' ? Option.some(model) : Option.none()

const hostCommandsOf = (isLoaded: boolean): ReadonlyArray<HostCommand> => [
  { command: 'tui', what: 'Opens the live player here' },
  ...(isLoaded
    ? [
        { command: 'follow words', what: 'Prints the words as they are read' },
        {
          command: 'search "<words>"',
          what: 'Finds where words are spoken, with links',
        },
        { command: 'stop', what: 'Stops and saves your place' },
      ]
    : []),
  { command: 'actions', what: 'Lists every command' },
  { command: 'login', what: 'Signs in to Cloudflare Access' },
]

const briefWidth = 200

const statusOf = (bound: BoundBooks): string => {
  const status = bound.status()
  return status._tag === 'Ready' ? 'Ready' : status.description
}

/**
 * What a terminal command prints after it runs: Books in a few lines, what
 * is playing, the chapter, the time left, and whether it plays, then the
 * commands to copy for this moment, such as `books pause` while it plays
 * and `books listen 12-rules-for-life` for another title.
 *
 * @example
 * ```typescript
 * paintBrief(bound)
 * // '▶ Playing A New Earth\n…\n\n  books pause   Pauses and keeps your place\n…'
 * ```
 */
export const paintBrief = (bound: BoundBooks): string =>
  Option.match(readyOf(bound.readModel()), {
    onNone: () => statusOf(bound),
    onSome: model =>
      Array.join(
        [
          ...Array.map(
            renderScreen(briefScreen(model), briefWidth).split('\n'),
            line => line.trimEnd(),
          ),
          '',
          ...paintCommands(
            bound,
            booksCommandName,
            suggestedPressesOf(model),
            hostCommandsOf(Option.isSome(loadedTitleOf(model))),
          ),
        ],
        '\n',
      ),
  })

// WORDS

const countFlagOf = (
  flags: CliDaemonFlags,
  name: string,
): Option.Option<number> =>
  pipe(
    Option.fromNullishOr(flags[name]),
    Option.map(Number),
    Option.filter(count => Number.isInteger(count) && count >= 0),
  )

const aroundOf = (flags: CliDaemonFlags) => ({
  ...Option.match(countFlagOf(flags, 'before'), {
    onNone: () => ({}),
    onSome: leading => ({ leading }),
  }),
  ...Option.match(countFlagOf(flags, 'after'), {
    onNone: () => ({}),
    onSome: trailing => ({ trailing }),
  }),
})

const wordsNowOf = (bound: BoundBooks, flags: CliDaemonFlags) =>
  Option.map(readyOf(bound.readModel()), model =>
    spokenWordsOf(model, aroundOf(flags), Date.now()),
  )

/**
 * What `books words` prints: the words being read in the player, as the
 * books core says them. Lines for a pipe, a `#` line naming the title,
 * chapter, place and link, then `-`, `>` and `+` paragraphs; with
 * `--json`, one line of JSON. `--before 2 --after 3` choose how many
 * paragraphs sit around the one being read. While Books is still opening,
 * one `#` line says so.
 *
 * @example
 * ```typescript
 * paintWords(bound, {})
 * // '# A New Earth · Chapter 3 · 1:02:03 of 9:13:01 · playing · /books/a-new-earth/listen/1h02m03s\n- 1:01:40 …\n> 1:02:01 … [word] …\n+ 1:02:30 …'
 * paintWords(bound, { json: '1' })
 * // '{"_tag":"WordsNow","header":{…},"excerpt":{…}}'
 * ```
 */
export const paintWords = (bound: BoundBooks, flags: CliDaemonFlags): string =>
  wordsTextOf(bound, flags, wordsNowOf(bound, flags))

const wordsTextOf = (
  bound: BoundBooks,
  flags: CliDaemonFlags,
  maybeWords: Option.Option<SpokenWords>,
): string =>
  Option.match(maybeWords, {
    onNone: () =>
      flags['json'] === '1'
        ? JSON.stringify({ _tag: 'Opening', sentence: statusOf(bound) })
        : `# ${statusOf(bound)}`,
    onSome: words => {
      if (flags['json'] === '1') {
        return S.encodeSync(SpokenWordsJson)(words)
      } else if (flags['color'] === '1') {
        return Array.join(inkedWordsLines(words, inkOf(bound)), '\n')
      } else {
        return Array.join(spokenWordsLines(words), '\n')
      }
    },
  })

// NOTE: The view says whether its output is a terminal (the `color` flag);
// the player only knows the mode, from the Model, and paints from roles.
const inkOf = (bound: BoundBooks): Theme.TerminalInk =>
  Theme.terminalInkOf({
    isTerminal: true,
    env: {},
    mode: Option.match(readyOf(bound.readModel()), {
      onNone: () => 'Dark',
      onSome: model => Theme.modeOfState(model.appearance),
    }),
  })

const inkedParagraphOf = (
  ink: Theme.TerminalInk,
  paragraph: WordsParagraph,
  maybeCurrentWordIndex: Option.Option<number>,
): string => {
  const label = Theme.inked(ink, 'QuietText', paragraph.label)
  if (paragraph.position !== 'Current') {
    const mark = paragraph.position === 'Leading' ? '-' : '+'
    return `${mark} ${label} ${Theme.inked(ink, 'ReadingToCome', paragraph.text)}`
  } else {
    const words = paragraph.text.split(' ')
    const text = Option.match(maybeCurrentWordIndex, {
      onNone: () => Theme.inked(ink, 'ReadingSpoken', paragraph.text),
      onSome: index =>
        Array.join(
          Array.filter(
            [
              Theme.inked(
                ink,
                'ReadingSpoken',
                Array.join(words.slice(0, index), ' '),
              ),
              Theme.inked(
                ink,
                'ReadingCurrentWord',
                Option.getOrElse(Array.get(words, index), () => ''),
              ),
              Theme.inked(
                ink,
                'ReadingToCome',
                Array.join(words.slice(index + 1), ' '),
              ),
            ],
            part => part !== Theme.inked(ink, 'ReadingSpoken', ''),
          ),
          ' ',
        ),
    })
    return `> ${label} ${text}`
  }
}

type WordsParagraph = Extract<
  SpokenWords,
  { _tag: 'WordsNow' }
>['excerpt']['paragraphs'][number]

/**
 * The words as a terminal paints them, from the theme's roles: what was
 * spoken strong, the word being spoken in its color, what is to come and
 * the paragraphs around it dim, a section's heading in the reading rule's
 * color. The lines keep the shape `books words` prints without color.
 */
const inkedWordsLines = (
  words: SpokenWords,
  ink: Theme.TerminalInk,
): ReadonlyArray<string> => {
  const [header = '', ...rest] = spokenWordsLines(words)
  if (words._tag !== 'WordsNow') {
    return Array.map([header, ...rest], line =>
      Theme.inked(ink, 'QuietText', line),
    )
  } else {
    return [
      Theme.inked(ink, 'QuietText', header),
      ...Array.flatMap(words.excerpt.paragraphs, paragraph => [
        ...Array.fromOption(
          Option.map(paragraph.maybeHeading, heading =>
            Theme.inked(ink, 'ReadingRule', `## ${heading}`),
          ),
        ),
        inkedParagraphOf(ink, paragraph, words.excerpt.maybeCurrentWordIndex),
      ]),
    ]
  }
}

type WordsReading = Readonly<{
  maybeWords: Option.Option<SpokenWords>
  text: string
}>

const isSameWords = Option.makeEquivalence(isSameParagraph)

const eachWordEvery = Duration.millis(50)

/**
 * The `words` topic a view follows: what `books words` prints now, then
 * again each time the paragraph being read, the title, or whether it
 * plays changes, so `books follow words` scrolls the book as it is read.
 * `--each-word` prints again for every word instead: it reads the word
 * being spoken from the player's clock twenty times a second and prints
 * when the text changes, so it moves on the word while the Program hears
 * the place once a second. Each text is painted at the moment it changed,
 * so a slow reader never sees a later place under an earlier change.
 */
const followWords =
  (bound: BoundBooks): CliFollowing =>
  flags => {
    const read = (): WordsReading => {
      const maybeWords = wordsNowOf(bound, flags)
      return { maybeWords, text: wordsTextOf(bound, flags, maybeWords) }
    }
    return flags['each-word'] === '1'
      ? Stream.tick(eachWordEvery).pipe(
          Stream.map(() => read().text),
          Stream.changes,
        )
      : Stream.map(
          Interaction.follow(bound, read, (self, that) =>
            isSameWords(self.maybeWords, that.maybeWords),
          ),
          reading => reading.text,
        )
  }

const loadedNowOf = (bound: BoundBooks) =>
  Option.flatMap(readyOf(bound.readModel()), loadedTitleOf)

// SEARCH

const searchTimeout = Duration.seconds(60)

const searchOf = (bound: BoundBooks): Option.Option<BookSearch> =>
  Option.map(readyOf(bound.readModel()), bookSearchOf)

const isSettledFor = (search: BookSearch, query: string): boolean =>
  isBookSearchSettled(search) &&
  search._tag !== 'NoBookSearch' &&
  search.query === query

/**
 * The search of the book in the player once it has an answer for
 * `query`: its matches, or why it has none. None after a minute.
 */
const settledSearch = (bound: BoundBooks, query: string) =>
  Effect.callback<BookSearch>(resume => {
    const check = (): void => {
      const maybeSearch = searchOf(bound)
      if (
        Option.isSome(maybeSearch) &&
        isSettledFor(maybeSearch.value, query)
      ) {
        stopWatching()
        resume(Effect.succeed(maybeSearch.value))
      }
    }
    const stopWatching = bound.subscribe(check)
    check()
    return Effect.sync(stopWatching)
  }).pipe(Effect.timeoutOption(searchTimeout))

const searchTextOf = (search: BookSearch, flags: CliDaemonFlags): string =>
  flags['json'] === '1'
    ? S.encodeSync(BookSearchJson)(search)
    : Array.join(bookSearchLines(search), '\n')

const exampleTitleOf = (bound: BoundBooks): string =>
  Option.getOrElse(
    Option.map(
      Option.flatMap(readyOf(bound.readModel()), model =>
        Array.head(titlesOf(model)),
      ),
      title => title.slug,
    ),
    () => '<title>',
  )

/**
 * What `books search <words>` prints: every place the words are spoken in
 * the title in the player, as the books core finds them. A `#` line says
 * how many, then one line per match with its time, chapter, the words
 * with the match in brackets, and the link that opens the book on it;
 * with `--json`, one line of JSON. It presses the same `SearchFor` the
 * site's search field does, waits for the answer, and prints once: it
 * never plays or moves the audio. Nothing in the player, or no words, is
 * a sentence on stderr with exit code 1.
 *
 * @example
 * ```typescript
 * searchedBook(bound, ['search', 'lit', 'at', 'dusk'], {}, Processor.Host.Cli())
 * // '# 1 match for “lit at dusk” in The Lantern Keeper\n0:11 · The Light · The keeper [lit the lamp at dusk.] · /books/the-lantern-keeper/listen/11.2s'
 * ```
 */
export const searchedBook = (
  bound: BoundBooks,
  words: ReadonlyArray<string>,
  flags: CliDaemonFlags,
  client: Processor.Host.Host,
) =>
  Effect.gen(function* () {
    const query = Array.join(Array.drop(words, 1), ' ')
    if (query === '') {
      return {
        stdout: '',
        stderr: `Search for what? For example: ${booksCommandName} search "lit at dusk"`,
        exitCode: 1,
      }
    }
    if (Option.isNone(loadedNowOf(bound))) {
      return {
        stdout: '',
        stderr: `Nothing is in the player. Play a title first, such as: ${booksCommandName} listen ${exampleTitleOf(bound)}`,
        exitCode: 1,
      }
    }
    Interaction.onBehalfOf(bound, client, () =>
      bound.press(`SearchFor:${query}`),
    )
    const maybeSearch = yield* settledSearch(bound, query)
    return Option.match(maybeSearch, {
      onNone: () => ({
        stdout: '',
        stderr: `The search for “${query}” has not finished after a minute. Try again.`,
        exitCode: 1,
      }),
      onSome: search => ({
        stdout: searchTextOf(search, flags),
        ...(search._tag === 'BookSearchFailed'
          ? { exitCode: 1 }
          : { exitCode: 0 }),
      }),
    })
  })

// WRITES

/**
 * The library store's writes as a player watches them, so it can wait for
 * a place to save before it exits: `wrap` counts each write, `count` says
 * how many have started, and `whenDone` resolves once a write after that
 * count has finished and none is in flight, or after `timeoutMs`.
 */
export type LibraryWrites = Readonly<{
  wrap: (store: LibraryStoreService) => LibraryStoreService
  count: () => number
  whenDone: (afterCount: number, timeoutMs: number) => Promise<void>
}>

/**
 * Starts watching the library store's writes.
 *
 * @example
 * ```typescript
 * const writes = trackLibraryWrites()
 * startBooks(signedIn, { host, instance, library: writes.wrap })
 * ```
 */
export const trackLibraryWrites = (): LibraryWrites => {
  const state = {
    started: 0,
    finished: 0,
    waiters: new Set<() => void>(),
  }
  const isQuiet = (afterCount: number): boolean =>
    state.started > afterCount && state.finished === state.started
  const settle = (): void => {
    Array.forEach(Array.fromIterable(state.waiters), waiter => {
      waiter()
    })
  }
  const wrap = (store: LibraryStoreService): LibraryStoreService => ({
    ...store,
    write: write =>
      Effect.acquireUseRelease(
        Effect.sync(() => {
          state.started += 1
        }),
        () => store.write(write),
        () =>
          Effect.sync(() => {
            state.finished += 1
            settle()
          }),
      ),
  })
  const whenDone = (afterCount: number, timeoutMs: number): Promise<void> =>
    new Promise(resolve => {
      const done = (): void => {
        clearTimeout(timer)
        state.waiters.delete(check)
        resolve()
      }
      const check = (): void => {
        if (isQuiet(afterCount)) {
          done()
        }
      }
      const timer = setTimeout(done, timeoutMs)
      state.waiters.add(check)
      check()
    })
  return { wrap, count: () => state.started, whenDone }
}

// PLAYER

const saveTimeoutMs = 5_000

/**
 * Pauses the title playing, if one is, and waits for its place to save,
 * up to five seconds. Says what it stopped, or that nothing was playing.
 * A player runs it before it exits for any reason, so `books stop` and a
 * SIGTERM both keep the place. `maybeClient` is the Host of the client
 * that asked, such as `Cli` for `books stop`, which the Pause is sent for.
 */
export const pausedAndSaved = (
  bound: BoundBooks,
  writes: LibraryWrites,
  maybeClient: Option.Option<Processor.Host.Host> = Option.none(),
) =>
  Effect.gen(function* () {
    const maybeLoaded = loadedNowOf(bound)
    if (Option.isNone(maybeLoaded)) {
      return 'Nothing was playing. The player has stopped.'
    }
    const { title, loaded } = maybeLoaded.value
    const isUnsaved =
      TranscriptPlayer.isSounding(loaded.player) &&
      placeOf(loaded) !== loaded.savedPlaceMs
    const before = writes.count()
    if (TranscriptPlayer.isSounding(loaded.player)) {
      Option.match(maybeClient, {
        onNone: () => bound.press('Pause'),
        onSome: client =>
          Interaction.onBehalfOf(bound, client, () => bound.press('Pause')),
      })
    }
    if (isUnsaved) {
      yield* Effect.promise(() => writes.whenDone(before, saveTimeoutMs))
    }
    return `Stopped ${title.name} at ${clockOf(placeOf(loaded))}. Your place is saved.`
  })

const wordsOf = (token: string): ReadonlyArray<string> =>
  pipe(
    token.split(' '),
    Array.filter(word => word !== ''),
  )

const briefWords: ReadonlySet<string> = new Set(['', 'help', 'show'])

const movingWords: ReadonlySet<string> = new Set(['open', 'back'])

const addressPattern = /^https?:\/\//u

/**
 * A word as an address inside the Program: a whole link, such as the one
 * `Copy link to this word` puts in the clipboard, opens by its path, so
 * `books open https://…/books/the-lantern-keeper/listen/12m03.45s` lands
 * where `books open /books/the-lantern-keeper/listen/12m03.45s` does.
 */
const pathWordOf = (word: string): string =>
  addressPattern.test(word) && URL.canParse(word)
    ? `${new URL(word).pathname}${new URL(word).search}`
    : word

/** The Books player a daemon serves, and the moment `books stop` asks it to end. */
export type BooksPlayer = Readonly<{
  surface: CliDaemonSurface<SyncedBooksModel, SyncedBooksMessage>
  stopped: Effect.Effect<void>
}>

/**
 * The Books player's socket surface. Every command acts on this one
 * player and prints the brief after it runs: `books listen a-new-earth`
 * plays, `books pause` pauses, `books seek-to 1h00m00s` moves. `books` and
 * `books help` print the brief, `books actions` every command, `books
 * open /books/audible` and `books back` the page they land on, `books
 * screen` the page the player is on, `books
 * words` the paragraph being read with those around it, `books search
 * lit at dusk` every place those words are spoken with its link, and `books stop`
 * pauses, waits for the place to save, says so, and ends the player. A
 * view may follow `words` or `screen` and hear each change. A terminal UI view gets the player's screen, fitted to its
 * terminal, and its keys go through the same Program. Every command and
 * key is sent on behalf of the client that asked, `Cli` for `books pause`
 * and `Tui` for a `books tui` key, so telemetry records what each caused
 * on that client's surface. `onPainted` hears how long each frame took to
 * paint, such as telemetry's `recordRendered`.
 *
 * @example
 * ```typescript
 * const player = makeBooksPlayer(bound, trackLibraryWrites(), {
 *   onPainted: telemetry.recordRendered,
 * })
 * yield* listenCliDaemon({ socketPath, Model, Message, surface: player.surface, until: player.stopped })
 * ```
 */
export const makeBooksPlayer = (
  bound: BoundBooks,
  writes: LibraryWrites,
  reporting: TerminalPaintReporting = {},
): BooksPlayer => {
  const programSurface = programCliSurface(bound, booksCommandName)
  const terminal = makeProgramTerminalView(bound, booksCommandName, reporting)
  const stopped = Effect.runSync(Deferred.make<void>())
  const brief = (): CliDaemonPaintedResult => ({
    stdout: paintBrief(bound),
    exitCode: 0,
  })
  const ran = (
    words: ReadonlyArray<string>,
    flags: CliDaemonFlags,
    client: Processor.Host.Host,
  ): CliDaemonPaintedResult => {
    const result = Interaction.onBehalfOf(bound, client, () =>
      runProgramCommand(bound, booksCommandName, words, flags),
    )
    return {
      stdout: paintBrief(bound),
      exitCode: result.exitCode,
      ...(result.stderr === undefined ? {} : { stderr: result.stderr }),
    }
  }
  const moved = (
    words: ReadonlyArray<string>,
    flags: CliDaemonFlags,
    client: Processor.Host.Host,
  ): CliDaemonPaintedResult => {
    const result = Interaction.onBehalfOf(bound, client, () =>
      runProgramCommand(bound, booksCommandName, words, flags),
    )
    return {
      stdout: paintScreen(bound),
      exitCode: result.exitCode,
      ...(result.stderr === undefined ? {} : { stderr: result.stderr }),
    }
  }
  const stop = (client: Processor.Host.Host) =>
    Effect.gen(function* () {
      const sentence = yield* pausedAndSaved(bound, writes, Option.some(client))
      yield* Deferred.succeed(stopped, undefined)
      return { stdout: sentence, exitCode: 0 }
    })
  const followings = {
    ...programFollowings(bound),
    words: followWords(bound),
  }
  return {
    stopped: Deferred.await(stopped),
    surface: {
      read: programSurface.read,
      run: programSurface.run,
      follow: (topic, flags, client) =>
        followTopicOf(followings, topic, flags, client),
      show: (flags, client) =>
        isTerminalViewRequest(flags)
          ? terminal.paint(flags, client)
          : Effect.sync(brief),
      do: (token, flags, client) => {
        const words = wordsOf(token)
        const head = Option.getOrElse(Array.head(words), () => '')
        if (isTerminalViewRequest(flags)) {
          return terminal.pressKey(flags, client)
        } else if (briefWords.has(head)) {
          return Effect.sync(brief)
        } else if (head === 'actions') {
          return Effect.sync(() => ({
            stdout: paintProgram(bound, booksCommandName),
            exitCode: 0,
          }))
        } else if (head === 'stop') {
          return stop(client)
        } else if (head === 'screen') {
          return Effect.sync(() => ({
            stdout: paintScreen(bound),
            exitCode: 0,
          }))
        } else if (movingWords.has(head)) {
          return Effect.sync(() =>
            moved(Array.map(words, pathWordOf), flags, client),
          )
        } else if (head === 'search') {
          return searchedBook(bound, words, flags, client)
        } else if (head === 'words') {
          return Effect.sync(() => ({
            stdout: paintWords(bound, flags),
            exitCode: 0,
          }))
        } else if (head === 'where') {
          return Effect.sync(() =>
            runProgramCommand(bound, booksCommandName, words, flags),
          )
        } else {
          return Effect.sync(() => ran(words, flags, client))
        }
      },
    },
  }
}

/**
 * A surface that answers every command with why the player could not
 * start, such as a sign-in Cloudflare Access refused, so the command that
 * started it can say so.
 */
export const refusingSurface = (
  reason: string,
): CliDaemonSurface<SyncedBooksModel, SyncedBooksMessage> => {
  const refused = Effect.succeed({ stdout: '', stderr: reason, exitCode: 1 })
  return {
    read: () => Effect.fail(new CliDaemonError({ message: reason })),
    run: () => Effect.fail(new CliDaemonError({ message: reason })),
    follow: () => Stream.fail(new CliDaemonError({ message: reason })),
    show: () => refused,
    do: () => refused,
  }
}

// DONE

const idleCheckEvery = Duration.seconds(30)

/**
 * Completes when the title in the player plays to its end, once its finish
 * is saved, so the player can exit.
 */
export const whenTitleFinished = (bound: BoundBooks, writes: LibraryWrites) =>
  Effect.callback<void>(resume => {
    const state = { wasSounding: false, writesWhileSounding: writes.count() }
    const check = (): void => {
      const maybeLoaded = loadedNowOf(bound)
      const isSounding = Option.exists(maybeLoaded, ({ loaded }) =>
        TranscriptPlayer.isSounding(loaded.player),
      )
      const isAtEnd = Option.exists(
        maybeLoaded,
        ({ title, loaded }) => placeOf(loaded) >= title.durationMs,
      )
      if (state.wasSounding && !isSounding && isAtEnd) {
        stopWatching()
        void writes
          .whenDone(state.writesWhileSounding, saveTimeoutMs)
          .then(() => {
            resume(Effect.void)
          })
      } else if (isSounding) {
        state.writesWhileSounding = writes.count()
      }
      state.wasSounding = isSounding
    }
    const stopWatching = bound.subscribe(check)
    check()
    return Effect.sync(stopWatching)
  })

/**
 * Completes once nothing has been in the player for `idleMs`, so a player
 * started only to print the brief does not stay forever.
 */
export const whenIdleFor = (bound: BoundBooks, idleMs: number) =>
  Effect.gen(function* () {
    const state = { idleSinceMs: Date.now() }
    while (Date.now() - state.idleSinceMs < idleMs) {
      yield* Effect.sleep(idleCheckEvery)
      if (Option.isSome(loadedNowOf(bound))) {
        state.idleSinceMs = Date.now()
      }
    }
  })
