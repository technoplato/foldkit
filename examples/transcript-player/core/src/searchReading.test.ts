import { Array, Effect, Option, Stream } from 'effect'
import { Catalog } from 'foldkit'
import { renderScreen } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { MediaId, Milliseconds, WordId } from './ids.js'
import {
  FailedReadSearchWords,
  type Message,
  ReadSearchWords,
  catalog,
} from './message.js'
import { type Model, type Passage, init, searchOf } from './model.js'
import { searchPanelOf } from './screen.js'
import {
  searchWordsDependenciesOf,
  searchWordsStream,
} from './subscriptions.js'
import {
  type SearchWords,
  TranscriptSource,
  TranscriptSourceError,
  transcriptsInMemory,
} from './transcript.js'
import { update } from './update.js'

const mediaId = MediaId.make('the-lantern-keeper')

const hourMs = 3_600_000

const passageOf = (
  passageId: string,
  startMs: number,
  text: string,
): Passage => ({
  passageId,
  startMs: Milliseconds.make(startMs),
  endMs: Milliseconds.make(startMs + 60_000),
  words: Array.map(text.split(' '), (word, index) => ({
    wordId: WordId.make(`${passageId}.${index.toString()}`),
    text: word,
    startMs: Milliseconds.make(startMs + index * 400),
    endMs: Milliseconds.make(startMs + index * 400 + 300),
  })),
})

const early = passageOf('early', 0, 'The keeper lit the lamp at dusk.')
const middle = passageOf('middle', 2 * hourMs, 'A bell answered the lamp.')
const late = passageOf('late', 3 * hourMs, 'In the morning the lamp was warm.')

const media = {
  mediaId,
  durationMs: Milliseconds.make(4 * hourMs),
  maybeAudioUrl: Option.none(),
  sections: [],
}

const player = (): Model => init(media, { placeMs: Milliseconds.make(0) })

const pressed = (model: Model, tag: string): Model =>
  Option.match(Catalog.messageFor(catalog, model, tag), {
    onNone: () => model,
    onSome: message => update(model, message)[0],
  })

/** A source that has read only what a test says it has. */
const sourceHolding = (words: SearchWords) => ({
  passagesIn: () => Stream.empty,
  passagesMatching: () => Effect.succeed(words),
  searchWordsOf: () => Stream.empty,
})

const ran = async (
  model: Model,
  message: Message,
  words: SearchWords,
): Promise<Model> => {
  const [next, commands] = update(model, message)
  const reported: ReadonlyArray<Message> = await Effect.runPromise(
    Effect.all(
      Array.map(commands, command =>
        command.effect.pipe(
          Effect.provideService(TranscriptSource, sourceHolding(words)),
        ),
      ),
    ),
  )
  return Array.reduce(
    reported,
    next,
    (current, each) => update(current, each)[0],
  )
}

const searchFor = (model: Model, query: string): Message =>
  Option.getOrThrow(Catalog.messageFor(catalog, model, `SearchFor:${query}`))

const textOf = (model: Model): string =>
  Array.map(searchPanelOf(model, Catalog.entries(catalog, model)), node =>
    renderScreen(node, 100),
  ).join('\n')

const tagOf = (model: Model) =>
  Option.map(searchOf(model), search => search._tag)

