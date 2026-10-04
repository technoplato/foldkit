import { Array, Effect, Option, Stream } from 'effect'
import { Catalog, Interaction } from 'foldkit'
import { renderScreen } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { MediaId, Milliseconds, WordId } from './ids.js'
import {
  FailedPlayAudio,
  type Message,
  ReachedEnd,
  ReachedPlace,
  ReceivedPassages,
  catalog,
} from './message.js'
import { type Model, type Passage, init } from './model.js'
import type { OutMessage } from './outMessage.js'
import {
  playerScreen,
  seekBarOf,
  spokenLineOf,
  transcriptOf,
} from './screen.js'
import { transcriptDependenciesOf, transcriptStream } from './subscriptions.js'
import { transcriptsInMemory } from './transcript.js'
import { update } from './update.js'

const mediaId = MediaId.make('evocation')

const minuteMs = 60_000

const passageOf = (
  passageId: string,
  startMs: number,
  texts: ReadonlyArray<string>,
): Passage => ({
  passageId,
  startMs: Milliseconds.make(startMs),
  endMs: Milliseconds.make(startMs + texts.length * 1000),
  words: Array.map(texts, (text, index) => ({
    wordId: WordId.make(`${passageId}.${index.toString()}`),
    text,
    startMs: Milliseconds.make(startMs + index * 1000),
    endMs: Milliseconds.make(startMs + index * 1000 + 800),
  })),
})

const passages = [
  passageOf('a', 19_000, ['Evocation', 'Earth,', '114', 'million', 'years']),
  passageOf('b', 24_000, ['ago,', 'one', 'morning', 'just', 'after']),
]

const loaded = (placeMs = 0): Model =>
  update(
    init(
      {
        mediaId,
        durationMs: Milliseconds.make(10 * minuteMs),
        maybeAudioUrl: Option.some('https://audio.invalid/evocation.mp3'),
        sections: [
          {
            title: 'Evocation',
            startMs: Milliseconds.make(18_700),
            endMs: Milliseconds.make(24_000),
          },
          {
            title: 'The Purpose',
            startMs: Milliseconds.make(24_000),
            endMs: Milliseconds.make(10 * minuteMs),
          },
        ],
      },
      { placeMs: Milliseconds.make(placeMs) },
    ),
    ReceivedPassages({ passages }),
  )[0]

const run = (
  model: Model,
  ...messages: ReadonlyArray<Message>
): Readonly<{ model: Model; outs: ReadonlyArray<OutMessage> }> =>
  Array.reduce(
    messages,
    { model, outs: Array.empty<OutMessage>() },
    (state, message) => {
      const [next, , maybeOut] = update(state.model, message)
      return {
        model: next,
        outs: [...state.outs, ...Array.fromOption(maybeOut)],
      }
    },
  )

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

