import {
  type Item,
  type Model,
  itemById,
} from 'books-core-example'
import {
  BooksProvider,
  useBooksActions,
  useBooksModel,
  useBooksReplay,
} from 'books-react-bindings-example'
import { Match as M, Option } from 'effect'
import type { ReactNode } from 'react'

export const App = () => (
  <BooksProvider>
    <BooksScreen />
  </BooksProvider>
)

const BooksScreen = () => {
  const model = useBooksModel()
  const actions = useBooksActions()
  const replay = useBooksReplay()

  return (
    <main className="min-h-screen bg-zinc-950 text-amber-50 p-6">
      <div className="mx-auto max-w-xl space-y-6">
        {screenView(model, actions)}
        <section className="space-y-3 border border-zinc-800 p-4 text-left">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{replay.mode}</span>
            <span className="tabular-nums text-zinc-500">
              Frame {replay.frame} of {replay.finalFrame}
            </span>
          </div>
          <input
            aria-label="Replay frame"
            className="w-full accent-amber-500"
            max={replay.finalFrame}
            min={0}
            onChange={event => replay.seek(Number(event.currentTarget.value))}
            type="range"
            value={replay.frame}
          />
        </section>
      </div>
    </main>
  )
}

type Actions = ReturnType<typeof useBooksActions>

const screenView = (model: Model, actions: Actions) =>
  M.value(model.screen).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      SignedOut: () => (
        <section className="space-y-4">
          <h1 className="text-2xl font-semibold">Books</h1>
          <p className="text-zinc-400">
            Self-hosted shelves. Sign in to open them.
          </p>
          <button
            className={primaryClassName}
            onClick={actions.pressedSignIn}
            type="button"
          >
            Sign in
          </button>
        </section>
      ),
      ShelfEmpty: () => (
        <section className="space-y-4">
          {signedInNav(actions)}
          <h1 className="text-2xl font-semibold">Home</h1>
          <p className="text-zinc-400">No books on this shelf.</p>
          {playBar(model, actions)}
        </section>
      ),
      ShelfBrowse: () => (
        <section className="space-y-4">
          {signedInNav(actions)}
          <h1 className="text-2xl font-semibold">Home</h1>
          <div className="grid gap-3">
            {model.items.map(item => itemCard(item, actions))}
          </div>
          {playBar(model, actions)}
        </section>
      ),
      ReaderText: ({ itemId }) => readerView(model, itemId, 'text', actions),
      ReaderAudio: ({ itemId }) => readerView(model, itemId, 'audio', actions),
      ReaderBoth: ({ itemId }) => readerView(model, itemId, 'both', actions),
      ImportIdle: () => (
        <section className="space-y-4">
          {signedInNav(actions)}
          <h1 className="text-2xl font-semibold">Import</h1>
          <p className="text-zinc-400">/media/books · watch on</p>
          <button
            className={primaryClassName}
            onClick={actions.pressedScanShelf}
            type="button"
          >
            Scan shelf
          </button>
          <button
            className={buttonClassName}
            onClick={actions.pressedGoBack}
            type="button"
          >
            Back
          </button>
        </section>
      ),
      ImportScanning: () => (
        <section className="space-y-4">
          <h1 className="text-2xl font-semibold">Scanning</h1>
          <p className="text-zinc-400">
            Host creates file, book, rendition, and item rows.
          </p>
          <button
            className={buttonClassName}
            onClick={actions.pressedScanFinished}
            type="button"
          >
            Done
          </button>
        </section>
      ),
      Settings: () => (
        <section className="space-y-4">
          {signedInNav(actions)}
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-zinc-400">
            Speech rate {model.speechRate} · highlight ≤ 50 ms
          </p>
          <button
            className={buttonClassName}
            onClick={actions.pressedGoBack}
            type="button"
          >
            Back
          </button>
        </section>
      ),
      Accounts: () => (
        <section className="space-y-4">
          {signedInNav(actions)}
          <h1 className="text-2xl font-semibold">People</h1>
          <p className="text-zinc-400">michael · root · on</p>
          <button
            className={buttonClassName}
            onClick={actions.pressedGoBack}
            type="button"
          >
            Back
          </button>
        </section>
      ),
      Search: ({ query }) => (
        <section className="space-y-4">
          {signedInNav(actions)}
          <h1 className="text-2xl font-semibold">Search</h1>
          <input
            aria-label="Search query"
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2"
            onChange={event => actions.pressedSetQuery(event.currentTarget.value)}
            value={query}
          />
          <div className="grid gap-3">
            {model.items
              .filter(
                item =>
                  query === '' ||
                  item.title.toLowerCase().includes(query.toLowerCase()),
              )
              .map(item => itemCard(item, actions))}
          </div>
          <button
            className={buttonClassName}
            onClick={actions.pressedGoBack}
            type="button"
          >
            Back
          </button>
        </section>
      ),
    }),
  )

