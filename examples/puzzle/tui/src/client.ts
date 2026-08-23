import {
  Array,
  Cause,
  Effect,
  Match as M,
  Option,
  PlatformError,
  Queue,
  Terminal,
} from 'effect'
import { Program } from 'foldkit'
import { type UiNode } from 'foldkit/renderers'
import {
  type AppMessage,
  type AppModel,
  type FactCallable,
  type PuzzleFactHandles,
  PuzzleProgram,
  type SyncedPuzzleHandle,
  type TapHandle,
  actionByToken,
  actionMenuMessageFromKey,
  actionMenuRowLabel,
  chosenMenuTokenOf,
  demoModel,
  describePuzzleSyncError,
  factHandleEntries,
  filterListedActions,
  isActionMenuEnterKey,
  listActions,
  puzzleScreen,
  renderChrome,
} from 'puzzle-core-example'

import { paintTui } from './paintTui.js'

const CLEAR_SCREEN = '\u001b[2J\u001b[H'

const menuBoxLine = (content: string, width: number): string =>
  `│ ${content.padEnd(width)} │`

const rowMark = (
  rowToken: string,
  index: number,
  maybeHighlight: Option.Option<number>,
  maybeChosen: Option.Option<string>,
): string => {
  if (Option.isSome(maybeChosen) && maybeChosen.value === rowToken) {
    return '* '
  }
  if (Option.isSome(maybeHighlight) && maybeHighlight.value === index) {
    return '> '
  }
  return '  '
}

const paintActionMenu = (
  snapshot: Program.SyncedModel<AppModel, AppMessage>,
  maybeChosen: Option.Option<string> = Option.none(),
): string => {
  if (snapshot._tag !== 'Ready' || snapshot.actionMenu._tag === 'Closed') {
    return ''
  }
  const { maybeQuery } = snapshot.actionMenu
  const catalog = listActions(PuzzleProgram, snapshot.product)
  const filtered = filterListedActions(catalog, maybeQuery)
  const maybeHighlight = Program.highlightIndex(snapshot.actionMenu, filtered)
  const query = Option.getOrElse(maybeQuery, () => '')
  const title =
    query === '' ? 'Actions  [? open] [esc close]' : `Actions  ${query}`
  const rowLines =
    filtered._tag === 'Empty'
      ? ['  Empty']
      : filtered.rows.map((row, index) => {
          const mark = rowMark(row.token, index, maybeHighlight, maybeChosen)
          return `${mark}${actionMenuRowLabel(row)}`
        })
  const inner = [title, ...rowLines]
  const width = inner.reduce((max, line) => Math.max(max, line.length), 24)
  const edge = '─'.repeat(width + 2)
  return [
    `┌${edge}┐`,
    ...inner.map(line => menuBoxLine(line, width)),
    `└${edge}┘`,
  ].join('\n')
}

/** Renders Starting, Failed, or the imported Puzzle chrome. */
export const renderPuzzleScreen = (
  snapshot: Program.SyncedModel<AppModel, AppMessage>,
  maybeChosen: Option.Option<string> = Option.none(),
): string =>
  M.value(snapshot).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Starting: () =>
        `${CLEAR_SCREEN}Starting Instant Puzzle…\n\n[Q] quit  [?] actions\n`,
      Failed: ({ error }) =>
        `${CLEAR_SCREEN}${describePuzzleSyncError(error)}\n\n[Q] quit  [?] actions\n`,
      Ready: ({ product }) => {
        const chrome = renderChrome(product, 'computer')
        const menu = paintActionMenu(snapshot, maybeChosen)
        const overlay = menu === '' ? '' : `${menu}\n\n`
        return `${CLEAR_SCREEN}${overlay}${chrome}\n\n[Q] quit  [?] actions\n`
      },
    }),
  )

const startingScreen = puzzleScreen(demoModel())

const puzzleKeysForToken = (token: string): ReadonlyArray<string> => {
  const action = actionByToken(token)
  if (action === undefined) {
    return []
  }
  return action.keys ?? []
}

const productScreenOf = (
  snapshot: Program.SyncedModel<AppModel, AppMessage>,
): UiNode => {
  if (snapshot._tag === 'Ready') {
    return puzzleScreen(snapshot.product)
  }
  return startingScreen
}

/**
 * Paints the screen window: the product tree plus overlay chrome.
 * Key hints come from the Action `keys` metadata.
 */
export const renderPuzzleScreenWindow = (
  snapshot: Program.SyncedModel<AppModel, AppMessage>,
  maybeChosen: Option.Option<string> = Option.none(),
): string => {
  const painted = paintTui(productScreenOf(snapshot), {
    keysForToken: puzzleKeysForToken,
  })
  const menu = paintActionMenu(snapshot, maybeChosen)
  const overlay = menu === '' ? '' : `${menu}\n\n`
  return `${CLEAR_SCREEN}${overlay}${painted}\n\n[Q] quit\n`
}

/**
 * Resolves a terminal key to a derived fact handle. The keymap comes
 * from the `keys` metadata on the Action declarations. Nothing here
 * knows which key belongs to which Action.
 */
