import {
  type BoundBooks,
  ChapterNumber,
  type ChaptersBySlug,
  InProgress,
  LibraryStore,
  MediaId,
  Milliseconds,
  type Shelf,
  SyncedBooks,
  TitleSlug,
  bindBooks,
  chaptersOf,
  makeTestLibraryStore,
  makeTestLinkSharing,
  noReadAloud,
  noScribeTimeline,
  sampleChapters,
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
                wallClockMs: Date.now(),
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
    chapters?: ChaptersBySlug
    audio?: Layer.Layer<AudioOutput>
    transcripts?: typeof noTranscripts
    telemetry?: Telemetry.TelemetrySinkLayer
  }> = {},
): Promise<Opened> => {
  const store = await Effect.runPromise(
    makeTestLibraryStore(
      options.shelf ?? sampleShelf,
      options.chapters ?? sampleChapters,
    ),
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
      noScribeTimeline,
    ),
    host: Processor.Host.Cli(),
  })
  started.push(handle)
  const reporting = Option.match(Option.fromNullishOr(options.telemetry), {
    onNone: () => ({}),
    onSome: sink => ({
      onPainted: Telemetry.attach(handle, {
        app: 'books',
        role: 'daemon',
        sink,
      }).recordRendered,
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

const longTitleSlug = TitleSlug.make('a-tin-comet')

const longShelf: Shelf = {
  ...sampleShelf,
  titles: [
    {
      slug: longTitleSlug,
      mediaId: MediaId.make('a-tin-comet'),
      name: 'A Tin Comet',
      authors: ['A Made-Up Author'],
      narrators: ['A Made-Up Reader'],
      durationMs: Milliseconds.make(chapterCount * 5 * minuteMs),
      maybeCoverUrl: Option.none(),
      maybeAudioUrl: Option.some('https://audio.invalid/a-tin-comet.mp3'),
    },
    ...sampleShelf.titles,
  ],
}

const longChapters: ChaptersBySlug = {
  ...sampleChapters,
  [longTitleSlug]: Array.map(Array.range(1, chapterCount), number => ({
    chapterNumber: ChapterNumber.make(number),
    name: `Chapter ${number.toString()}`,
    startMs: Milliseconds.make((number - 1) * 5 * minuteMs),
    endMs: Milliseconds.make(number * 5 * minuteMs),
  })),
}

const hourMs = 60 * minuteMs

const resumedDurationMs = 9 * hourMs + 13 * minuteMs + secondMs

const resumedPlaceMs = hourMs + 42 * minuteMs + 15 * secondMs

const resumedShelf: Shelf = {
  titles: [
    {
      slug: longTitleSlug,
      mediaId: MediaId.make('a-tin-comet'),
      name: 'A Tin Comet',
      authors: ['A Made-Up Author'],
      narrators: ['A Made-Up Reader'],
      durationMs: Milliseconds.make(resumedDurationMs),
      maybeCoverUrl: Option.none(),
      maybeAudioUrl: Option.some('https://audio.invalid/a-tin-comet.mp3'),
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

const resumedChapters: ChaptersBySlug = {
  [longTitleSlug]: [
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
}

const longTranscript = transcriptsInMemory(
  new Map([
    [
      MediaId.make('a-tin-comet'),
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

const madeUpSentences = [
  'The keeper climbed the stairs at dusk.',
  'He trimmed the wick and waited.',
  'Far out a bell answered the lamp.',
]

const madeUpWords = Array.flatMap(madeUpSentences, (sentence, sentenceIndex) =>
  Array.map(sentence.split(' '), text => ({ text, sentenceIndex })),
)

const spokenTranscript = transcriptsInMemory(
  new Map([
    [
      MediaId.make('the-lantern-keeper'),
      [
        {
          passageId: 'p1',
          startMs: Milliseconds.make(0),
          endMs: Milliseconds.make(minuteMs),
          words: Array.map(madeUpWords, (word, index) => {
            const startMs = index * 500 + word.sentenceIndex * 2_000
            return {
              wordId: WordId.make(`w${index.toString()}`),
              text: word.text,
              startMs: Milliseconds.make(startMs),
              endMs: Milliseconds.make(startMs + 400),
            }
          }),
        },
      ],
    ],
  ]),
)

const followOf = (player: BooksPlayer) =>
  Option.getOrThrow(Option.fromNullishOr(player.surface.follow))

describe('books listen and books open take a title as a person types it', () => {
  it('plays the title named in full, in any case, and by part of its name', async () => {
    const { player, bound } = await openBooks()
    const named = await run(player, 'listen The Lantern Keeper')
    expect(named.exitCode).toBe(0)
    expect(named.stdout).toContain('Playing The Lantern Keeper')
    const part = await run(player, 'listen WEATHER guide')
    expect(part.exitCode).toBe(0)
    expect(part.stdout).toContain('Playing A Field Guide to Weather')
    expect(isSounding(bound)).toBe(true)
    await run(player, 'pause')
  })

  it('plays on when the title named is the one already in the player, paused or playing', async () => {
    const { player, bound } = await openBooks()
    await run(player, 'listen the lantern keeper')
    await run(player, 'pause')
    expect(isSounding(bound)).toBe(false)
    const again = await run(player, 'listen The Lantern Keeper')
    expect(again.exitCode).toBe(0)
    expect(again.stdout).toContain('Playing The Lantern Keeper')
    expect(isSounding(bound)).toBe(true)
    const still = await run(player, 'listen lantern')
    expect(still.exitCode).toBe(0)
    expect(still.stdout).toContain('Playing The Lantern Keeper')
    expect(isSounding(bound)).toBe(true)
    await run(player, 'pause')
  })

  it('plays a title for play and play-title too, the other names Listen answers to, while play alone plays on', async () => {
    const { player, bound } = await openBooks()
    const named = await run(player, 'play The Lantern Keeper')
    expect(named.exitCode).toBe(0)
    expect(named.stdout).toContain('Playing The Lantern Keeper')
    await run(player, 'pause')
    expect(isSounding(bound)).toBe(false)
    const on = await run(player, 'play')
    expect(on.exitCode).toBe(0)
    expect(isSounding(bound)).toBe(true)
    await run(player, 'pause')
    const again = await run(player, 'play lantern')
    expect(again.exitCode).toBe(0)
    expect(isSounding(bound)).toBe(true)
    const other = await run(player, 'play-title small hours')
    expect(other.stdout).toContain('Playing Small Hours')
    await run(player, 'pause')
  })

  it('lists the titles that match when there are several, with the command for each, and plays nothing', async () => {
    const { player, bound } = await openBooks()
    const vague = await run(player, 'listen a')
    expect(vague.exitCode).toBe(2)
    expect(vague.stdout).toBe('')
    expect(vague.stderr?.split('\n')).toEqual([
      '"a" matches 3 titles. Say more of the name, or copy one:',
      '  books play the-lantern-keeper        The Lantern Keeper',
      '  books play small-hours               Small Hours',
      '  books play a-field-guide-to-weather  A Field Guide to Weather',
    ])
    expect(isSounding(bound)).toBe(false)
  })

  it('says no title matches, with the command’s own usage and the titles it can play', async () => {
    const { player } = await openBooks()
    const none = await run(player, 'listen moby')
    expect(none.exitCode).toBe(2)
    expect(none.stdout).toBe('')
    expect(none.stderr?.split('\n')).toEqual([
      'No title matches "moby". Usage: books play <title>, such as:',
      '  books play the-lantern-keeper        The Lantern Keeper',
      '  books play small-hours               Small Hours',
      '  books play a-field-guide-to-weather  A Field Guide to Weather',
    ])
  })

  it('opens a title’s page by its name', async () => {
    const { player } = await openBooks()
    const opened = await run(player, 'open small hours')
    expect(opened.exitCode).toBe(0)
    expect(opened.stdout).toContain('Small Hours')
    expect(opened.stdout).toContain('/books/small-hours')
  })

  it('answers a command nobody declared with one sentence and nothing else', async () => {
    const { player } = await openBooks()
    const unknown = await run(player, 'lisen')
    expect(unknown.exitCode).toBe(2)
    expect(unknown.stdout).toBe('')
    expect(unknown.stderr).toBe(
      'Unknown command "lisen". Nearest: books play <title>. `books actions` lists every command.',
    )
  })
})

describe('what a player was built from', () => {
  it('is said to a command that asks, so a newer command can tell an older player', async () => {
    const { bound } = await openBooks()
    const player = makeBooksPlayer(bound, trackLibraryWrites(), {}, 'build-7')
    const said = await run(player, 'player-build')
    expect(said).toEqual({ stdout: 'build-7', exitCode: 0 })
  })
})

describe('the live player paints from the theme', () => {
  const showOf = (player: BooksPlayer) =>
    Option.getOrThrow(Option.fromNullishOr(player.surface.show))
  const tui = { view: 'tui', rows: '30', columns: '100' }
  // eslint-disable-next-line no-control-regex
  const inkPattern = /\u001b\[[0-9;]*m/g

  it('inks the word being read in the theme’s color for a view whose output takes color, and sends plain text otherwise', async () => {
    const { player } = await openBooks({ transcripts: spokenTranscript })
    await run(player, 'listen the-lantern-keeper')
    await run(player, 'seek-to 6s')
    await eventually(async () =>
      (await run(player, 'words')).stdout.includes('> 0:05'),
    )
    await run(player, 'pause')
    const plain = await Effect.runPromise(
      showOf(player)({ ...tui, viewId: 'plain' }, Processor.Host.Tui()),
    )
    const inked = await Effect.runPromise(
      showOf(player)(
        { ...tui, viewId: 'inked', color: '1' },
        Processor.Host.Tui(),
      ),
    )
    expect(plain.stdout).toMatch(/\[\S+\]/)
    expect(plain.stdout).not.toMatch(inkPattern)
    // eslint-disable-next-line no-control-regex
    expect(inked.stdout).toMatch(
      /\u001b\[38;2;\d+;\d+;\d+m\[[^\]\s]+\]\u001b\[39m/,
    )
    expect(inked.stdout.replace(inkPattern, '')).toBe(plain.stdout)
  })
})

describe('a word’s two actions, as commands', () => {
  const readingAtSixSeconds = async () => {
    const opened = await openBooks({ transcripts: spokenTranscript })
    await run(opened.player, 'listen the-lantern-keeper')
    await run(opened.player, 'seek-to 6s')
    await eventually(async () =>
      (await run(opened.player, 'words')).stdout.includes('> 0:05'),
    )
    await run(opened.player, 'pause')
    return opened
  }

  it('prints the link to the word being read, whole, so it can be pasted', async () => {
    const { player } = await readingAtSixSeconds()
    const link = await run(player, 'link')
    expect(link.exitCode).toBe(0)
    expect(link.stdout).toMatch(
      /^https:\/\/books\.pisspoursoftware\.xyz\/books\/the-lantern-keeper\/listen\/\d+(\.\d+)?s$/,
    )
  })

  it('plays from the word a link or a time names, and says so', async () => {
    const { player } = await readingAtSixSeconds()
    const link = (await run(player, 'link')).stdout
    await run(player, 'seek-to 0s')
    const played = await run(player, `play-from ${link}`)
    expect(played.exitCode).toBe(0)
    await eventually(async () =>
      (await run(player, 'words')).stdout.includes('· playing ·'),
    )
    expect((await run(player, 'words')).stdout).toContain('> 0:05')
    await run(player, 'pause')
    const byTime = await run(player, 'play-from 0:02')
    expect(byTime.exitCode).toBe(0)
    await run(player, 'pause')
  })

  it('says what to give it, and that nothing is in the player, on stderr', async () => {
    const { player } = await openBooks({ transcripts: spokenTranscript })
    const none = await run(player, 'link')
    expect(none.exitCode).toBe(1)
    expect(none.stderr).toContain('Nothing is in the player')
    await run(player, 'listen the-lantern-keeper')
    const bare = await run(player, 'play-from')
    expect(bare.exitCode).toBe(1)
    expect(bare.stderr).toContain('books play-from')
    await run(player, 'pause')
  })
})

describe('books bookmark and books bookmarks', () => {
  const readingAtSixSeconds = async () => {
    const opened = await openBooks({ transcripts: spokenTranscript })
    await run(opened.player, 'listen the-lantern-keeper')
    await run(opened.player, 'seek-to 6s')
    await eventually(async () =>
      (await run(opened.player, 'words')).stdout.includes('> 0:05'),
    )
    await run(opened.player, 'pause')
    return opened
  }

  it('marks the word being spoken, says which, and lists it with its words and its link', async () => {
    const { player } = await readingAtSixSeconds()
    const marked = await run(player, 'bookmark')
    expect(marked.exitCode).toBe(0)
    expect(marked.stdout).toMatch(
      /^Bookmarked “\S+” at 0:0\d · \/books\/the-lantern-keeper\/listen\/\S+s$/,
    )
    const listed = await run(player, 'bookmarks')
    const lines = listed.stdout.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('# The Lantern Keeper · 1 bookmark')
    expect(lines[1]).toMatch(
      /^0:0\d · The Tide · .*He trimmed the wick.* · \/books\/the-lantern-keeper\/listen\/\S+s · \S+$/,
    )
  })

  it('takes the words after it as a note', async () => {
    const { player } = await readingAtSixSeconds()
    await run(player, 'bookmark why the wick matters')
    const listed = await run(player, 'bookmarks')
    expect(listed.stdout).toContain(' · note: why the wick matters · ')
  })

  it('prints one line of JSON for --json', async () => {
    const { player } = await readingAtSixSeconds()
    await run(player, 'bookmark a note')
    const json = await run(player, 'bookmarks', { json: '1' })
    expect(json.stdout).not.toContain('\n')
    expect(JSON.parse(json.stdout)).toMatchObject({
      slug: 'the-lantern-keeper',
      title: 'The Lantern Keeper',
      bookmarks: [{ chapter: 'The Tide', note: 'a note' }],
    })
  })

  it('says the word is already bookmarked, and adds nothing', async () => {
    const { player } = await readingAtSixSeconds()
    await run(player, 'bookmark')
    const again = await run(player, 'bookmark')
    expect(again.stdout).toBe('That word is already bookmarked')
    expect((await run(player, 'bookmarks')).stdout.split('\n')).toHaveLength(2)
  })

  it('says so when nothing is in the player', async () => {
    const { player } = await openBooks()
    const marked = await run(player, 'bookmark')
    expect(marked.exitCode).not.toBe(0)
    expect((await run(player, 'bookmarks')).stdout).toBe(
      '# No title is open or playing.',
    )
  })
})

describe('books words', () => {
  it('prints the paragraph being read with those around it, once', async () => {
    const { player } = await openBooks({ transcripts: spokenTranscript })
    await run(player, 'listen the-lantern-keeper')
    await run(player, 'seek-to 6s')
    await eventually(async () =>
      (await run(player, 'words')).stdout.includes('> 0:05'),
    )
    const words = await run(player, 'words')
    expect(words.exitCode).toBe(0)
    expect(words.stdout.split('\n')).toEqual([
      '# The Lantern Keeper · The Tide · 0:06 of 1:20:00 · playing · /books/the-lantern-keeper/listen/6s',
      '## The Tide',
      '- 0:00 The keeper climbed the stairs at dusk.',
      '> 0:05 He [trimmed] the wick and waited.',
      '+ 0:10 Far out a bell answered the lamp.',
    ])
  })

  it('takes --before and --after, and prints one line of JSON for --json', async () => {
    const { player } = await openBooks({ transcripts: spokenTranscript })
    await run(player, 'listen the-lantern-keeper')
    await run(player, 'seek-to 6s')
    await eventually(async () =>
      (await run(player, 'words')).stdout.includes('> 0:05'),
    )
    const trailing = await run(player, 'words', { before: '0', after: '1' })
    expect(trailing.stdout.split('\n').slice(1)).toEqual([
      '> 0:05 He [trimmed] the wick and waited.',
      '+ 0:10 Far out a bell answered the lamp.',
    ])
    const json = await run(player, 'words', {
      json: '1',
      before: '0',
      after: '0',
    })
    expect(json.stdout).not.toContain('\n')
    expect(JSON.parse(json.stdout)).toMatchObject({
      _tag: 'WordsNow',
      header: {
        slug: 'the-lantern-keeper',
        link: '/books/the-lantern-keeper/listen/6s',
      },
      excerpt: { currentWord: 'trimmed' },
    })
  })

  it('paints the words from the theme when the view says its output is a terminal', async () => {
    const { player } = await openBooks({ transcripts: spokenTranscript })
    await run(player, 'listen the-lantern-keeper')
    await run(player, 'seek-to 6s')
    await eventually(async () =>
      (await run(player, 'words')).stdout.includes('> 0:05'),
    )
    const escape = '\u001b['
    const plain = await run(player, 'words', { before: '0', after: '1' })
    expect(plain.stdout).not.toContain(escape)
    const painted = await run(player, 'words', {
      before: '0',
      after: '1',
      color: '1',
    })
    const [, current = '', trailing = ''] = painted.stdout.split('\n')
    expect(current).toContain(`${escape}1mHe${escape}22m`)
    expect(current).toMatch(
      /\u001b\[4m\u001b\[38;2;\d+;\d+;\d+mtrimmed\u001b\[39m\u001b\[24m/,
    )
    expect(current).toContain(' the wick and waited.')
    expect(trailing).toContain('Far out a bell answered the lamp.')
    expect(painted.stdout).not.toContain(`${escape}2m`)
    const json = await run(player, 'words', { json: '1', color: '1' })
    expect(json.stdout).not.toContain(escape)
  })

  it('says nothing is in the player before a title is', async () => {
    const { player } = await openBooks()
    expect((await run(player, 'words')).stdout).toBe(
      '# Nothing is in the player.',
    )
  })

  const reportingOnce = Layer.succeed(AudioOutput, {
    sound: track =>
      Stream.concat(
        Stream.sync(() =>
          AudioEvent.Advanced({
            placeMs: Milliseconds.make(track.fromMs),
            wallClockMs: Date.now(),
          }),
        ),
        Stream.never,
      ),
  })

  // NOTE: The title is paused on a known word with its words loaded, so
  // what a follower hears first is certain however busy the machine is;
  // `play` then starts the clock from that word.
  const pausedOn = async (place: string) => {
    const opened = await openBooks({
      transcripts: spokenTranscript,
      audio: reportingOnce,
    })
    await run(opened.player, 'listen the-lantern-keeper')
    await run(opened.player, `seek-to ${place}`)
    await run(opened.player, 'pause')
    await eventually(async () => {
      const words = (await run(opened.player, 'words')).stdout
      return words.includes('> 0:05') && words.includes('· The Tide ·')
    })
    return opened
  }

  const heard = (
    player: BooksPlayer,
    flags: Readonly<Record<string, string>>,
    count: number,
    keep: (text: string) => Option.Option<string> = Option.some,
    topic = 'words',
  ) =>
    Effect.runPromise(
      Stream.runCollect(
        Stream.take(
          followOf(player)(topic, flags, Processor.Host.Cli()).pipe(
            Stream.map(keep),
            Stream.filter(Option.isSome),
            Stream.map(kept => kept.value),
            Stream.changes,
          ),
          count,
        ),
      ),
    )

  const settle = (): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, 150))

  const startingWith =
    (prefix: string) =>
    (text: string): Option.Option<string> =>
      text.startsWith(prefix) ? Option.some(text) : Option.none()

  it('follows by the word down a pipe: the paragraph, then each word as its time arrives with its start and link', async () => {
    const { player } = await pausedOn('5500')
    const [paragraph = ''] = await heard(player, { before: '0', after: '0' }, 1)
    expect(paragraph.split('\n').slice(1)).toEqual([
      '> 0:05 [He] trimmed the wick and waited.',
    ])
    const words = heard(player, {}, 3, startingWith('. '))
    await settle()
    await run(player, 'play')
    expect(await words).toEqual([
      '. 0:05 He /books/the-lantern-keeper/listen/5.5s',
      '. 0:06 trimmed /books/the-lantern-keeper/listen/6s',
      '. 0:06 the /books/the-lantern-keeper/listen/6.5s',
    ])
    await run(player, 'pause')
  })

  it('says one line when it plays and one when it pauses, and never the paragraph again for that', async () => {
    const { player } = await pausedOn('5500')
    const turns = heard(player, { paragraphs: '1' }, 3)
    await settle()
    await run(player, 'play')
    await settle()
    await run(player, 'pause')
    const texts = await turns
    expect(texts[0]).toContain('> 0:05')
    expect(texts[1]).toMatch(/^# playing from 0:0\d$/)
    expect(texts[2]).toMatch(/^# paused at 0:0\d$/)
  })

  it('follows by the paragraph alone when asked, as it did before', async () => {
    const { player } = await openBooks({ transcripts: spokenTranscript })
    await run(player, 'listen the-lantern-keeper')
    await run(player, 'seek-to 1s')
    await eventually(async () =>
      (await run(player, 'words')).stdout.includes('> 0:00'),
    )
    const listening = heard(player, { paragraphs: '1' }, 3)
    await new Promise(resolve => setTimeout(resolve, 100))
    await run(player, 'seek-to 6s')
    await new Promise(resolve => setTimeout(resolve, 100))
    await run(player, 'seek-to 11s')
    const currentLines = Array.map(await listening, text =>
      Array.filter(text.split('\n'), line => line.startsWith('> ')),
    )
    expect(Array.map(currentLines, lines => lines[0]?.slice(0, 6))).toEqual([
      '> 0:00',
      '> 0:05',
      '> 0:10',
    ])
  })

  it('sends another program one line of JSON for each: the paragraph, each word, each turn', async () => {
    const { player } = await pausedOn('5500')
    const texts = await heard(player, { json: '1' }, 2)
    expect(Array.map(texts, text => JSON.parse(text))).toMatchObject([
      { _tag: 'WordsNow', header: { slug: 'the-lantern-keeper' } },
      {
        _tag: 'WordSpoken',
        text: 'He',
        startMs: 5500,
        link: '/books/the-lantern-keeper/listen/5.5s',
      },
    ])
  })

  it('sends a terminal the words laid out to be read, the mark moving by the word, with what can be run now under them', async () => {
    const { player } = await pausedOn('5500')
    const terminal = { 'in-place': '1', columns: '60', rows: '20' }
    const markOf = (frame: string): Option.Option<string> =>
      Option.fromNullishOr(
        /\[(\S+)\]/.exec(
          frame.split('\n').find(line => line.startsWith('  ▎')) ?? '',
        )?.[1],
      )
    const [paused = ''] = await heard(player, terminal, 1)
    const lines = paused.split('\n')
    expect(lines.every(line => line.length <= 60)).toBe(true)
    expect(lines.length).toBeLessThanOrEqual(19)
    expect(lines.slice(0, 3)).toEqual([
      '  The Lantern Keeper',
      '  The Tide · 0:05 of 1:20:00 · paused',
      '',
    ])
    expect(lines).toContain('  ▎ 0:05  [He] trimmed the wick and waited.')
    expect(lines).toContain('    0:00  The keeper climbed the stairs at dusk.')
    expect(lines.slice(-3)).toEqual([
      '',
      '  books play   books skip-back   books bookmark   books link',
      '  books actions for more',
    ])
    const marks = heard(player, terminal, 3, markOf)
    await settle()
    await run(player, 'play')
    expect(await marks).toEqual(['He', 'trimmed', 'the'])
    const [playing = ''] = await heard(player, terminal, 1)
    expect(playing.split('\n')[1]).toMatch(/· playing$/)
    expect(playing.split('\n').slice(-3)).toEqual([
      '',
      '  books pause   books skip-back   books bookmark',
      '  books link   ·   books actions for more',
    ])
    await run(player, 'pause')
  })

  it('inks the frame for the ground the view says its terminal has, the word being read underlined and unbracketed, and never dims', async () => {
    const { player } = await pausedOn('5500')
    const terminal = {
      'in-place': '1',
      columns: '60',
      rows: '20',
      color: '1',
    }
    const [dark = ''] = await heard(
      player,
      { ...terminal, 'terminal-ground': '15;0' },
      1,
    )
    expect(dark).toContain(
      '\u001b[38;2;251;146;60m▎\u001b[39m \u001b[38;2;154;161;170m0:05\u001b[39m  \u001b[4m\u001b[38;2;157;184;255mHe\u001b[39m\u001b[24m trimmed the wick and waited.',
    )
    expect(dark.split('\n')[0]).toBe('  \u001b[1mThe Lantern Keeper\u001b[22m')
    const [light = ''] = await heard(
      player,
      { ...terminal, 'terminal-ground': '0;15' },
      1,
    )
    expect(light).toContain('\u001b[38;2;107;114;128m0:05\u001b[39m')
    const [unknown = ''] = await heard(player, terminal, 1)
    expect(unknown).toContain('▎\u001b[39m 0:05  \u001b[4m')
    for (const frame of [dark, light, unknown]) {
      expect(frame).not.toContain('\u001b[2m')
      expect(frame).not.toContain('[He]')
    }
  })

  it('follows the words when no topic is named', async () => {
    const { player } = await pausedOn('5500')
    const [first = ''] = await heard(
      player,
      { before: '0', after: '0' },
      1,
      Option.some,
      '',
    )
    expect(first).toContain('> 0:05')
  })

  it('follows the screen like any Program, and refuses a topic it does not have', async () => {
    const { player } = await openBooks()
    const [first = ''] = await Effect.runPromise(
      Stream.runCollect(
        Stream.take(followOf(player)('screen', {}, Processor.Host.Cli()), 1),
      ),
    )
    expect(first).toContain('at /books')
    const refusal = await Effect.runPromise(
      Effect.flip(
        Stream.runCollect(followOf(player)('wrods', {}, Processor.Host.Cli())),
      ),
    )
    expect(refusal.message).toBe(
      'Nothing here is called "wrods" to follow. Follow one of: screen, words.',
    )
  })
})

describe('books search', () => {
  it('prints each place the words are spoken in the title in the player, with its time, chapter and link', async () => {
    const { player, bound } = await openBooks({ transcripts: spokenTranscript })
    await run(player, 'listen the-lantern-keeper')
    await run(player, 'pause')
    await eventually(async () =>
      (await run(player, 'words')).stdout.includes('The Tide'),
    )
    const found = await run(player, 'search lamp')
    expect(found.exitCode).toBe(0)
    expect(found.stdout.split('\n')).toEqual([
      '# 1 match for “lamp” in The Lantern Keeper',
      '0:13 · The Tide · and waited. Far out a bell answered the [lamp.] · /books/the-lantern-keeper/listen/13.5s',
    ])
    expect(isSounding(bound)).toBe(false)
    const phrase = await run(player, 'search the  WICK and')
    expect(phrase.stdout.split('\n')).toEqual([
      '# 1 match for “the WICK and” in The Lantern Keeper',
      '0:06 · The Tide · keeper climbed the stairs at dusk. He trimmed [the wick and] waited. Far out a bell answered the lamp. · /books/the-lantern-keeper/listen/6.5s',
    ])
    const none = await run(player, 'search harbour')
    expect(none.exitCode).toBe(0)
    expect(none.stdout).toBe('# No matches for “harbour” in The Lantern Keeper')
  })

  it('prints one line of JSON for --json, each match with its link', async () => {
    const { player } = await openBooks({ transcripts: spokenTranscript })
    await run(player, 'listen the-lantern-keeper')
    await eventually(async () =>
      (await run(player, 'words')).stdout.includes('The Tide'),
    )
    const json = await run(player, 'search lamp', { json: '1' })
    expect(json.stdout).not.toContain('\n')
    expect(JSON.parse(json.stdout)).toMatchObject({
      _tag: 'BookMatches',
      slug: 'the-lantern-keeper',
      query: 'lamp',
      total: 1,
      matches: [
        {
          place: '0:13',
          placeMs: 13_500,
          chapter: 'The Tide',
          text: 'lamp.',
          link: '/books/the-lantern-keeper/listen/13.5s',
        },
      ],
    })
  })

  it('says what to do when nothing is in the player or no words are given, with exit code 1', async () => {
    const { player } = await openBooks()
    const idle = await run(player, 'search lamp')
    expect(idle.exitCode).toBe(1)
    expect(idle.stderr).toBe(
      'Nothing is in the player. Play a title first, such as: books play the-lantern-keeper',
    )
    const wordless = await run(player, 'search')
    expect(wordless.exitCode).toBe(1)
    expect(wordless.stderr).toBe(
      'Search for what? For example: books search "lit at dusk"',
    )
  })

  it('opens the link a search printed on that word, paused, as a path or a whole address', async () => {
    const { player, bound } = await openBooks({ transcripts: spokenTranscript })
    const opened = await run(
      player,
      'open /books/the-lantern-keeper/listen/13.5s',
    )
    expect(opened.exitCode).toBe(0)
    await eventually(() => placeOf(bound) === 13_500)
    expect(isSounding(bound)).toBe(false)
    await eventually(async () =>
      (await run(player, 'words')).stdout.includes('[lamp.]'),
    )
    await run(
      player,
      'open https://books.example.invalid/books/the-lantern-keeper/listen/6.5s',
    )
    await eventually(() => placeOf(bound) === 6_500)
    expect(isSounding(bound)).toBe(false)
    const json = await run(player, 'words', { json: '1' })
    expect(JSON.parse(json.stdout)).toMatchObject({
      header: { wordLink: '/books/the-lantern-keeper/listen/6.5s' },
    })
  })
})

describe('books open and books screen', () => {
  it('prints the page a person opened, not the player brief', async () => {
    const { player } = await openBooks()
    const opened = await run(player, 'open /books/profile')
    expect(opened.exitCode).toBe(0)
    expect(opened.stdout).toMatch(/^at \/books\/profile$/m)
    expect(opened.stdout).not.toMatch(/^Actions$/m)
    expect(opened.stdout).not.toMatch(/Nothing is playing/)
    const back = await run(player, 'back')
    expect(back.stdout).toMatch(/^at \/books$/m)
  })

  it('prints the screen where the player is, without the Action list', async () => {
    const { player } = await openBooks()
    const screen = await run(player, 'screen')
    expect(screen.exitCode).toBe(0)
    expect(screen.stdout).toMatch(/^at \/books$/m)
    expect(screen.stdout).toMatch(/The Lantern Keeper/)
    expect(screen.stdout).not.toMatch(/^Actions$/m)
  })

  it('says why a place cannot be opened, on stderr with exit code 1', async () => {
    const { player } = await openBooks()
    const refused = await run(player, 'back')
    expect(refused.exitCode).toBe(1)
    expect(refused.stderr).toBe('Already at the first screen.')
  })
})

describe('books CLI', () => {
  it('lists the library and every Action with its command for books actions', async () => {
    const { bound, player } = await openBooks()
    const painted = await run(player, 'actions')
    expect(painted.stdout).toMatch(/The Lantern Keeper/)
    expect(painted.stdout).toMatch(/^ {2}play <title> +Plays this book/m)
    expect(painted.stdout).toMatch(/^ {2}seek-to <time> +Moves to a place/m)
    expect(runProgramCommand(bound, 'books', [], {}).stdout).toMatch(
      /^ {2}play <title>/m,
    )
  })

  it('says what is playing in a few lines, then the commands to copy now', async () => {
    const { player } = await openBooks()
    const idle = await run(player, 'help')
    expect(idle.stdout.split('\n')).toEqual([
      'Nothing is playing.',
      '',
      '  books play the-lantern-keeper',
      '  books play small-hours',
      '  books play a-field-guide-to-weather',
      '  books tui      Opens the player live in this terminal',
      '  books actions  Lists everything the library can be asked to do',
      '  books login    Signs the user in to their library',
    ])
  })

  it('prints a line wider than the terminal whole, for the terminal to wrap', async () => {
    const { player } = await openBooks({
      shelf: resumedShelf,
      chapters: resumedChapters,
    })
    const idle = await run(player, 'help')
    expect(idle.stdout.split('\n')).toContain(
      'Continue A Tin Comet: Chapter 2: A long made-up part about waiting for the bus · 1:42:15 of 9:13:01 · 7h 31m left',
    )
  })

  it('plays a title from a command and the next command acts on that playback', async () => {
    const { player, bound } = await openBooks()
    const listened = await run(player, 'listen the-lantern-keeper')
    expect(listened.exitCode).toBe(0)
    expect(listened.stdout).toMatch(/^▶ Playing The Lantern Keeper$/m)
    expect(listened.stdout).toMatch(
      /^ {2}books pause +Pauses and keeps the place$/m,
    )
    expect(listened.stdout).toMatch(/^ {2}books stop +Pauses, saves the place/m)
    await eventually(() => {
      const model = bound.readModel()
      return (
        model._tag === 'Ready' &&
        Option.isSome(chaptersOf(model, TitleSlug.make('the-lantern-keeper')))
      )
    })
    const sought = await run(player, 'seek-to 1h00m00s')
    expect(sought.stdout).toMatch(/The Keeper · 1:00:00 of 1:20:00 · 20m left/)
    const paused = await run(player, 'pause')
    expect(paused.stdout).toMatch(/^❚❚ Paused The Lantern Keeper$/m)
    expect(paused.stdout).toMatch(
      /^ {2}books play +Plays from where it is paused$/m,
    )
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
      chapters: longChapters,
      audio: tickingAudio(20),
      transcripts: longTranscript,
    })
    await run(player, 'listen a-tin-comet')
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
      chapters: longChapters,
      audio: tickingAudio(20),
      transcripts: longTranscript,
      telemetry: memory.layer,
    })
    await run(player, 'listen a-tin-comet')
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
    await eventually(() =>
      memory
        .events()
        .some(
          event =>
            event._tag === 'CommandFinished' &&
            event.command === 'WriteLibrary',
        ),
    )
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
    Array.forEach(pressed, event => {
      expect(event).toMatchObject({
        surface: 'terminal-tui',
        role: 'daemon',
        source: { _tag: 'Host', clientHost: { _tag: 'Tui' } },
      })
    })
    const listened = Array.findFirst(
      memory.events(),
      (event): event is Telemetry.Transition =>
        event._tag === 'Transition' && event.source._tag === 'Host',
    )
    expect(listened).toStrictEqual(
      Option.some(
        expect.objectContaining({
          surface: 'terminal-cli',
          source: { _tag: 'Host', clientHost: { _tag: 'Cli' } },
        }),
      ),
    )
    const savedByPause = Array.filter(
      recorded,
      event =>
        (event._tag === 'CommandStarted' || event._tag === 'CommandFinished') &&
        event.command === 'WriteLibrary',
    )
    expect(Array.map(savedByPause, event => event._tag)).toEqual([
      'CommandStarted',
      'CommandFinished',
    ])
    Array.forEach(savedByPause, event => {
      expect(event).toMatchObject({ surface: 'terminal-tui', role: 'daemon' })
    })
    Array.forEach(
      Array.filter(
        recorded,
        event =>
          event._tag === 'Transition' && event.source._tag === 'Subscription',
      ),
      event => {
        expect(event.surface).toBe('terminal-cli')
      },
    )
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
    Array.forEach(keyPaints, event => {
      expect(event).toMatchObject({ surface: 'terminal-tui', role: 'daemon' })
    })
  })
})