describe('reading the words for a search', () => {
  it('starts when the search opens, unless the Program says to wait for words to search for', () => {
    const closed = player()
    const open = pressed(closed, 'ShowSearch')
    const recording = Option.some({ mediaId, durationMs: media.durationMs })
    expect(
      searchWordsDependenciesOf(Option.some(closed)).maybeRecording,
    ).toEqual(Option.none())
    expect(searchWordsDependenciesOf(Option.some(open)).maybeRecording).toEqual(
      recording,
    )
    expect(
      searchWordsDependenciesOf(Option.some(open), 'OnSearch').maybeRecording,
    ).toEqual(Option.none())
    const asked = update(open, searchFor(open, 'lamp'))[0]
    expect(
      searchWordsDependenciesOf(Option.some(asked), 'OnSearch').maybeRecording,
    ).toEqual(recording)
    expect(
      searchWordsDependenciesOf(Option.some(pressed(asked, 'CloseSearch')))
        .maybeRecording,
    ).toEqual(Option.none())
  })

  it('says how many parts are in while none has matches to show yet', async () => {
    const open = pressed(player(), 'ShowSearch')
    const waiting = await ran(open, searchFor(open, 'lamp'), {
      passages: [],
      partsRead: 0,
      partsTotal: 7,
    })
    expect(tagOf(waiting)).toEqual(Option.some('Searching'))
    expect(textOf(waiting)).toContain('Searching… 0 of 7 parts')
  })

  it('shows the matches in the parts that are in, and searches again as each part lands', async () => {
    const open = pressed(player(), 'ShowSearch')
    const waiting = await ran(open, searchFor(open, 'lamp'), {
      passages: [],
      partsRead: 0,
      partsTotal: 7,
    })
    const some = await ran(
      waiting,
      ReadSearchWords({ partsRead: 3, partsTotal: 7 }),
      { passages: [middle], partsRead: 3, partsTotal: 7 },
    )
    expect(tagOf(some)).toEqual(Option.some('SearchFound'))
    expect(textOf(some)).toContain('1 of 1')
    expect(textOf(some)).toContain('Searching… 3 of 7 parts')
    const all = await ran(
      some,
      ReadSearchWords({ partsRead: 7, partsTotal: 7 }),
      { passages: [early, middle, late], partsRead: 7, partsTotal: 7 },
    )
    expect(textOf(all)).toContain('2 of 3')
    expect(textOf(all)).not.toContain('parts')
  })

  it('keeps the match a person is on while more parts land', async () => {
    const open = pressed(player(), 'ShowSearch')
    const some = await ran(open, searchFor(open, 'lamp'), {
      passages: [late],
      partsRead: 1,
      partsTotal: 7,
    })
    const selectedOf = (model: Model) =>
      Option.flatMap(searchOf(model), search =>
        search._tag === 'SearchFound' ? search.maybeSelectedMs : Option.none(),
      )
    const before = selectedOf(some)
    expect(Option.isSome(before)).toBe(true)
    const more = await ran(
      some,
      ReadSearchWords({ partsRead: 2, partsTotal: 7 }),
      { passages: [early, late], partsRead: 2, partsTotal: 7 },
    )
    expect(selectedOf(more)).toEqual(before)
  })

  it('drops a result that holds fewer parts than the one already shown', async () => {
    const open = pressed(player(), 'ShowSearch')
    const three = await ran(open, searchFor(open, 'lamp'), {
      passages: [early, middle],
      partsRead: 3,
      partsTotal: 7,
    })
    const stale = await ran(
      three,
      ReadSearchWords({ partsRead: 4, partsTotal: 7 }),
      { passages: [early], partsRead: 2, partsTotal: 7 },
    )
    expect(textOf(stale)).toContain('of 2')
  })

  it('does not search again once every part is in', () => {
    const open = pressed(player(), 'ShowSearch')
    const [, commands] = update(
      open,
      ReadSearchWords({ partsRead: 7, partsTotal: 7 }),
    )
    expect(commands).toEqual([])
  })

  it('fails the search as a fact when the words cannot be read', async () => {
    const open = pressed(player(), 'ShowSearch')
    const waiting = await ran(open, searchFor(open, 'lamp'), {
      passages: [],
      partsRead: 0,
      partsTotal: 7,
    })
    const failed = update(
      waiting,
      FailedReadSearchWords({ reason: 'the transcript could not be read' }),
    )[0]
    expect(textOf(failed)).toContain(
      'Could not search: the transcript could not be read',
    )
  })

  it('turns what the source reads into facts, and a failure into one too', async () => {
    const reading = {
      passagesIn: () => Stream.empty,
      passagesMatching: () =>
        Effect.succeed({ passages: [], partsRead: 0, partsTotal: 0 }),
      searchWordsOf: () =>
        Stream.concat(
          Stream.make(
            { partsRead: 0, partsTotal: 2 },
            { partsRead: 1, partsTotal: 2 },
          ),
          Stream.fail(
            new TranscriptSourceError({
              reason: 'the transcript could not be read',
            }),
          ),
        ),
    }
    const facts = await Effect.runPromise(
      Stream.runCollect(
        searchWordsStream({
          maybeRecording: Option.some({
            mediaId,
            durationMs: media.durationMs,
          }),
        }),
      ).pipe(Effect.provideService(TranscriptSource, reading)),
    )
    expect(Array.fromIterable(facts)).toEqual([
      ReadSearchWords({ partsRead: 0, partsTotal: 2 }),
      ReadSearchWords({ partsRead: 1, partsTotal: 2 }),
      FailedReadSearchWords({ reason: 'the transcript could not be read' }),
    ])
  })

  it('a source with its words in memory has them all at once', async () => {
    const words = await Effect.runPromise(
      Effect.gen(function* () {
        const source = yield* TranscriptSource
        const first = yield* Stream.runHead(
          source.searchWordsOf(mediaId, media.durationMs),
        )
        const held = yield* source.passagesMatching(mediaId, 'lamp')
        return { first, held }
      }).pipe(
        Effect.provide(transcriptsInMemory(new Map([[mediaId, [early]]]))),
      ),
    )
    expect(words.first).toEqual(Option.some({ partsRead: 1, partsTotal: 1 }))
    expect(words.held).toEqual({
      passages: [early],
      partsRead: 1,
      partsTotal: 1,
    })
  })
})
