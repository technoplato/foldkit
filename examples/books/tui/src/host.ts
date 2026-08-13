import {
  BooksProgram,
  type Message,
  type Model,
  PressedGoBack,
  PressedOpenAccounts,
  PressedOpenBook,
  PressedOpenImport,
  PressedOpenPlaybackReader,
  PressedOpenSearch,
  PressedOpenSettings,
  PressedPausePlayback,
  PressedResumePlayback,
  PressedScanFinished,
  PressedScanShelf,
  PressedShowAudio,
  PressedShowBoth,
  PressedShowText,
  PressedSignIn,
  PressedSignOut,
  PressedStartPlayback,
  PressedStopPlayback,
  itemById,
} from 'books-core-example'
import {
  Cause,
  Effect,
  Layer,
  Match as M,
  Option,
  PlatformError,
  Queue,
  Terminal,
} from 'effect'
import { Runtime } from 'foldkit'

import { ShelfBrowse, renderAscii } from '../../shared-ui/dist/index.js'

const CLEAR_SCREEN = '\u001b[2J\u001b[H'
const SCREEN_INNER_WIDTH = 62

const framed = (content: string): string => {
  const clipped = content.slice(0, SCREEN_INNER_WIDTH - 1)
  const remainingWidth = Math.max(0, SCREEN_INNER_WIDTH - clipped.length)
  return `| ${clipped}${' '.repeat(Math.max(0, remainingWidth - 1))}|`
}

const visibleIds = (model: Model): ReadonlyArray<string> =>
  M.value(model.screen).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      SignedOut: () => [],
      ShelfEmpty: () => [],
      ShelfBrowse: () => model.items.map(item => item.id),
      ReaderText: () => [],
      ReaderAudio: () => [],
      ReaderBoth: () => [],
      ImportIdle: () => [],
      ImportScanning: () => [],
      Settings: () => [],
      Accounts: () => [],
      Search: ({ query }) =>
        model.items
          .filter(
            item =>
              query === '' ||
              item.title.toLowerCase().includes(query.toLowerCase()),
          )
          .map(item => item.id),
    }),
  )

const readerItemId = (model: Model): string | undefined =>
  M.value(model.screen).pipe(
    M.withReturnType<string | undefined>(),
    M.tagsExhaustive({
      ReaderAudio: ({ itemId }) => itemId,
      ReaderBoth: ({ itemId }) => itemId,
      ReaderText: ({ itemId }) => itemId,
      Accounts: () => undefined,
      ImportIdle: () => undefined,
      ImportScanning: () => undefined,
      Search: () => undefined,
      Settings: () => undefined,
      ShelfBrowse: () => undefined,
      ShelfEmpty: () => undefined,
      SignedOut: () => undefined,
    }),
  )

const listLines = (model: Model): ReadonlyArray<string> =>
  M.value(model.screen).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      SignedOut: () => ['Self-hosted shelves. Sign in to open them.'],
      ShelfEmpty: () => ['No books on this shelf.'],
      ShelfBrowse: () =>
        model.items.map(
          (item, index) => `[${index + 1}] ${item.title} ${item.authorLabel}`,
        ),
      ReaderText: ({ itemId }) => readerLines(model, itemId, 'text'),
      ReaderAudio: ({ itemId }) => readerLines(model, itemId, 'audio'),
      ReaderBoth: ({ itemId }) => readerLines(model, itemId, 'both'),
      ImportIdle: () => ['/media/books · watch on'],
      ImportScanning: () => ['Host creates file, book, rendition, item rows.'],
      Settings: () => [
        `Speech rate ${model.speechRate}`,
        'Word highlight <= 50 ms',
      ],
      Accounts: () => ['michael · root · on'],
      Search: ({ query }) => [
        query === '' ? 'No query' : query,
        ...model.items
          .filter(
            item =>
              query === '' ||
              item.title.toLowerCase().includes(query.toLowerCase()),
          )
          .map((item, index) => `[${index + 1}] ${item.title}`),
      ],
    }),
  )

const readerLines = (
  model: Model,
  itemId: string,
  pane: string,
): ReadonlyArray<string> => {
  const item = itemById(model.items, itemId)
  return [
    item?.title ?? itemId,
    item?.authorLabel ?? '',
    item?.body ?? '',
    pane,
    playLine(model),
  ]
}

const playLine = (model: Model): string =>
  M.value(model.play).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      PlayIdle: () => 'playIdle',
      PlayPaused: play =>
        `${itemById(model.items, play.itemId)?.title ?? play.itemId} paused`,
      PlayPlaying: play =>
        `${itemById(model.items, play.itemId)?.title ?? play.itemId} playing`,
    }),
  )

const titleForScreen = (model: Model): string =>
  M.value(model.screen).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      SignedOut: () => 'Books',
      ShelfEmpty: () => 'Home',
      ShelfBrowse: () => 'Home',
      ReaderText: () => 'Reader',
      ReaderAudio: () => 'Reader',
      ReaderBoth: () => 'Reader',
      ImportIdle: () => 'Import',
      ImportScanning: () => 'Scanning',
      Settings: () => 'Settings',
      Accounts: () => 'People',
      Search: () => 'Search',
    }),
  )

