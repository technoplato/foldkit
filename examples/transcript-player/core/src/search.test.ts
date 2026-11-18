import { Array, Effect, Option, Stream } from 'effect'
import { Catalog, Interaction } from 'foldkit'
import { renderScreen, seekLandingAt, transcriptsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { MediaId, Milliseconds, SearchQuery, WordId } from './ids.js'
import {
  FailedSearch,
  type Message,
  ReachedPlace,
  ReceivedMatches,
  ReceivedPassages,
  catalog,
} from './message.js'
import {
  type Model,
  type Passage,
  init,
  isFollowingPlayhead,
  searchOf,
  selectedMatchOf,
  viewPlaceOf,
} from './model.js'
import {
  readerButtonsOf,
  searchPanelOf,
  seekBarOf,
  transcriptOf,
} from './screen.js'
import { foundIn } from './search.js'
import { transcriptDependenciesOf } from './subscriptions.js'
import {
  TranscriptSource,
  TranscriptSourceError,
  rangeOfWindow,
  transcriptsInMemory,
} from './transcript.js'
import { update } from './update.js'

const mediaId = MediaId.make('the-lantern-keeper')

const hourMs = 3_600_000

const wordEveryMs = 400

const sentencePauseMs = 2_000

/**
 * A passage of sentences, each word 400 ms after the last and each
 * sentence two seconds after the one before, so each reads as its own
 * paragraph.
 */
const passageOf = (
  passageId: string,
  startMs: number,
  sentences: ReadonlyArray<string>,
): Passage => {
  const words = Array.flatMap(sentences, (sentence, sentenceIndex) =>
    Array.map(sentence.split(' '), (text, wordIndex) => ({
      text,
      sentenceIndex,
      wordIndex,
    })),
  )
  const timed = Array.map(words, (word, index) => {
    const wordStartMs =
      startMs + index * wordEveryMs + word.sentenceIndex * sentencePauseMs
    return {
      wordId: WordId.make(`${passageId}.${index.toString()}`),
      text: word.text,
      startMs: Milliseconds.make(wordStartMs),
      endMs: Milliseconds.make(wordStartMs + 300),
    }
  })
  return {
    passageId,
    startMs: Milliseconds.make(startMs),
    endMs: Milliseconds.make(
      Option.match(Array.last(timed), {
        onNone: () => startMs,
        onSome: last => last.endMs,
      }),
    ),
    words: timed,
  }
}

const dusk = passageOf('dusk', 10_000, [
  'The keeper lit the lamp at dusk.',
  'Gulls settled on the lamp rail.',
])

const boat = passageOf('boat', 40_000, ['A boat rounded the point.'])

const bell = passageOf('bell', 3 * hourMs, [
  'Far out a bell answered the lamp.',
  'Then the lamps along the shore answered too.',
])

const wholeBook = [dusk, boat, bell]

const source = transcriptsInMemory(new Map([[mediaId, wholeBook]]))

const media = {
  mediaId,
  durationMs: Milliseconds.make(4 * hourMs),
  maybeAudioUrl: Option.some('https://audio.invalid/the-lantern-keeper.mp3'),
  sections: [
    {
      title: 'The Light',
      startMs: Milliseconds.make(0),
      endMs: Milliseconds.make(hourMs),
    },
    {
      title: 'The Tide',
      startMs: Milliseconds.make(hourMs),
      endMs: Milliseconds.make(4 * hourMs),
    },
  ],
}

const wordsInWindowOf = (model: Model): ReadonlyArray<Passage> => {
  const range = rangeOfWindow(
    Option.match(transcriptDependenciesOf(Option.some(model)).maybeWindow, {
      onNone: () => 0,
      onSome: window => window.index,
    }),
  )
  return Array.filter(
    wholeBook,
    passage => passage.endMs > range.fromMs && passage.startMs < range.toMs,
  )
}

/** The player with the words its window asks the source for, as a host gives them. */
const withWords = (model: Model): Model =>
  update(model, ReceivedPassages({ passages: wordsInWindowOf(model) }))[0]

const loaded = (placeMs = 0): Model =>
  withWords(init(media, { placeMs: Milliseconds.make(placeMs) }))

const pressed = (model: Model, tag: string): Model =>
  Option.match(Catalog.messageFor(catalog, model, tag), {
    onNone: () => model,
    onSome: message => update(model, message)[0],
  })

const keyed = (model: Model, key: string): Option.Option<string> =>
  Option.map(
    Interaction.keyedEntryOf(
      Catalog.entries(catalog, model),
      Interaction.keyInput(key),
    ),
    entry => entry.tag,
  )

/**
 * Presses a tag and runs the Commands it starts against the whole book,
 * feeding back what they report, then loads the words the view asks for.
 */
const pressedAndRan = async (model: Model, tag: string): Promise<Model> => {
  const maybeMessage = Catalog.messageFor(catalog, model, tag)
  if (Option.isNone(maybeMessage)) {
    return model
  }
  const [next, commands] = update(model, maybeMessage.value)
  const reported: ReadonlyArray<Message> = await Effect.runPromise(
    Effect.all(
      Array.map(commands, command =>
        command.effect.pipe(Effect.provide(source)),
      ),
    ),
  )
  return withWords(
    Array.reduce(
      reported,
      next,
      (current, message) => update(current, message)[0],
    ),
  )
}

const searched = (model: Model, query: string): Promise<Model> =>
  pressedAndRan(pressed(model, 'ShowSearch'), `SearchFor:${query}`)

const foundOf = (model: Model) =>
  Option.flatMap(searchOf(model), search =>
    search._tag === 'SearchFound' ? Option.some(search) : Option.none(),
  )

const startsOf = (model: Model): ReadonlyArray<number> =>
  Option.match(foundOf(model), {
    onNone: () => [],
    onSome: found => Array.map(found.matches, match => match.startMs),
  })

const selectedStartOf = (model: Model): Option.Option<number> =>
  Option.map(selectedMatchOf(model), match => match.startMs)

const transcriptNodeOf = (model: Model) =>
  Option.getOrThrow(Array.head(transcriptsOf(transcriptOf(model))))

const lampAtDuskMs = 10_000 + 4 * wordEveryMs

const lampRailMs = 10_000 + 11 * wordEveryMs + sentencePauseMs

const lampFarOutMs = 3 * hourMs + 6 * wordEveryMs

const lampsAlongMs = 3 * hourMs + 9 * wordEveryMs + sentencePauseMs

describe('searching a recording', () => {
  it('opens on /, and searches every word of the recording, not only the words near the place', async () => {
    const idle = loaded()
    expect(keyed(idle, '/')).toEqual(Option.some('ShowSearch'))
    expect(Option.isNone(searchOf(idle))).toBe(true)
    const open = pressed(idle, 'ShowSearch')
    expect(Option.map(searchOf(open), search => search._tag)).toEqual(
      Option.some('SearchIdle'),
    )
    const found = await searched(idle, 'lamp')
    expect(Option.map(foundOf(found), search => search.total)).toEqual(
      Option.some(4),
    )
    expect(startsOf(found)).toEqual([
      lampAtDuskMs,
      lampRailMs,
      lampFarOutMs,
      lampsAlongMs,
    ])
    expect(
      Option.map(foundOf(found), search =>
        Array.map(search.matches, match => [
          match.before,
          match.text,
          match.after,
        ]),
      ),
    ).toEqual(
      Option.some([
        [
          'The keeper lit the',
          'lamp',
          'at dusk. Gulls settled on the lamp rail.',
        ],
        ['the lamp at dusk. Gulls settled on the', 'lamp', 'rail.'],
        [
          'Far out a bell answered the',
          'lamp.',
          'Then the lamps along the shore answered too.',
        ],
        [
          'out a bell answered the lamp. Then the',
          'lamps',
          'along the shore answered too.',
        ],
      ]),
    )
  })

  it('shows the first match after the place without moving the place or starting the audio', async () => {
    const found = await searched(loaded(20_000), 'lamp')
    expect(selectedStartOf(found)).toEqual(Option.some(lampFarOutMs))
    expect(found.placeMs).toBe(20_000)
    expect(found.transport._tag).toBe('Paused')
    expect(isFollowingPlayhead(found)).toBe(false)
    expect(viewPlaceOf(found)).toBe(lampFarOutMs)
    const transcript = transcriptNodeOf(found)
    expect(transcript.isFollowing).toBe(false)
    expect(transcript.focusToken).toBe('bell.6')
    expect(
      Array.flatMap(transcript.passages, passage =>
        Array.flatMap(passage.words, word =>
          word.mark === undefined ? [] : [[word.token, word.mark]],
        ),
      ),
    ).toEqual([
      ['bell.6', 'Selected'],
      ['bell.9', 'Found'],
    ])
  })

  it('steps to the next match on n and the one before on N, around the ends', async () => {
    const found = await searched(loaded(), 'lamp')
    expect(selectedStartOf(found)).toEqual(Option.some(lampAtDuskMs))
    expect(keyed(found, 'n')).toEqual(Option.some('NextMatch'))
    expect(keyed(found, 'N')).toEqual(Option.some('PreviousMatch'))
    const second = pressed(found, 'NextMatch')
    expect(selectedStartOf(second)).toEqual(Option.some(lampRailMs))
    const last = pressed(found, 'PreviousMatch')
    expect(selectedStartOf(last)).toEqual(Option.some(lampsAlongMs))
    expect(selectedStartOf(pressed(last, 'NextMatch'))).toEqual(
      Option.some(lampAtDuskMs),
    )
    expect(
      selectedStartOf(pressed(found, `ShowMatch:${lampFarOutMs.toString()}`)),
    ).toEqual(Option.some(lampFarOutMs))
    expect(Catalog.messageFor(catalog, found, 'ShowMatch:5000')).toEqual(
      Option.none(),
    )
  })

  it('plays from a match, and the words follow the voice again', async () => {
    const found = await searched(loaded(), 'lamp')
    const playing = pressed(found, `PlayFrom:${lampFarOutMs.toString()}`)
    expect(playing.placeMs).toBe(lampFarOutMs)
    expect(playing.transport._tag).toBe('Playing')
    expect(isFollowingPlayhead(playing)).toBe(true)
    expect(selectedStartOf(playing)).toEqual(Option.some(lampFarOutMs))
  })

  it('keeps the first hundred matches and the true count, and takes a phrase', async () => {
    const lamps = passageOf('lamps', 2 * hourMs, [
      Array.join(
        Array.makeBy(150, () => 'lamp'),
        ' ',
      ),
    ])
    const many = transcriptsInMemory(new Map([[mediaId, [dusk, lamps]]]))
    const [searching, commands] = update(
      pressed(loaded(), 'ShowSearch'),
      Option.getOrThrow(
        Catalog.messageFor(
          catalog,
          pressed(loaded(), 'ShowSearch'),
          'SearchFor:lamp',
        ),
      ),
    )
    const reported = await Effect.runPromise(
      Effect.all(
        Array.map(commands, command =>
          command.effect.pipe(Effect.provide(many)),
        ),
      ),
    )
    const found = Array.reduce(
      reported,
      searching,
      (current, message) => update(current, message)[0],
    )
    expect(Option.map(foundOf(found), search => search.total)).toEqual(
      Option.some(152),
    )
    expect(startsOf(found).length).toBe(100)
    const [panel] = searchPanelOf(found, Catalog.entries(catalog, found))
    const painted = renderScreen(
      Option.getOrThrow(Option.fromNullishOr(panel)),
      100,
    )
    expect(painted).toContain('1 of 152')
    expect(painted).toContain(
      'Showing the first 100 of 152. Add a word to narrow it.',
    )
    const phrase = await searched(loaded(), 'the lamp at dusk')
    expect(startsOf(phrase)).toEqual([lampAtDuskMs - wordEveryMs])
  })

  it('finds words in sixteen hours of 266 passages fast enough to feel instant', () => {
    const sentences = [
      'The lantern keeper climbed the stairs at dusk.',
      'Gulls settled on the harbour rail, and waited.',
      'A boat rounded the point before the weather turned.',
      'He trimmed the wick — then lit the lamp.',
      'Far out a bell answered the lantern.',
    ]
    const passageCount = 266
    const sentencesPerPassage = 70
    const sixteenHours = Array.makeBy(passageCount, passageIndex =>
      passageOf(
        `p${passageIndex.toString()}`,
        passageIndex * 216_000,
        Array.makeBy(sentencesPerPassage, sentenceIndex =>
          Option.getOrElse(
            Array.get(
              sentences,
              (passageIndex + sentenceIndex * 3) % sentences.length,
            ),
            () => '',
          ),
        ),
      ),
    )
    const wordCount = Array.reduce(
      sixteenHours,
      0,
      (count, passage) => count + passage.words.length,
    )
    expect(wordCount).toBeGreaterThan(140_000)
    const startedAt = performance.now()
    const found = foundIn(sixteenHours, 'the lantern keep')
    const tookMs = performance.now() - startedAt
    expect(found.total).toBeGreaterThan(1_000)
    expect(found.matches.length).toBe(100)
    expect(tookMs).toBeLessThan(500)
  })

  it('says it is searching, drops matches for words no longer searched for, and says why a search failed', () => {
    const open = pressed(loaded(), 'ShowSearch')
    const searching = pressed(open, 'SearchFor:lamp')
    expect(Option.map(searchOf(searching), search => search._tag)).toEqual(
      Option.some('Searching'),
    )
    const stale = update(
      searching,
      ReceivedMatches({
        query: SearchQuery.make('boat'),
        total: 0,
        matches: [],
      }),
    )[0]
    expect(Option.map(searchOf(stale), search => search._tag)).toEqual(
      Option.some('Searching'),
    )
    const failed = update(
      searching,
      FailedSearch({
        query: SearchQuery.make('lamp'),
        reason: 'the transcript could not be read',
      }),
    )[0]
    expect(
      renderScreen(
        Option.getOrThrow(
          Array.head(searchPanelOf(failed, Catalog.entries(catalog, failed))),
        ),
        80,
      ),
    ).toContain('Could not search: the transcript could not be read')
    const cleared = pressed(failed, 'ClearSearch')
    expect(Option.map(searchOf(cleared), search => search._tag)).toEqual(
      Option.some('SearchIdle'),
    )
    expect(Option.isNone(searchOf(pressed(cleared, 'CloseSearch')))).toBe(true)
  })

  it('fails as a fact when the source cannot be read', async () => {
    const broken = {
      passagesIn: () => Stream.empty,
      passagesMatching: () =>
        Effect.fail(
          new TranscriptSourceError({
            reason: 'the transcript could not be read',
          }),
        ),
    }
    const [, commands] = update(
      pressed(loaded(), 'ShowSearch'),
      Option.getOrThrow(
        Catalog.messageFor(
          catalog,
          pressed(loaded(), 'ShowSearch'),
          'SearchFor:lamp',
        ),
      ),
    )
    const reported = await Effect.runPromise(
      Effect.all(
        Array.map(commands, command =>
          command.effect.pipe(Effect.provideService(TranscriptSource, broken)),
        ),
      ),
    )
    expect(reported).toEqual([
      FailedSearch({
        query: SearchQuery.make('lamp'),
        reason: 'the transcript could not be read',
      }),
    ])
  })

  it('paints the search with its count, each match with its time and chapter, and the buttons to step and play', async () => {
    const found = pressed(await searched(loaded(), 'lamp'), 'NextMatch')
    const painted = renderScreen(
      Option.getOrThrow(
        Array.head(searchPanelOf(found, Catalog.entries(catalog, found))),
      ),
      100,
    )
    expect(painted).toContain('2 of 4')
    expect(painted).toContain('0:16 · The Light')
    expect(painted).toContain('3:00:02 · The Tide')
    expect(painted).toContain('… Gulls settled on the lamp rail.')
    const rows = Array.flatMap(
      searchPanelOf(found, Catalog.entries(catalog, found)),
      node =>
        node._tag === 'Column'
          ? Array.flatMap(node.children, child =>
              child._tag === 'List' ? child.items : [],
            )
          : [],
    )
    expect(
      Array.map(rows, row =>
        row.titleMark === undefined
          ? ''
          : row.title.slice(row.titleMark.start, row.titleMark.end),
      ),
    ).toEqual(['lamp', 'lamp', 'lamp.', 'lamps'])
    expect(searchPanelOf(loaded(), Catalog.entries(catalog, loaded()))).toEqual(
      [],
    )
    expect(
      Array.map(
        readerButtonsOf(loaded(), Catalog.entries(catalog, loaded())),
        button => button.label,
      ),
    ).toEqual(['Search'])
    expect(
      Array.map(
        readerButtonsOf(found, Catalog.entries(catalog, found)),
        button => button.label,
      ),
    ).toEqual(['Back to playhead'])
  })
})

describe('reading away from the playhead', () => {
  it('keeps the words where the person scrolled while it plays on, and offers the way back', () => {
    const playing = pressed(loaded(10_000), 'Play')
    expect(transcriptNodeOf(playing).isFollowing).toBe(true)
    expect(transcriptNodeOf(playing).leaveAction).toBe('LeavePlayhead')
    expect(Catalog.messageFor(catalog, playing, 'BackToPlayhead')).toEqual(
      Option.none(),
    )
    const away = pressed(playing, 'LeavePlayhead')
    expect(isFollowingPlayhead(away)).toBe(false)
    expect(transcriptNodeOf(away).isFollowing).toBe(false)
    expect(transcriptNodeOf(away).focusToken).toBeUndefined()
    const later = update(
      away,
      ReachedPlace({
        placeMs: Milliseconds.make(41_000),
        wallClockMs: 1_792_350_041_000,
      }),
    )[0]
    expect(viewPlaceOf(later)).toBe(10_000)
    expect(
      Array.map(transcriptNodeOf(later).passages, passage => passage.key),
    ).toEqual(
      Array.map(transcriptNodeOf(away).passages, passage => passage.key),
    )
    const back = pressed(later, 'BackToPlayhead')
    expect(isFollowingPlayhead(back)).toBe(true)
    expect(back.transport._tag).toBe('Playing')
    expect(back.placeMs).toBe(41_000)
  })

  it('follows again when the person moves the place', () => {
    const away = pressed(pressed(loaded(10_000), 'Play'), 'LeavePlayhead')
    expect(isFollowingPlayhead(pressed(away, 'SkipForward'))).toBe(true)
    expect(isFollowingPlayhead(pressed(away, 'SeekToWord:boat.1'))).toBe(true)
    expect(isFollowingPlayhead(pressed(away, 'Pause'))).toBe(false)
  })
})

describe('a word’s menu', () => {
  it('opens on one word as state any Client draws, offers playing from it and what the Program adds, and closes', () => {
    const closed = loaded(10_000)
    expect(transcriptNodeOf(closed).wordMenuAction).toBe('ShowWordMenu')
    expect(transcriptNodeOf(closed).wordMenu).toBeUndefined()
    const open = pressed(closed, 'ShowWordMenu:dusk.4')
    const [withCopy] = transcriptsOf(
      transcriptOf(open, {
        wordActions: [
          { action: 'CopyWordLink', label: 'Copy link to this word' },
        ],
      }),
    )
    expect(
      Array.flatMap(withCopy?.passages ?? [], passage =>
        Array.flatMap(passage.words, word =>
          word.mark === undefined ? [] : [[word.token, word.mark]],
        ),
      ),
    ).toEqual([['dusk.4', 'Picked']])
    expect(withCopy?.wordMenu).toEqual({
      token: 'dusk.4',
      dismissAction: 'CloseWordMenu',
      items: [
        { action: 'SeekToWord:dusk.4', label: 'Play from here', icon: 'Play' },
        { action: 'CopyWordLink:dusk.4', label: 'Copy link to this word' },
      ],
    })
    expect(
      transcriptNodeOf(pressed(open, 'CloseWordMenu')).wordMenu,
    ).toBeUndefined()
    const played = pressed(open, 'SeekToWord:dusk.4')
    expect(played.placeMs).toBe(lampAtDuskMs)
    expect(transcriptNodeOf(played).wordMenu).toBeUndefined()
    expect(Catalog.messageFor(catalog, closed, 'ShowWordMenu:nowhere')).toEqual(
      Option.none(),
    )
  })
})

describe('scrubbing by paragraph', () => {
  it('goes to the next paragraph on } and back to the start of this one on {, then the one before', () => {
    const inGulls = loaded(lampRailMs)
    expect(keyed(inGulls, '}')).toEqual(Option.some('NextParagraph'))
    expect(keyed(inGulls, '{')).toEqual(Option.some('PreviousParagraph'))
    expect(pressed(inGulls, 'NextParagraph').placeMs).toBe(40_000)
    const gullsStartMs = 10_000 + 7 * wordEveryMs + sentencePauseMs
    expect(pressed(inGulls, 'PreviousParagraph').placeMs).toBe(gullsStartMs)
    expect(pressed(loaded(gullsStartMs), 'PreviousParagraph').placeMs).toBe(
      10_000,
    )
    expect(
      Catalog.messageFor(catalog, loaded(10_000), 'PreviousParagraph'),
    ).toEqual(Option.none())
  })

  it('keeps playing from the paragraph when it was playing', () => {
    const playing = pressed(loaded(lampRailMs), 'Play')
    const next = pressed(playing, 'NextParagraph')
    expect(next.transport._tag).toBe('Playing')
    expect(next.placeMs).toBe(40_000)
  })
})

describe('the seek bar', () => {
  it('names the paragraph a drag will land on where the words are at hand, and only the chapter elsewhere', () => {
    const whole = pressed(loaded(), 'SetSeekScope:Recording')
    const [bar] = Array.filter([seekBarOf(whole)], node => node._tag === 'Seek')
    const landingAt = (placeMs: number): Option.Option<string> =>
      Option.flatMap(Option.fromNullishOr(bar), seek =>
        seek._tag === 'Seek'
          ? Option.map(seekLandingAt(seek, placeMs), landing => landing.text)
          : Option.none(),
      )
    expect(landingAt(5_000)).toEqual(Option.some('The Light'))
    expect(landingAt(12_000)).toEqual(
      Option.some('0:10 · The keeper lit the lamp at dusk.'),
    )
    expect(landingAt(41_000)).toEqual(
      Option.some('0:40 · A boat rounded the point.'),
    )
    expect(landingAt(30 * 60_000)).toEqual(Option.some('The Light'))
    expect(landingAt(2 * hourMs)).toEqual(Option.some('The Tide'))
  })
})