const signedInNav = (actions: Actions) => (
  <nav className="flex flex-wrap gap-2">
    <button
      className={buttonClassName}
      onClick={actions.pressedOpenImport}
      type="button"
    >
      Import
    </button>
    <button
      className={buttonClassName}
      onClick={actions.pressedOpenSearch}
      type="button"
    >
      Search
    </button>
    <button
      className={buttonClassName}
      onClick={actions.pressedOpenAccounts}
      type="button"
    >
      People
    </button>
    <button
      className={buttonClassName}
      onClick={actions.pressedOpenSettings}
      type="button"
    >
      Settings
    </button>
    <button
      className={buttonClassName}
      onClick={actions.pressedSignOut}
      type="button"
    >
      Sign out
    </button>
  </nav>
)

const itemCard = (item: Item, actions: Actions) => (
  <button
    className={cardClassName}
    key={item.id}
    onClick={() => actions.pressedOpenBook(item.id)}
    type="button"
  >
    <div className="font-semibold">{item.title}</div>
    <div className="text-sm text-zinc-400">{item.authorLabel}</div>
  </button>
)

const readerView = (
  model: Model,
  itemId: string,
  pane: 'text' | 'audio' | 'both',
  actions: Actions,
) => {
  const item = itemById(model.items, itemId)
  return (
    <section className="space-y-4">
      {signedInNav(actions)}
      <h1 className="text-2xl font-semibold">{item?.title ?? itemId}</h1>
      <p className="text-zinc-400">{item?.authorLabel ?? ''}</p>
      <p>{item?.body ?? ''}</p>
      <p className="text-sm text-zinc-500">
        {pane === 'both' ? 'two rendition ids · never one body both' : pane}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          className={buttonClassName}
          onClick={actions.pressedShowText}
          type="button"
        >
          Text
        </button>
        <button
          className={buttonClassName}
          onClick={actions.pressedShowAudio}
          type="button"
        >
          Audio
        </button>
        <button
          className={buttonClassName}
          onClick={actions.pressedShowBoth}
          type="button"
        >
          Both
        </button>
        {item && Option.isSome(item.audioId) ? (
          <button
            className={primaryClassName}
            onClick={() => actions.pressedStartPlayback(itemId)}
            type="button"
          >
            Play
          </button>
        ) : null}
        <button
          className={buttonClassName}
          onClick={actions.pressedGoBack}
          type="button"
        >
          Back
        </button>
      </div>
      {playBar(model, actions)}
    </section>
  )
}

const playBar = (model: Model, actions: Actions) =>
  M.value(model.play).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      PlayIdle: () => <p className="text-sm text-zinc-500">playIdle</p>,
      PlayPaused: play => {
        const item = itemById(model.items, play.itemId)
        return (
          <div className="flex flex-wrap gap-2 items-center">
            <button
              className={buttonClassName}
              onClick={actions.pressedResumePlayback}
              type="button"
            >
              Resume
            </button>
            <button
              className={buttonClassName}
              onClick={actions.pressedStopPlayback}
              type="button"
            >
              Stop
            </button>
            <button
              className={buttonClassName}
              onClick={actions.pressedOpenPlaybackReader}
              type="button"
            >
              Open audio
            </button>
            <span className="text-sm text-zinc-400">
              {item?.title ?? play.itemId} paused
            </span>
          </div>
        )
      },
      PlayPlaying: play => {
        const item = itemById(model.items, play.itemId)
        return (
          <div className="flex flex-wrap gap-2 items-center">
            <button
              className={buttonClassName}
              onClick={actions.pressedPausePlayback}
              type="button"
            >
              Pause
            </button>
            <button
              className={buttonClassName}
              onClick={actions.pressedStopPlayback}
              type="button"
            >
              Stop
            </button>
            <button
              className={buttonClassName}
              onClick={actions.pressedOpenPlaybackReader}
              type="button"
            >
              Open audio
            </button>
            <span className="text-sm text-zinc-400">
              {item?.title ?? play.itemId} playing
            </span>
          </div>
        )
      },
    }),
  )

const buttonClassName =
  'bg-zinc-800 text-amber-100 hover:bg-zinc-700 px-3 py-2 rounded border border-zinc-600'
const primaryClassName =
  'bg-amber-500 text-zinc-950 hover:bg-amber-400 px-3 py-2 rounded'
const cardClassName =
  'w-full text-left border border-zinc-700 rounded p-3 hover:border-amber-500'