const helpLines = (model: Model): ReadonlyArray<string> => {
  if (model.screen._tag === 'SignedOut') {
    return ['[S] sign in  [Q] quit']
  }
  return [
    '[1-9] open  [I] import  [F] search  [A] people  [G] settings',
    '[K] back  [P] play  [Space] pause/resume  [O] sign out  [Q] quit',
  ]
}

const shelfAsciiLines = (model: Model): ReadonlyArray<string> =>
  renderAscii(
    ShelfBrowse(
      model.items.map(item => ({
        title: item.title,
        authorLabel: item.authorLabel,
        coverSrc: Option.getOrElse(item.coverUrl, () => ''),
      })),
    ),
    SCREEN_INNER_WIDTH - 2,
  ).lines

export const renderBooksScreen = (model: Model): string => {
  const border = `+${'-'.repeat(SCREEN_INNER_WIDTH)}+`
  const body =
    model.screen._tag === 'ShelfBrowse'
      ? shelfAsciiLines(model)
      : listLines(model)
  const lines = [
    border,
    framed(titleForScreen(model)),
    framed(''),
    ...body.map(framed),
    framed(''),
    ...helpLines(model).map(framed),
    border,
  ]
  return `${CLEAR_SCREEN}${lines.join('\n')}\n`
}

export const messageForInput = (
  model: Model,
  input: string,
): Option.Option<Message> => {
  const key = input.toLowerCase()
  const index = Number.parseInt(key, 10)
  if (index >= 1 && index <= 9) {
    const id = visibleIds(model)[index - 1]
    if (id === undefined) {
      return Option.none()
    }
    return Option.some(PressedOpenBook({ itemId: id }))
  }
  if (key === 's') {
    if (model.screen._tag === 'SignedOut') {
      return Option.some(PressedSignIn())
    }
    return Option.none()
  }
  if (key === 'g') {
    return Option.some(PressedOpenSettings())
  }
  if (key === 'i') {
    return Option.some(PressedOpenImport())
  }
  if (key === 'f') {
    return Option.some(PressedOpenSearch())
  }
  if (key === 'a') {
    return Option.some(PressedOpenAccounts())
  }
  if (key === 'k') {
    return Option.some(PressedGoBack())
  }
  if (key === 'o') {
    return Option.some(PressedSignOut())
  }
  if (key === 't') {
    return Option.some(PressedShowText())
  }
  if (key === 'u') {
    return Option.some(PressedShowAudio())
  }
  if (key === 'd') {
    return Option.some(PressedShowBoth())
  }
  if (key === 'n') {
    return Option.some(PressedScanShelf())
  }
  if (key === 'e') {
    return Option.some(PressedScanFinished())
  }
  if (key === 'r') {
    return Option.some(PressedOpenPlaybackReader())
  }
  if (key === 'p') {
    const itemId = readerItemId(model)
    if (itemId === undefined) {
      return Option.none()
    }
    return Option.some(PressedStartPlayback({ itemId }))
  }
  if (key === ' ' || key === 'space') {
    if (model.play._tag === 'PlayPlaying') {
      return Option.some(PressedPausePlayback())
    }
    if (model.play._tag === 'PlayPaused') {
      return Option.some(PressedResumePlayback())
    }
    return Option.none()
  }
  if (key === 'x') {
    return Option.some(PressedStopPlayback())
  }
  return Option.none()
}

const runInputLoop = (
  inputQueue: Queue.Dequeue<Terminal.UserInput, Cause.Done>,
  runtime: Runtime.ProgramRuntime<Model, Message>,
  terminal: Terminal.Terminal,
): Effect.Effect<void, Cause.Done | PlatformError.PlatformError> =>
  Queue.take(inputQueue).pipe(
    Effect.flatMap(input => {
      const key = Option.getOrElse(
        input.input,
        () => input.key.name,
      ).toLowerCase()
      if (key === 'q') {
        return Effect.void
      }

      const maybeMessage = messageForInput(runtime.readModel(), key)
      if (Option.isSome(maybeMessage)) {
        return runtime.run(maybeMessage.value).pipe(
          Effect.flatMap(model => terminal.display(renderBooksScreen(model))),
          Effect.flatMap(() => runInputLoop(inputQueue, runtime, terminal)),
        )
      } else {
        return runInputLoop(inputQueue, runtime, terminal)
      }
    }),
  )

export const runBooksTui = (): Effect.Effect<
  void,
  Cause.Done | PlatformError.PlatformError,
  Terminal.Terminal
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: BooksProgram,
          resources: Layer.empty,
        }),
      )

      yield* runtime.initialization
      yield* terminal.display(renderBooksScreen(runtime.readModel()))

      const inputQueue = yield* terminal.readInput
      yield* runInputLoop(inputQueue, runtime, terminal)
      yield* runtime.shutdown
    }),
  )
