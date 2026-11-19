import { Array, Effect, Option, Redacted, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import { Milliseconds } from '../ids.js'
import {
  AdvancedAudibleImport,
  ConnectAudible,
  ConnectedAudible,
  DeselectAudibleTitles,
  FailedConnectAudible,
  FailedImportAudibleTitles,
  FailedQueueAudiobookAudio,
  FailedReadAudibleLibrary,
  FailedReadAudiobookAudio,
  GetAudiobookAudio,
  ImportAudibleTitles,
  ImportedAudibleTitles,
  QueuedAudiobookAudio,
  ReceivedAudibleLibrary,
  ReceivedAudiobookAudio,
  SelectAllAudibleTitles,
  StartedAudibleSignIn,
  ToggleAudibleTitle,
} from './message.js'
import {
  type AudibleModel,
  AudioRead,
  AudioUnreadable,
  SignInReady,
  SignInWaiting,
  TitlesImporting,
  TitlesRead,
  TitlesUnread,
  init,
} from './model.js'
import {
  AddressMismatch,
  AmazonRefused,
  LoginExpired,
  NotConnected,
  SignInExpired,
  Unavailable,
} from './problem.js'
import { AudibleImport, AudibleImportError } from './service.js'
import {
  Asin,
  type AudibleTitle,
  AudioDone,
  AudioQueued,
  type AudioStatus,
  type ImportSummary,
} from './title.js'
import { FinishAudibleSignIn, QueueAudiobookAudio, update } from './update.js'

const titleOf = (
  asin: string,
  name: string,
  match: AudibleTitle['match'],
): AudibleTitle => ({
  asin: Asin.make(asin),
  name,
  maybeSubtitle: Option.none(),
  authors: ['Mara Linden'],
  narrators: ['Ezra Vale'],
  series: [],
  maybeCoverUrl: Option.none(),
  maybeRuntimeMs: Option.some(Milliseconds.make(36_000_000)),
  match,
  marks: [],
})

const orchard = titleOf('B0FAKE0001', 'The Quiet Orchard', 'New')
const tinComet = titleOf('B0MADEUP01', 'A Tin Comet', 'InLibrary')
const rivers = titleOf('B0FAKE0003', 'A Map of Small Rivers', 'New')

const loginUrl = 'https://www.amazon.com/ap/signin?openid.mode=checkid_setup'

const landing =
  'https://www.amazon.com/ap/maplanding?openid.mode=id_res&openid.oa2.authorization_code=ANfakeCode'

const ready: AudibleModel = {
  ...init(),
  signIn: SignInReady({ loginUrl, maybeProblem: Option.none() }),
}

const applied = (
  model: AudibleModel,
  ...messages: ReadonlyArray<Parameters<typeof update>[1]>
): AudibleModel =>
  Array.reduce(
    messages,
    model,
    (current, message) => update(current, message)[0],
  )

const read = applied(
  init(),
  ReceivedAudibleLibrary({
    titles: [orchard, tinComet, rivers],
    skipped: [{ kind: 'Podcast', count: 4 }],
  }),
)

const summary: ImportSummary = {
  added: 2,
  matched: 0,
  notAdded: [],
  marked: [{ mark: 'Free', count: 1 }],
  leftOut: ['Publisher'],
}

const selectedOf = (model: AudibleModel): ReadonlyArray<string> =>
  model.titles._tag === 'TitlesRead' || model.titles._tag === 'TitlesImporting'
    ? model.titles.selected
    : []

describe('the Audible sign-in', () => {
  it('keeps the link and says why when the pasted text is not the landing address', () => {
    const [model, commands] = update(
      ready,
      ConnectAudible({ address: Redacted.make('https://www.amazon.com/') }),
    )
    expect(model.signIn).toEqual(
      SignInReady({ loginUrl, maybeProblem: Option.some(AddressMismatch()) }),
    )
    expect(commands).toEqual([])
  })

  it('finishes the sign-in with the landing address, which stays hidden', () => {
    const [model, commands] = update(
      ready,
      ConnectAudible({ address: Redacted.make(landing) }),
    )
    expect(model.signIn._tag).toBe('SignInConnecting')
    expect(Array.map(commands, command => command.name)).toEqual([
      'FinishAudibleSignIn',
    ])
    expect(JSON.stringify(commands)).not.toContain('ANfakeCode')
  })

  it('ignores an address while no sign-in is open', () => {
    const [model, commands] = update(
      init(),
      ConnectAudible({ address: Redacted.make(landing) }),
    )
    expect(model).toEqual(init())
    expect(commands).toEqual([])
  })

  it('starts a new sign-in after one expired or Amazon refused it, and keeps the link for a server problem', () => {
    expect(
      applied(ready, FailedConnectAudible({ problem: SignInExpired() })).signIn,
    ).toEqual(SignInWaiting({ maybeProblem: Option.some(SignInExpired()) }))
    const refused = AmazonRefused({ reason: 'it did not accept the sign-in' })
    expect(
      applied(ready, FailedConnectAudible({ problem: refused })).signIn,
    ).toEqual(SignInWaiting({ maybeProblem: Option.some(refused) }))
    const keychain = Unavailable({
      reason: 'the Keychain did not give Books its key',
    })
    expect(
      applied(ready, FailedConnectAudible({ problem: keychain })).signIn,
    ).toEqual(SignInReady({ loginUrl, maybeProblem: Option.some(keychain) }))
  })

  it('shows a new sign-in with the problem that ended the last one', () => {
    const waiting: AudibleModel = {
      ...init(),
      signIn: SignInWaiting({ maybeProblem: Option.some(SignInExpired()) }),
    }
    expect(applied(waiting, StartedAudibleSignIn({ loginUrl })).signIn).toEqual(
      SignInReady({ loginUrl, maybeProblem: Option.some(SignInExpired()) }),
    )
  })

  it('asks Books for the titles once connected, read afresh', () => {
    const [model, commands, maybeOutMessage] = update(
      { ...ready, titles: read.titles },
      ConnectedAudible(),
    )
    expect(model.titles).toEqual(TitlesUnread())
    expect(commands).toEqual([])
    expect(Option.map(maybeOutMessage, out => out._tag)).toEqual(
      Option.some('Connected'),
    )
  })
})

describe('FinishAudibleSignIn', () => {
  const finishedWith = (
    finishSignIn: (
      address: Redacted.Redacted<string>,
    ) => Effect.Effect<void, AudibleImportError>,
  ) =>
    Effect.runPromise(
      Effect.provideService(
        FinishAudibleSignIn({ address: Redacted.make(landing) }).effect,
        AudibleImport,
        {
          startSignIn: Effect.succeed({ loginUrl }),
          finishSignIn,
          readLibrary: Effect.succeed({ titles: [], skipped: [] }),
          importTitles: () => Stream.empty,
          readAudio: Effect.fail(
            new AudibleImportError({
              problem: Unavailable({ reason: 'no audio here' }),
            }),
          ),
          queueAudio: () =>
            Effect.fail(
              new AudibleImportError({
                problem: Unavailable({ reason: 'no audio here' }),
              }),
            ),
        },
      ),
    )

  it('reports a connection, and sends the address only to the import', async () => {
    const sent: Array<string> = []
    const message = await finishedWith(address => {
      sent.push(Redacted.value(address))
      return Effect.void
    })
    expect(message).toEqual(ConnectedAudible())
    expect(sent).toEqual([landing])
  })

  it('turns a refusal into a fact with its problem', async () => {
    const message = await finishedWith(() =>
      Effect.fail(new AudibleImportError({ problem: AddressMismatch() })),
    )
    expect(message).toEqual(
      FailedConnectAudible({ problem: AddressMismatch() }),
    )
  })
})

describe('the Audible titles', () => {
  it('selects the new titles and leaves the ones in the library unchecked', () => {
    expect(selectedOf(read)).toEqual(['B0FAKE0001', 'B0FAKE0003'])
    expect(read.titles).toEqual(
      expect.objectContaining({ skipped: [{ kind: 'Podcast', count: 4 }] }),
    )
  })

  it('toggles a title in list order, and selects all or none', () => {
    const cleared = applied(
      read,
      ToggleAudibleTitle({ asin: Asin.make('B0FAKE0001') }),
    )
    expect(selectedOf(cleared)).toEqual(['B0FAKE0003'])
    expect(
      selectedOf(
        applied(cleared, ToggleAudibleTitle({ asin: Asin.make('B0FAKE0001') })),
      ),
    ).toEqual(['B0FAKE0001', 'B0FAKE0003'])
    expect(selectedOf(applied(read, SelectAllAudibleTitles()))).toEqual([
      'B0FAKE0001',
      'B0MADEUP01',
      'B0FAKE0003',
    ])
    expect(selectedOf(applied(read, DeselectAudibleTitles()))).toEqual([])
  })

  it('imports only with something selected, reading chapters first', () => {
    expect(
      applied(read, DeselectAudibleTitles(), ImportAudibleTitles()).titles._tag,
    ).toBe('TitlesRead')
    const importing = applied(read, ImportAudibleTitles())
    expect(importing.titles).toEqual(
      TitlesImporting({
        titles: [orchard, tinComet, rivers],
        skipped: [{ kind: 'Podcast', count: 4 }],
        selected: [Asin.make('B0FAKE0001'), Asin.make('B0FAKE0003')],
        progress: { stage: 'ReadingChapters', done: 0, total: 2 },
      }),
    )
  })

  it('follows the import to its summary and keeps what the importer skipped', () => {
    const imported = applied(
      read,
      ImportAudibleTitles(),
      AdvancedAudibleImport({
        progress: { stage: 'AddingBooks', done: 3, total: 8 },
      }),
      ImportedAudibleTitles({ summary }),
    )
    expect(imported.titles).toEqual(
      expect.objectContaining({
        _tag: 'TitlesImported',
        summary,
        skipped: [{ kind: 'Podcast', count: 4 }],
      }),
    )
  })

  it('stops an import with a problem on the list, or on a login that stopped working', () => {
    const importing = applied(read, ImportAudibleTitles())
    const refused = AmazonRefused({ reason: 'it did not send the chapters' })
    expect(
      applied(importing, FailedImportAudibleTitles({ problem: refused }))
        .titles,
    ).toEqual(
      TitlesRead({
        titles: [orchard, tinComet, rivers],
        skipped: [{ kind: 'Podcast', count: 4 }],
        selected: [Asin.make('B0FAKE0001'), Asin.make('B0FAKE0003')],
        maybeProblem: Option.some(refused),
      }),
    )
    expect(
      applied(importing, FailedImportAudibleTitles({ problem: LoginExpired() }))
        .titles,
    ).toEqual(expect.objectContaining({ _tag: 'TitlesUnreadable' }))
  })

  it('asks for the sign-in when no login is saved', () => {
    const [model, , maybeOutMessage] = update(
      init(),
      FailedReadAudibleLibrary({ problem: NotConnected() }),
    )
    expect(model.titles).toEqual(TitlesUnread())
    expect(Option.map(maybeOutMessage, out => out._tag)).toEqual(
      Option.some('NeededSignIn'),
    )
  })
})

describe("an owned book's audio", () => {
  const firstBook = Asin.make('B0FAKE0007')
  const secondBook = Asin.make('B0FAKE0008')
  const status: AudioStatus = {
    titles: [
      { asin: firstBook, name: 'The Quiet Orchard', state: AudioDone() },
      {
        asin: secondBook,
        name: 'A Map of Small Rivers',
        state: AudioQueued({ position: 2 }),
      },
    ],
    next: secondBook,
    running: null,
  }
  const withAudio = applied(init(), ReceivedAudiobookAudio({ status }))

  it('shows every owned title as the queue last said, read again and again', () => {
    expect(withAudio.audio).toEqual(
      AudioRead({
        status,
        maybeAsking: Option.none(),
        maybeProblem: Option.none(),
      }),
    )
    const later: AudioStatus = { ...status, running: secondBook }
    expect(
      applied(withAudio, ReceivedAudiobookAudio({ status: later })).audio,
    ).toEqual(
      AudioRead({
        status: later,
        maybeAsking: Option.none(),
        maybeProblem: Option.none(),
      }),
    )
  })

  it('asks the queue for a book now, once, and shows the answer', () => {
    const [asking, commands] = update(
      withAudio,
      GetAudiobookAudio({ asin: secondBook }),
    )
    expect(asking.audio).toEqual(
      AudioRead({
        status,
        maybeAsking: Option.some(secondBook),
        maybeProblem: Option.none(),
      }),
    )
    expect(commands.map(command => command.name)).toEqual([
      QueueAudiobookAudio.name,
    ])
    const [again, none] = update(
      asking,
      GetAudiobookAudio({ asin: secondBook }),
    )
    expect(again).toBe(asking)
    expect(none).toEqual([])
    const first: AudioStatus = {
      ...status,
      titles: [
        status.titles[0]!,
        { ...status.titles[1]!, state: AudioQueued({ position: 1 }) },
      ],
    }
    expect(
      applied(asking, QueuedAudiobookAudio({ status: first })).audio,
    ).toEqual(
      AudioRead({
        status: first,
        maybeAsking: Option.none(),
        maybeProblem: Option.none(),
      }),
    )
  })

  it('does not ask for a book that already has its audio', () => {
    const [model, commands] = update(
      withAudio,
      GetAudiobookAudio({ asin: firstBook }),
    )
    expect(model).toBe(withAudio)
    expect(commands).toEqual([])
  })

  it('keeps the list and says why when the queue did not take the book', () => {
    const asking = update(withAudio, GetAudiobookAudio({ asin: secondBook }))[0]
    const problem = Unavailable({
      reason: 'the audio queue is not set up on this computer',
    })
    expect(
      applied(asking, FailedQueueAudiobookAudio({ problem })).audio,
    ).toEqual(
      AudioRead({
        status,
        maybeAsking: Option.none(),
        maybeProblem: Option.some(problem),
      }),
    )
  })

  it('says why the audio could not be read', () => {
    const problem = Unavailable({
      reason: 'the audio queue is not set up on this computer',
    })
    expect(
      applied(init(), FailedReadAudiobookAudio({ problem })).audio,
    ).toEqual(AudioUnreadable({ problem }))
  })

  it('asks the queue through the import service and reports its answer', async () => {
    const asked: Array<string> = []
    const message = await Effect.runPromise(
      Effect.provideService(
        QueueAudiobookAudio({ asin: secondBook }).effect,
        AudibleImport,
        {
          startSignIn: Effect.succeed({ loginUrl }),
          finishSignIn: () => Effect.void,
          readLibrary: Effect.succeed({ titles: [], skipped: [] }),
          importTitles: () => Stream.empty,
          readAudio: Effect.succeed(status),
          queueAudio: asin => {
            asked.push(asin)
            return Effect.succeed(status)
          },
        },
      ),
    )
    expect(asked).toEqual([secondBook])
    expect(message).toEqual(QueuedAudiobookAudio({ status }))
  })
})
