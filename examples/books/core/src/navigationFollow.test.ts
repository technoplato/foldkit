import { Array, Effect, Layer, Option, Stream } from 'effect'
import { Interaction, Runtime } from 'foldkit'
import { AudioOutput, noTranscripts } from 'transcript-player-core-example'
import { describe, expect, it } from 'vitest'

import {
  makeTestLibraryStore,
  noReadAloud,
  noScribeTimeline,
  sampleShelf,
} from './sample.js'
import { makeTestLinkSharing } from './share.js'
import { SyncedBooks, bindBooks } from './synced.js'

const pollMs = 10

const pollAttempts = 200

const eventually = async (
  isDone: () => boolean,
  attemptsLeft = pollAttempts,
): Promise<void> => {
  if (isDone()) {
    return
  } else if (attemptsLeft === 0) {
    throw new Error('never happened')
  } else {
    await new Promise(resolve => setTimeout(resolve, pollMs))
    return eventually(isDone, attemptsLeft - 1)
  }
}

type EngineFor = (processor: string) => Runtime.SyncEngine

type Wire = {
  snapshot: string | undefined
  messages: Array<string>
  listeners: Set<Parameters<Runtime.SyncEngine['subscribe']>[0]>
}

const deliveryDelayMs = 2

/**
 * A second sync engine, for tests only. Unlike Memory it keeps every row
 * as JSON text, the way a row crosses a real transport, and delivers a
 * write to listeners a moment later instead of at once.
 */
const wireEngine =
  (wire: Wire): EngineFor =>
  processor => ({
    processor,
    read: () =>
      Effect.sync(() => ({
        snapshot:
          wire.snapshot === undefined ? undefined : JSON.parse(wire.snapshot),
        messages: Array.map(wire.messages, row => JSON.parse(row)),
      })),
    subscribe: enqueue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          wire.listeners.add(enqueue)
          return enqueue
        }),
        listener =>
          Effect.sync(() => {
            wire.listeners.delete(listener)
          }),
      ).pipe(Effect.asVoid),
    write: write =>
      Effect.sync(() => {
        const snapshot = JSON.stringify(write.snapshot)
        const message = JSON.stringify(write.message)
        wire.snapshot = snapshot
        wire.messages.push(message)
        setTimeout(() => {
          Array.forEach(Array.fromIterable(wire.listeners), listener => {
            listener({ _tag: 'Snapshot', row: JSON.parse(snapshot) })
            listener({ _tag: 'Message', row: JSON.parse(message) })
          })
        }, deliveryDelayMs)
        return { link: 'delivered' }
      }),
  })

const engines: ReadonlyArray<
  Readonly<{ name: string; make: () => EngineFor }>
> = [
  {
    name: 'Memory',
    make: () => {
      const store = Runtime.makeMemoryStore()
      return processor => Runtime.Memory({ processor, store })
    },
  },
  {
    name: 'a second engine that keeps rows as text and delivers later',
    make: () =>
      wireEngine({ snapshot: undefined, messages: [], listeners: new Set() }),
  },
]

const startProcessor = async (
  sync: Runtime.SyncEngine,
  store: Effect.Success<ReturnType<typeof makeTestLibraryStore>>,
) => {
  const sharing = await Effect.runPromise(makeTestLinkSharing())
  const handle = Runtime.startHandle({
    program: SyncedBooks,
    sync,
    resources: Layer.mergeAll(
      store.layer,
      Layer.succeed(AudioOutput, { sound: () => Stream.never }),
      noTranscripts,
      sharing.layer,
      noReadAloud,
      noScribeTimeline,
    ),
  })
  return { handle, bound: bindBooks(handle) }
}

const uriOf = (bound: ReturnType<typeof bindBooks>): string =>
  Option.getOrElse(
    Option.map(bound.navigation(), plan => plan.uri),
    () => 'no plan',
  )

const modeOf = (bound: ReturnType<typeof bindBooks>): string => {
  const model = bound.readModel()
  return model._tag === 'Ready' ? model.session.mode : model._tag
}

const openBoth = async (engineFor: EngineFor) => {
  const store = await Effect.runPromise(makeTestLibraryStore(sampleShelf))
  const browser = await startProcessor(engineFor('react-ad55df2e'), store)
  const terminal = await startProcessor(engineFor('cli-4f2a9c1e'), store)
  await Interaction.whenSettled(browser.bound, 2_000)
  await Interaction.whenSettled(terminal.bound, 2_000)
  await eventually(() =>
    Array.every([browser, terminal], ({ handle }) => {
      const model = handle.readModel()
      return model._tag === 'Ready' && model.library._tag === 'ShelfReady'
    }),
  )
  return { browser, terminal }
}

const settleMs = 60

describe.each(engines)(
  'navigation between a browser and a terminal on $name',
  ({ make }) => {
    it('moves the terminal when the browser moves, and the browser when the terminal moves, while the session mirrors', async () => {
      const { browser, terminal } = await openBoth(make())
      browser.bound.press('MirrorNavigation')
      await eventually(() => modeOf(terminal.bound) === 'Mirror')
      browser.bound.press('Open:the-lantern-keeper')
      await eventually(
        () => uriOf(terminal.bound) === '/books/the-lantern-keeper',
      )
      terminal.bound.press('GoBack')
      await eventually(() => uriOf(browser.bound) === '/books')
      terminal.bound.press('Open:small-hours')
      await eventually(() => uriOf(browser.bound) === '/books/small-hours')
      await browser.handle.stop()
      await terminal.handle.stop()
    })

    it('leaves each on its own screen once the session keeps navigation local', async () => {
      const { browser, terminal } = await openBoth(make())
      browser.bound.press('MirrorNavigation')
      await eventually(() => modeOf(terminal.bound) === 'Mirror')
      terminal.bound.press('KeepNavigationLocal')
      await eventually(() => modeOf(browser.bound) === 'SharedDomain')
      browser.bound.press('Open:the-lantern-keeper')
      await eventually(
        () => uriOf(browser.bound) === '/books/the-lantern-keeper',
      )
      await new Promise(resolve => setTimeout(resolve, settleMs))
      expect(uriOf(terminal.bound)).toBe('/books')
      await browser.handle.stop()
      await terminal.handle.stop()
    })
  },
)