describe('the Transcript Player', () => {
  it('plays and pauses on p, and tells its holder where it stopped', () => {
    const paused = loaded(19_000)
    expect(keyed(paused, 'p')).toEqual(Option.some('Play'))
    const playing = pressed(paused, 'Play')
    expect(keyed(playing, 'p')).toEqual(Option.some('Pause'))
    const { model, outs } = run(
      playing,
      ReachedPlace({ placeMs: Milliseconds.make(21_000) }),
      ...Array.fromOption(Catalog.messageFor(catalog, playing, 'Pause')),
    )
    expect(model.transport._tag).toBe('Paused')
    expect(outs).toEqual([
      { _tag: 'Advanced', placeMs: 21_000 },
      { _tag: 'Stopped', placeMs: 21_000 },
    ])
  })

  it('plays from a word pressed in the transcript, and seeks anywhere', () => {
    const fromWord = pressed(loaded(), 'SeekToWord:b.2')
    expect(fromWord.placeMs).toBe(26_000)
    expect(fromWord.transport._tag).toBe('Playing')
    expect(pressed(loaded(), 'SeekTo:123000').placeMs).toBe(123_000)
    expect(pressed(loaded(), 'SeekTo:2m03s').placeMs).toBe(123_000)
    expect(pressed(loaded(), 'SeekTo:2:03').placeMs).toBe(123_000)
    expect(Catalog.messageFor(catalog, loaded(), 'SeekTo:900000')).toEqual(
      Option.none(),
    )
    expect(Catalog.messageFor(catalog, loaded(), 'SeekTo:1h00m00s')).toEqual(
      Option.none(),
    )
    expect(Catalog.messageFor(catalog, loaded(), 'SeekTo:soon')).toEqual(
      Option.none(),
    )
    expect(Catalog.messageFor(catalog, loaded(), 'SeekToWord:nowhere')).toEqual(
      Option.none(),
    )
  })

  it('stops as unplayable with the reason, and finishes at the end', () => {
    const playing = pressed(loaded(19_000), 'Play')
    const failed = run(
      playing,
      FailedPlayAudio({ reason: 'the audio file could not be reached' }),
    )
    expect(failed.model.transport).toEqual({
      _tag: 'Unplayable',
      reason: 'the audio file could not be reached',
    })
    expect(run(playing, ReachedEnd()).outs).toEqual([{ _tag: 'Finished' }])
  })

  it('says the words being spoken in one line, the one sounding bracketed', () => {
    expect(spokenLineOf(loaded(22_300))).toEqual(
      Option.some(
        'Evocation Earth, 114 [million] years ago, one morning just after',
      ),
    )
    expect(spokenLineOf(loaded(5_000))).toEqual(Option.none())
  })

  it('marks the word sounding and its passage, and paints it in a terminal', () => {
    const atMillion = loaded(22_300)
    const painted = renderScreen(
      playerScreen(atMillion, Catalog.entries(catalog, atMillion)),
      60,
    )
    expect(painted).toContain('[million]')
    expect(painted).toContain('EVOCATION')
    expect(painted).toContain('THE PURPOSE')
    expect(painted).toContain('›0:19')
    expect(painted).toContain(' 0:24   ago, one morning just after')
    const transcript = transcriptOf(atMillion)
    expect(
      transcript._tag === 'Transcript'
        ? Array.map(transcript.passages, passage => passage.isCurrent)
        : [],
    ).toEqual([true, false])
  })

  it('goes to the chapter start, then the one before, and on to the next', () => {
    const intoPurpose = loaded(30_000)
    expect(pressed(intoPurpose, 'PreviousSection').placeMs).toBe(24_000)
    expect(pressed(loaded(25_000), 'PreviousSection').placeMs).toBe(18_700)
    expect(pressed(loaded(19_000), 'NextSection').placeMs).toBe(24_000)
    expect(Catalog.messageFor(catalog, loaded(30_000), 'NextSection')).toEqual(
      Option.none(),
    )
  })

  it('spans the chapter on the seek bar until set to the whole recording', () => {
    const inEvocation = loaded(20_000)
    expect(inEvocation.seekScope).toBe('Section')
    expect(renderScreen(seekBarOf(inEvocation), 60)).toContain(
      '0:01 of 0:05 in Evocation',
    )
    const whole = pressed(inEvocation, 'SetSeekScope:Recording')
    expect(renderScreen(seekBarOf(whole), 60)).toContain('0:20 of 10:00')
  })

  it('reads the words around its window from the source', async () => {
    const received = await Effect.runPromise(
      transcriptStream(transcriptDependenciesOf(Option.some(loaded()))).pipe(
        Stream.runCollect,
        Effect.provide(transcriptsInMemory(new Map([[mediaId, passages]]))),
      ),
    )
    expect(
      Array.map(Array.fromIterable(received), message =>
        message._tag === 'ReceivedPassages' ? message.passages.length : -1,
      ),
    ).toEqual([2])
  })
})