export const factHandleForKey = (
  input: string,
  handles: PuzzleFactHandles,
): Option.Option<FactCallable | TapHandle> => {
  const key = input.toLowerCase()
  const entries = factHandleEntries(handles)
  return Option.map(
    Array.findFirst(
      entries,
      ([action]) =>
        Array.contains(action.keys ?? [], key) ||
        Array.contains(action.keys ?? [], input),
    ),
    ([, factHandle]) => factHandle,
  )
}

/**
 * Taps the fact for one keypress. An always-valid handle is a bare
 * callable. A gated handle only taps when Tappable; Hidden has no way
 * to send.
 */
export const tapForInput = (
  input: string,
  handles: PuzzleFactHandles,
): void => {
  const maybeHandle = factHandleForKey(input, handles)
  if (Option.isNone(maybeHandle)) {
    return
  }
  const factHandle = maybeHandle.value
  if (typeof factHandle === 'function') {
    factHandle()
    return
  }
  M.value(factHandle).pipe(
    M.tagsExhaustive({
      Tappable: ({ tap }) => {
        tap()
      },
      Hidden: () => undefined,
    }),
  )
}

const runInputLoop = (
  inputQueue: Queue.Dequeue<Terminal.UserInput, Cause.Done>,
  handle: SyncedPuzzleHandle,
  paint: (
    snapshot: Program.SyncedModel<AppModel, AppMessage>,
    maybeChosen?: Option.Option<string>,
  ) => Effect.Effect<void, PlatformError.PlatformError>,
): Effect.Effect<void, Cause.Done | PlatformError.PlatformError> =>
  Queue.take(inputQueue).pipe(
    Effect.flatMap(input => {
      const raw = Option.getOrElse(input.input, () => input.key.name)
      const key = raw.toLowerCase()
      if (key === 'q') {
        return Effect.void
      }
      const snapshot = handle.readModel()
      const menu =
        snapshot._tag === 'Ready' ? snapshot.actionMenu : Program.Closed()
      const product = snapshot._tag === 'Ready' ? snapshot.product : demoModel()
      const rows = listActions(PuzzleProgram, product)
      const menuKey =
        isActionMenuEnterKey(input.key.name) || isActionMenuEnterKey(raw)
          ? 'Enter'
          : raw
      const menuMessage = actionMenuMessageFromKey(
        {
          key: menuKey,
          metaKey: input.key.meta,
          ctrlKey: input.key.ctrl,
        },
        menu,
        rows,
        product,
      )
      if (menuMessage !== undefined) {
        const maybeChosen =
          menu._tag === 'Open' ? chosenMenuTokenOf(menuMessage) : Option.none()
        handle.send(menuMessage)
        if (Option.isSome(maybeChosen) && snapshot._tag === 'Ready') {
          return paint(snapshot, maybeChosen).pipe(
            Effect.flatMap(() => paint(handle.readModel())),
            Effect.flatMap(() => runInputLoop(inputQueue, handle, paint)),
          )
        }
      } else {
        tapForInput(key, handle.actions())
      }
      return paint(handle.readModel()).pipe(
        Effect.flatMap(() => runInputLoop(inputQueue, handle, paint)),
      )
    }),
  )

/** Which window the TUI paints. Screen paints the Program screen tree. */
export type PuzzleTuiWindow = 'Bespoke' | 'Screen'

/** Paints the synced handle. The Client only subscribes and sends. */
export const runPuzzleTui = (
  handle: SyncedPuzzleHandle,
  window: PuzzleTuiWindow = 'Bespoke',
): Effect.Effect<
  void,
  Cause.Done | PlatformError.PlatformError,
  Terminal.Terminal
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal
      const inputQueue = yield* terminal.readInput
      const paints =
        yield* Queue.unbounded<Program.SyncedModel<AppModel, AppMessage>>()
      const unsubscribe = handle.subscribe(() => {
        Effect.runSync(Queue.offer(paints, handle.readModel()))
      })
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          unsubscribe()
          handle.stop()
        }),
      )

      const render =
        window === 'Screen' ? renderPuzzleScreenWindow : renderPuzzleScreen
      const paint = (
        snapshot: Program.SyncedModel<AppModel, AppMessage>,
        maybeChosen: Option.Option<string> = Option.none(),
      ) => terminal.display(render(snapshot, maybeChosen))

      yield* paint(handle.readModel())

      const paintUntilReadyOrFailed = (): Effect.Effect<
        void,
        Cause.Done | PlatformError.PlatformError,
        Terminal.Terminal
      > =>
        Effect.gen(function* () {
          if (handle.readModel()._tag !== 'Starting') {
            return
          }
          const snapshot = yield* Queue.take(paints)
          yield* paint(snapshot)
          yield* paintUntilReadyOrFailed()
        })
      yield* paintUntilReadyOrFailed()

      const paintLoop = Queue.take(paints).pipe(
        Effect.flatMap(snapshot => paint(snapshot)),
        Effect.forever,
        Effect.asVoid,
      )
      yield* Effect.raceFirst(
        runInputLoop(inputQueue, handle, paint),
        paintLoop,
      )
    }),
  )
