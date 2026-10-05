import {
  type BoundBooks,
  ChapterNumber,
  InProgress,
  LibraryStore,
  MediaId,
  Milliseconds,
  type Shelf,
  SyncedBooks,
  TitleSlug,
  bindBooks,
  makeTestLibraryStore,
  makeTestLinkSharing,
  noReadAloud,
  sampleShelf,
  whenLibraryOpened,
} from 'books-core-example'
import { Array, Duration, Effect, Fiber, Layer, Option, Stream } from 'effect'
import { Interaction, Processor, Runtime, Telemetry } from 'foldkit'
import {
  cliDaemonSocketPath,
  isCliDaemonListening,
  listenCliDaemon,
  runProgramCommand,
} from 'foldkit/cli'
import { askCliView } from 'foldkit/cli/view'
import {
  AudioEvent,
  AudioOutput,
  WordId,
  noTranscripts,
  transcriptsInMemory,
} from 'transcript-player-core-example'
import { afterEach, describe, expect, it } from 'vitest'

import {
  type BooksPlayer,
  makeBooksPlayer,
  trackLibraryWrites,
} from './player.js'

const started: Array<{ stop: () => Promise<void> }> = []

afterEach(async () => {
  await Promise.all(started.splice(0).map(handle => handle.stop()))
})

const silentAudio = Layer.succeed(AudioOutput, { sound: () => Stream.never })

const secondMs = 1_000

const tickingAudio = (everyMs: number) =>
  Layer.succeed(AudioOutput, {
    sound: track =>
      Stream.tick(Duration.millis(everyMs)).pipe(
        Stream.drop(1),
        Stream.mapAccum(
          (): number => track.fromMs,
          (place): readonly [number, ReadonlyArray<AudioEvent>] => [
            place + secondMs,
            [
              AudioEvent.Advanced({
                placeMs: Milliseconds.make(place + secondMs),
              }),
            ],
          ],
        ),
      ),
  })

type Opened = Readonly<{
  bound: BoundBooks
  player: BooksPlayer
  writes: Effect.Effect<ReadonlyArray<unknown>>
}>

const openBooks = async (
  options: Readonly<{
    shelf?: Shelf
    audio?: Layer.Layer<AudioOutput>
    transcripts?: typeof noTranscripts
    telemetry?: Telemetry.TelemetrySinkLayer
  }> = {},
): Promise<Opened> => {
  const store = await Effect.runPromise(
    makeTestLibraryStore(options.shelf ?? sampleShelf),
  )
  const sharing = await Effect.runPromise(makeTestLinkSharing())
  const tracked = trackLibraryWrites()
  const handle = Runtime.startHandle({
    program: SyncedBooks,
    sync: Runtime.Memory({ processor: 'cli-test' }),
    resources: Layer.mergeAll(
      Layer.effect(LibraryStore, Effect.map(LibraryStore, tracked.wrap)).pipe(
        Layer.provide(store.layer),
      ),
      options.audio ?? silentAudio,
      options.transcripts ?? noTranscripts,
      sharing.layer,
      noReadAloud,
    ),
    host: Processor.Host.Cli(),
  })
  started.push(handle)
  const reporting = Option.match(Option.fromNullishOr(options.telemetry), {
    onNone: () => ({}),
    onSome: sink => ({
      onPainted: Telemetry.attach(handle, { app: 'books', sink })
        .recordRendered,
    }),
  })
  const bound = bindBooks(handle)
  await Interaction.whenSettled(bound, 2_000)
  await whenLibraryOpened(handle, 2_000)
  return {
    bound,
    player: makeBooksPlayer(bound, tracked, reporting),
    writes: store.writes,
  }
}

const doOf = (player: BooksPlayer) =>
  Option.getOrThrow(Option.fromNullishOr(player.surface.do))

const run = (player: BooksPlayer, token: string, flags = {}) =>
  Effect.runPromise(doOf(player)(token, flags, Processor.Host.Cli()))

