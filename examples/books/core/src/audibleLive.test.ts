import { Effect, Layer, Option, Redacted, Stream } from 'effect'
import { Interaction, Runtime } from 'foldkit'
import { AudioOutput, noTranscripts } from 'transcript-player-core-example'
import { afterEach, describe, expect, it } from 'vitest'

import * as Audible from './audible/index.js'
import { Milliseconds } from './ids.js'
import { makeTestLibraryStore, noReadAloud, sampleShelf } from './sample.js'
import { makeTestLinkSharing } from './share.js'
import { SyncedBooks, bindBooks } from './synced.js'

const pollMs = 10
const pollAttempts = 300

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

const signInCode = 'ANmadeUpSignInCode'

const landing = `https://www.amazon.com/ap/maplanding?openid.mode=id_res&openid.oa2.authorization_code=${signInCode}`

const orchard: Audible.AudibleTitle = {
  asin: Audible.Asin.make('B0FAKE0001'),
  name: 'The Quiet Orchard',
  maybeSubtitle: Option.none(),
  authors: ['Mara Linden'],
  narrators: ['Ezra Vale'],
  series: [],
  maybeCoverUrl: Option.none(),
  maybeRuntimeMs: Option.some(Milliseconds.make(33_120_000)),
  match: 'New',
  marks: [],
}

const makeFakeAudible = () => {
  const finished: Array<string> = []
  const state = { isConnected: false }
  const audible: Audible.AudibleImportShape = {
    startSignIn: Effect.succeed({
      loginUrl: 'https://www.amazon.com/ap/signin?openid.mode=checkid_setup',
    }),
    finishSignIn: address =>
      Effect.sync(() => {
        finished.push(Redacted.value(address))
        state.isConnected = true
      }),
    readLibrary: Effect.suspend(() =>
      state.isConnected
        ? Effect.succeed({
            titles: [orchard],
            skipped: [{ kind: 'Podcast', count: 2 }],
          })
        : Effect.fail(
            new Audible.AudibleImportError({ problem: Audible.NotConnected() }),
          ),
    ),
    importTitles: asins =>
      Stream.make(
        Audible.ImportAdvanced({
          progress: { stage: 'ReadingChapters', done: 0, total: asins.length },
        }),
        Audible.ImportFinished({
          summary: {
            added: asins.length,
            matched: 0,
            notAdded: [],
            marked: [],
            leftOut: [],
          },
        }),
      ),
  }
  return { finished, layer: Layer.succeed(Audible.AudibleImport, audible) }
}

const stops: Array<() => Promise<void>> = []

afterEach(async () => {
  await Promise.all(stops.splice(0).map(stop => stop()))
})

const startProcessor = async (
  processor: string,
  memory: ReturnType<typeof Runtime.makeMemoryStore>,
  audible: Layer.Layer<never>,
) => {
  const store = await Effect.runPromise(makeTestLibraryStore(sampleShelf))
  const sharing = await Effect.runPromise(makeTestLinkSharing())
  const handle = Runtime.startHandle({
    program: SyncedBooks,
    sync: Runtime.Memory({ processor, store: memory }),
    resources: Layer.mergeAll(
      store.layer,
      Layer.succeed(AudioOutput, { sound: () => Stream.never }),
      noTranscripts,
      sharing.layer,
      noReadAloud,
      audible,
    ),
  })
  stops.push(() => handle.stop())
  const bound = bindBooks(handle)
  await Interaction.whenSettled(bound, 2_000)
  await eventually(() => {
    const model = handle.readModel()
    return model._tag === 'Ready' && model.library._tag === 'ShelfReady'
  })
  return { handle, bound }
}

const uriOf = (bound: ReturnType<typeof bindBooks>): string =>
  Option.getOrElse(
    Option.map(bound.navigation(), plan => plan.uri),
    () => 'no plan',
  )

const audibleOf = (
  handle: Awaited<ReturnType<typeof startProcessor>>['handle'],
): Option.Option<Audible.AudibleModel> => {
  const model = handle.readModel()
  return model._tag === 'Ready' ? Option.some(model.audible) : Option.none()
}

describe('live Books with the Audible import', () => {
  it('connects, reads, and imports on one device, and the shared log never holds the import or its address', async () => {
    const memory = Runtime.makeMemoryStore()
    const fake = makeFakeAudible()
    const browser = await startProcessor('react-ad55df2e', memory, fake.layer)
    const terminal = await startProcessor(
      'cli-4f2a9c1e',
      memory,
      makeFakeAudible().layer,
    )
    browser.bound.press('ImportFromAudible')
    await eventually(
      () =>
        uriOf(browser.bound) === '/books/audible/connect' &&
        Option.exists(
          audibleOf(browser.handle),
          audible => audible.signIn._tag === 'SignInReady',
        ),
    )
    browser.bound.press(`ConnectAudible:${landing}`)
    await eventually(
      () =>
        uriOf(browser.bound) === '/books/audible' &&
        Option.exists(
          audibleOf(browser.handle),
          audible => audible.titles._tag === 'TitlesRead',
        ),
    )
    browser.bound.press('ImportAudibleTitles')
    await eventually(() =>
      Option.exists(
        audibleOf(browser.handle),
        audible => audible.titles._tag === 'TitlesImported',
      ),
    )
    expect(fake.finished).toEqual([landing])
    const logged = JSON.stringify(memory.messages)
    expect(logged).toContain('ImportFromAudible')
    for (const hidden of [
      'ConnectAudible',
      'ConnectedAudible',
      'StartedAudibleSignIn',
      'ReceivedAudibleLibrary',
      'ImportAudibleTitles',
      'ImportedAudibleTitles',
      signInCode,
    ]) {
      expect(logged).not.toContain(hidden)
    }
    expect(audibleOf(terminal.handle)).toEqual(Option.some(Audible.init()))
  })
})
