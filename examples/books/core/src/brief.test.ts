import { Option } from 'effect'
import { Interaction } from 'foldkit'
import { renderScreen } from 'foldkit/renderers'
import {
  ReachedPlace,
  ReceivedPassages,
  WordId,
} from 'transcript-player-core-example'
import { describe, expect, it } from 'vitest'

import { App, type AppModel } from './app.js'
import { briefScreen, suggestedPressesOf } from './brief.js'
import { Milliseconds, TitleSlug } from './ids.js'
import { OpenedPlace, ReceivedShelf } from './message.js'
import { InProgress } from './model.js'
import { sampleShelf } from './sample.js'
import { addressCueOfModel } from './subscriptions.js'

const lanternKeeper = TitleSlug.make('the-lantern-keeper')

const bindApp = (shelf = sampleShelf) => {
  let model: AppModel = App.update(App.init()[0], ReceivedShelf({ shelf }))[0]
  const handle = {
    readModel: () => model,
    subscribe: () => () => {},
    send: (message: typeof App.Message.Type) => {
      model = App.update(model, message)[0]
      Option.map(addressCueOfModel(model), cue => {
        handle.send(OpenedPlace(cue))
      })
    },
    stop: () => Promise.resolve(),
  }
  return { bound: Interaction.bind(App, handle), send: handle.send }
}

const briefOf = (bound: ReturnType<typeof bindApp>['bound']) =>
  renderScreen(briefScreen(bound.readModel()))
    .split('\n')
    .map(line => line.trimEnd())

const words = ['the', 'keeper', 'climbed', 'the', 'stairs', 'at', 'dusk']

describe('the brief', () => {
  it('says what is playing, where it is, and the words being spoken', () => {
    const { bound, send } = bindApp()
    bound.press(`Listen:${lanternKeeper}`)
    send(
      ReceivedPassages({
        passages: [
          {
            passageId: 'p1',
            startMs: Milliseconds.make(30_000),
            endMs: Milliseconds.make(37_000),
            words: words.map((text, index) => ({
              wordId: WordId.make(`w${index.toString()}`),
              text,
              startMs: Milliseconds.make(30_000 + index * 1000),
              endMs: Milliseconds.make(30_800 + index * 1000),
            })),
          },
        ],
      }),
    )
    send(ReachedPlace({ placeMs: Milliseconds.make(32_400) }))
    expect(briefOf(bound)).toEqual([
      '▶ Playing The Lantern Keeper',
      'The Tide · 0:32 of 1:20:00 · 1h 19m left',
      '“the keeper [climbed] the stairs at dusk”',
    ])
  })

  it('suggests pausing, skipping, a place, a bookmark, and other titles while one plays', () => {
    const { bound } = bindApp()
    bound.press(`Listen:${lanternKeeper}`)
    expect(suggestedPressesOf(bound.readModel())).toEqual([
      'Pause',
      'SkipBack',
      'SkipForward',
      'NextSection',
      'SeekTo:1h00m00s',
      'AddBookmark',
      'Listen:small-hours',
      'Listen:a-field-guide-to-weather',
    ])
    bound.press('Pause')
    expect(Option.fromNullishOr(briefOf(bound)[0])).toEqual(
      Option.some('❚❚ Paused The Lantern Keeper'),
    )
    expect(suggestedPressesOf(bound.readModel())[0]).toBe('Play')
  })

  it('says nothing plays and suggests the title to continue first', () => {
    const { bound } = bindApp({
      ...sampleShelf,
      progress: [
        InProgress({
          slug: TitleSlug.make('small-hours'),
          placeMs: Milliseconds.make(723_000),
          savedAtMs: 1,
        }),
      ],
    })
    expect(briefOf(bound)).toEqual([
      'Nothing is playing.',
      'Continue Small Hours: One · 12:03 of 1:00:00 · 48m left',
    ])
    expect(suggestedPressesOf(bound.readModel())).toEqual([
      'Listen:small-hours',
      'Listen:the-lantern-keeper',
      'Listen:a-field-guide-to-weather',
    ])
  })
})