const eventually = async (
  isDone: () => boolean | Promise<boolean>,
): Promise<void> => {
  const startedAt = Date.now()
  while (!(await isDone())) {
    if (Date.now() - startedAt > 4_000) {
      throw new Error('never happened')
    }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

const isSounding = (bound: BoundBooks): boolean => {
  const model = bound.readModel()
  return (
    model._tag === 'Ready' &&
    model.listening._tag === 'Loaded' &&
    model.listening.player.transport._tag === 'Playing'
  )
}

const placeOf = (bound: BoundBooks): number => {
  const model = bound.readModel()
  return model._tag === 'Ready' && model.listening._tag === 'Loaded'
    ? model.listening.player.placeMs
    : 0
}

const minuteMs = 60_000

const chapterCount = 114

const longTitleSlug = TitleSlug.make('a-new-earth')

const longShelf: Shelf = {
  ...sampleShelf,
  titles: [
    {
      slug: longTitleSlug,
      mediaId: MediaId.make('a-new-earth'),
      name: 'A New Earth',
      authors: ['A Made-Up Author'],
      narrators: ['A Made-Up Reader'],
      durationMs: Milliseconds.make(chapterCount * 5 * minuteMs),
      chapters: Array.map(Array.range(1, chapterCount), number => ({
        chapterNumber: ChapterNumber.make(number),
        name: `Chapter ${number.toString()}`,
        startMs: Milliseconds.make((number - 1) * 5 * minuteMs),
        endMs: Milliseconds.make(number * 5 * minuteMs),
      })),
      maybeCoverUrl: Option.none(),
      maybeAudioUrl: Option.some('https://audio.invalid/a-new-earth.mp3'),
    },
    ...sampleShelf.titles,
  ],
}

const hourMs = 60 * minuteMs

const resumedDurationMs = 9 * hourMs + 13 * minuteMs + secondMs

const resumedPlaceMs = hourMs + 42 * minuteMs + 15 * secondMs

const resumedShelf: Shelf = {
  titles: [
    {
      slug: longTitleSlug,
      mediaId: MediaId.make('a-new-earth'),
      name: 'A New Earth',
      authors: ['A Made-Up Author'],
      narrators: ['A Made-Up Reader'],
      durationMs: Milliseconds.make(resumedDurationMs),
      chapters: [
        {
          chapterNumber: ChapterNumber.make(1),
          name: 'Chapter 1: A made-up part',
          startMs: Milliseconds.make(0),
          endMs: Milliseconds.make(hourMs),
        },
        {
          chapterNumber: ChapterNumber.make(2),
          name: 'Chapter 2: A long made-up part about waiting for the bus',
          startMs: Milliseconds.make(hourMs),
          endMs: Milliseconds.make(resumedDurationMs),
        },
      ],
      maybeCoverUrl: Option.none(),
      maybeAudioUrl: Option.some('https://audio.invalid/a-new-earth.mp3'),
    },
  ],
  progress: [
    InProgress({
      slug: longTitleSlug,
      placeMs: Milliseconds.make(resumedPlaceMs),
      savedAtMs: 0,
    }),
  ],
  bookmarks: [],
}

const longTranscript = transcriptsInMemory(
  new Map([
    [
      MediaId.make('a-new-earth'),
      Array.map(Array.range(0, 7), index => ({
        passageId: `p${index.toString()}`,
        startMs: Milliseconds.make(index * 10 * minuteMs),
        endMs: Milliseconds.make((index + 1) * 10 * minuteMs),
        words: Array.map(Array.range(0, 1499), word => ({
          wordId: WordId.make(`w${index.toString()}-${word.toString()}`),
          text: word % 7 === 0 ? 'presence.' : 'the',
          startMs: Milliseconds.make(index * 10 * minuteMs + word * 400),
          endMs: Milliseconds.make(index * 10 * minuteMs + word * 400 + 300),
        })),
      })),
    ],
  ]),
)

describe('books CLI', () => {
  it('lists the library and every Action with its command for books actions', async () => {
    const { bound, player } = await openBooks()
    const painted = await run(player, 'actions')
    expect(painted.stdout).toMatch(/The Lantern Keeper/)
    expect(painted.stdout).toMatch(/^ {2}listen <slug> +Plays the title/m)
    expect(painted.stdout).toMatch(/^ {2}seek-to <place-ms> +Moves to a place/m)
    expect(runProgramCommand(bound, 'books', [], {}).stdout).toMatch(
      /^ {2}listen <slug>/m,
    )
  })

  it('says what is playing in a few lines, then the commands to copy now', async () => {
    const { player } = await openBooks()
    const idle = await run(player, 'help')
    expect(idle.stdout.split('\n')).toEqual([
      'Nothing is playing.',
      '',
      '  books listen the-lantern-keeper',
      '  books listen small-hours',
      '  books listen a-field-guide-to-weather',
      '  books tui      Opens the live player here',
      '  books actions  Lists every command',
      '  books login    Signs in to Cloudflare Access',
    ])
  })

  it('prints a line wider than the terminal whole, for the terminal to wrap', async () => {
    const { player } = await openBooks({ shelf: resumedShelf })
    const idle = await run(player, 'help')
    expect(idle.stdout.split('\n')).toContain(
      'Continue A New Earth: Chapter 2: A long made-up part about waiting for the bus · 1:42:15 of 9:13:01 · 7h 31m left',
    )
  })

  it('plays a title from a command and the next command acts on that playback', async () => {
    const { player } = await openBooks()
    const listened = await run(player, 'listen the-lantern-keeper')
    expect(listened.exitCode).toBe(0)
    expect(listened.stdout).toMatch(/^▶ Playing The Lantern Keeper$/m)
    expect(listened.stdout).toMatch(/^ {2}books pause +Pauses where it is$/m)
    expect(listened.stdout).toMatch(/^ {2}books stop +Stops and saves/m)
    const sought = await run(player, 'seek-to 1h00m00s')
    expect(sought.stdout).toMatch(/The Keeper · 1:00:00 of 1:20:00 · 20m left/)
    const paused = await run(player, 'pause')
    expect(paused.stdout).toMatch(/^❚❚ Paused The Lantern Keeper$/m)
    expect(paused.stdout).toMatch(/^ {2}books play +Plays from the place$/m)
    const refused = await run(player, 'pause')
    expect(refused.exitCode).toBe(1)
    expect(refused.stderr).toBe('pause is disabled: nothing is playing.')
  })

  it('stops by pausing, saving the place, and ending the player', async () => {
    const { bound, player, writes } = await openBooks()
    await run(player, 'listen small-hours')
    await run(player, 'seek-to 30m00s')
    const stopping = Effect.runFork(player.stopped)
    const stopped = await run(player, 'stop')
    expect(stopped.stdout).toBe(
      'Stopped Small Hours at 30:00. Your place is saved.',
    )
    await Effect.runPromise(Fiber.join(stopping))
    expect(await Effect.runPromise(writes)).toEqual([
      { _tag: 'SavePlace', slug: 'small-hours', placeMs: 1_800_000 },
    ])
    expect(placeOf(bound)).toBe(1_800_000)
  })
})

describe('the Books player daemon', () => {
  it('starts on a socket, forwards each command to one player, and stops on books stop', async () => {
    const { player } = await openBooks()
    const socketPath = cliDaemonSocketPath({
      programId: 'books-cli-test',
      isolationKey: Date.now().toString(36),
    })
    const serving = Effect.runFork(
      listenCliDaemon({
        socketPath,
        Model: SyncedBooks.Model,
        Message: SyncedBooks.Message,
        surface: player.surface,
        until: player.stopped,
      }),
    )
    await eventually(() => Effect.runPromise(isCliDaemonListening(socketPath)))
    const listened = await askCliView(socketPath, {
      _tag: 'Do',
      token: 'listen the-lantern-keeper',
    })
    expect(listened.stdout).toMatch(/^▶ Playing The Lantern Keeper$/m)
    const paused = await askCliView(socketPath, { _tag: 'Do', token: 'pause' })
    expect(paused.stdout).toMatch(/^❚❚ Paused The Lantern Keeper$/m)
    const brief = await askCliView(socketPath, { _tag: 'Show' })
    expect(brief.stdout).toMatch(/^❚❚ Paused The Lantern Keeper$/m)
    const stopped = await askCliView(socketPath, { _tag: 'Do', token: 'stop' })
    expect(stopped.stdout).toBe(
      'Stopped The Lantern Keeper at 0:00. Your place is saved.',
    )
    await Effect.runPromise(Fiber.join(serving))
    expect(await Effect.runPromise(isCliDaemonListening(socketPath))).toBe(
      false,
    )
  })

  it('keeps its terminal UI answering keys within 250 ms while a long title plays', async () => {
    const { bound, player } = await openBooks({
      shelf: longShelf,
      audio: tickingAudio(20),
      transcripts: longTranscript,
    })
    await run(player, 'listen a-new-earth')
    await eventually(() => placeOf(bound) > 5_000)
    const tui = { view: 'tui', rows: '30', columns: '100' }
    const keys = [
      { name: 'c', sequence: 'c' },
      ...Array.makeBy(40, () => ({ name: 'down', sequence: '\u001b[B' })),
      { name: 'escape', sequence: '\u001b', meta: '1' },
      { name: 'e', sequence: 'e' },
      { name: 'down', sequence: '\u001b[B' },
      { name: 'p', sequence: 'p' },
    ]
    const latencies = await Effect.runPromise(
      Effect.forEach(keys, key =>
        Effect.gen(function* () {
          const startedAt = performance.now()
          const painted = yield* doOf(player)(
            'key',
            { ...tui, ...key },
            Processor.Host.Tui(),
          )
          return {
            ms: performance.now() - startedAt,
            lines: painted.stdout.split('\n').length,
          }
        }),
      ),
    )
    const worst = Math.max(...Array.map(latencies, ({ ms }) => ms))
    expect(worst).toBeLessThan(250)
    expect(Array.every(latencies, ({ lines }) => lines === 30)).toBe(true)
    expect(isSounding(bound)).toBe(false)
    const frame = await Effect.runPromise(
      Option.getOrThrow(Option.fromNullishOr(player.surface.show))(
        tui,
        Processor.Host.Tui(),
      ),
    )
    expect(frame.stdout.split('\n')).toHaveLength(30)
  })

  it('records each TUI key it answers, the Message it took, and each frame, in telemetry', async () => {
    const memory = Telemetry.makeMemorySink()
    const { bound, player } = await openBooks({
      shelf: longShelf,
      audio: tickingAudio(20),
      transcripts: longTranscript,
      telemetry: memory.layer,
    })
    await run(player, 'listen a-new-earth')
    await eventually(() => placeOf(bound) > 5_000)
    const recordedBefore = memory.events().length
    const tui = { view: 'tui', rows: '30', columns: '100', viewId: 'telemetry' }
    const keys = [
      { name: 'c', sequence: 'c' },
      ...Array.makeBy(5, () => ({ name: 'down', sequence: '\u001b[B' })),
      { name: 'escape', sequence: '\u001b', meta: '1' },
      { name: 'p', sequence: 'p' },
    ]
    await Effect.runPromise(
      Effect.forEach(keys, key =>
        doOf(player)('key', { ...tui, ...key }, Processor.Host.Tui()),
      ),
    )
    await eventually(() => !isSounding(bound))
    const recorded = Array.drop(memory.events(), recordedBefore)
    const pressed = Array.filter(
      recorded,
      (event): event is Telemetry.Transition =>
        event._tag === 'Transition' && event.source._tag === 'Host',
    )
    expect(Array.map(pressed, ({ message }) => message)).toEqual([
      'ShowContents',
      'GoBack',
      'Pause',
    ])
    expect(
      Array.every(
        pressed,
        ({ updateDurationMs }) => updateDurationMs !== undefined,
      ),
    ).toBe(true)
    const keyPaints = Array.filter(
      recorded,
      event =>
        event._tag === 'Rendered' &&
        event.painter === 'Terminal' &&
        event.phase === 'key',
    )
    expect(keyPaints).toHaveLength(keys.length)
  })
})
