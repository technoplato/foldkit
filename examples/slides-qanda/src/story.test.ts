import { Option, Schema as S } from 'effect'
import { Story } from 'foldkit'
import { fromString } from 'foldkit/url'
import { describe, expect, test } from 'vitest'

import {
  FetchAnswer,
  FetchAnswers,
  NavigateInternal,
  ReplaceInternal,
  SaveAnswer,
  SaveDeck,
} from './command'
import { AnswerLog, AnswerStamp, Deck, SlideId } from './domain'
import { update } from './main'
import {
  ChangedUrl,
  ClickedChoice,
  CompletedNavigateInternal,
  MissedFetchAnswer,
  PastedText,
  PressedTurn,
  SucceededFetchAnswers,
  SucceededFetchDeck,
  SucceededSaveAnswer,
  SucceededSaveDeck,
} from './message'
import {
  LoadingDeck,
  MissingDeck,
  Model,
  ReadyDeck,
  SaveIdle,
  SaveOk,
} from './model'
import { HomeRoute, SlideRoute, slideRouter } from './route'

const urlOrThrow = (raw: string) =>
  Option.getOrThrowWith(
    fromString(raw),
    () => new Error(`Failed to parse url: ${raw}`),
  )

const sampleDeck = S.decodeUnknownSync(Deck)({
  title: 'DEATH',
  roots: [
    {
      id: '01',
      title: 'WHO PLAYS?',
      mapLines: ['PAY WRITE READY POKE', 'fail = 0'],
      story: 'Alice pays. Dave pokes.',
      question: 'Is this the game?',
      options: [
        { letter: 'A', text: 'Yes' },
        { letter: 'B', text: 'Skip pay' },
        { letter: 'C', text: 'No contest' },
      ],
      prompt: 'Paste A, B, or C.',
      followUps: [],
    },
    {
      id: '02',
      title: 'HOW DOES DAVE POKE?',
      mapLines: ['ONE poke list'],
      story: 'Alice Foldkit. Bob Swift.',
      question: 'What does Dave send?',
      options: [
        { letter: 'A', text: 'Messages' },
        { letter: 'B', text: 'URLs' },
        { letter: 'C', text: 'show plus minus' },
      ],
      prompt: 'Paste A, B, or C.',
      followUps: [],
    },
  ],
})

const savedA = AnswerLog.make({
  slideId: SlideId.make('01'),
  answers: [
    AnswerStamp.make({
      at: '2026-09-07T16:00:00-04:00',
      verbatim: 'A',
      cleaned: '',
    }),
  ],
})

const savedB = AnswerLog.make({
  slideId: SlideId.make('01'),
  answers: [
    AnswerStamp.make({
      at: '2026-09-07T16:00:00-04:00',
      verbatim: 'B',
      cleaned: '',
    }),
  ],
})

const onSlide01 = Model.make({
  route: SlideRoute({ slideId: SlideId.make('01') }),
  deckStatus: ReadyDeck({ deck: sampleDeck }),
  saveStatus: SaveIdle(),
  maybePointerStartX: Option.none(),
  answerLogs: [],
})

describe('update', () => {
  test('loading a two-slide deck from Home replaces to the first slide', () => {
    const home = Model.make({
      route: HomeRoute(),
      deckStatus: LoadingDeck(),
      saveStatus: SaveIdle(),
      maybePointerStartX: Option.none(),
      answerLogs: [],
    })

    Story.story(
      update,
      Story.with(home),
      Story.message(SucceededFetchDeck({ deck: sampleDeck })),
      Story.model(model => {
        expect(model.deckStatus._tag).toBe('Ready')
      }),
      Story.Command.expectExact(
        ReplaceInternal({ url: slideRouter({ slideId: SlideId.make('01') }) }),
      ),
      Story.Command.resolve(ReplaceInternal, CompletedNavigateInternal()),
    )
  })

  test('arrow right on 01 navigates to 02', () => {
    Story.story(
      update,
      Story.with(onSlide01),
      Story.message(PressedTurn({ turn: 'Next' })),
      Story.Command.expectExact(
        NavigateInternal({ url: slideRouter({ slideId: SlideId.make('02') }) }),
      ),
      Story.Command.resolve(NavigateInternal, CompletedNavigateInternal()),
    )
  })

  test('pasting A on a slide saves the answer', () => {
    Story.story(
      update,
      Story.with(onSlide01),
      Story.message(PastedText({ text: 'A' })),
      Story.Command.expectExact(
        SaveAnswer({ slideId: SlideId.make('01'), text: 'A' }),
      ),
      Story.Command.resolve(
        SaveAnswer,
        SucceededSaveAnswer({
          log: savedA,
        }),
      ),
      Story.model(model => {
        expect(model.saveStatus).toStrictEqual(SaveOk({ preview: 'A' }))
      }),
      Story.Command.expectExact(
        NavigateInternal({ url: slideRouter({ slideId: SlideId.make('02') }) }),
      ),
      Story.Command.resolve(NavigateInternal, CompletedNavigateInternal()),
    )
  })

  test('clicking B saves B', () => {
    Story.story(
      update,
      Story.with(onSlide01),
      Story.message(ClickedChoice({ letter: 'B' })),
      Story.Command.expectExact(
        SaveAnswer({ slideId: SlideId.make('01'), text: 'B' }),
      ),
      Story.Command.resolve(
        SaveAnswer,
        SucceededSaveAnswer({
          log: savedB,
        }),
      ),
      Story.Command.expectExact(
        NavigateInternal({ url: slideRouter({ slideId: SlideId.make('02') }) }),
      ),
      Story.Command.resolve(NavigateInternal, CompletedNavigateInternal()),
    )
  })

  test('changing to /q/02 fetches that answer', () => {
    Story.story(
      update,
      Story.with(onSlide01),
      Story.message(ChangedUrl({ url: urlOrThrow('http://localhost/q/02') })),
      Story.model(model => {
        expect(model.route._tag).toBe('Slide')
        if (model.route._tag === 'Slide') {
          expect(model.route.slideId).toBe('02')
        }
      }),
      Story.Command.expectExact(
        FetchAnswers(),
        FetchAnswer({ slideId: SlideId.make('02') }),
      ),
      Story.Command.resolve(FetchAnswers, SucceededFetchAnswers({ logs: [] })),
      Story.Command.resolve(
        FetchAnswer,
        MissedFetchAnswer({ slideId: SlideId.make('02') }),
      ),
    )
  })

  test('pasting a deck JSON writes the deck and opens the first slide', () => {
    const pastedDeck = S.decodeUnknownSync(Deck)({
      title: 'NEW',
      roots: [
        {
          id: 'hello',
          title: 'HELLO',
          mapLines: ['One line'],
          story: 'A new deck.',
          question: 'Is JSON the source?',
          options: [
            { letter: 'A', text: 'Yes' },
            { letter: 'B', text: 'No' },
            { letter: 'C', text: 'Hardcoded' },
          ],
          prompt: 'Paste A, B, or C.',
          followUps: [],
        },
      ],
    })

    Story.story(
      update,
      Story.with(onSlide01),
      Story.message(PastedText({ text: JSON.stringify(pastedDeck) })),
      Story.Command.expectExact(SaveDeck({ deck: pastedDeck })),
      Story.Command.resolve(SaveDeck, SucceededSaveDeck({ deck: pastedDeck })),
      Story.model(model => {
        expect(model.deckStatus._tag).toBe('Ready')
        if (model.deckStatus._tag === 'Ready') {
          expect(model.deckStatus.deck.title).toBe('NEW')
        }
      }),
      Story.Command.expectExact(
        ReplaceInternal({
          url: slideRouter({ slideId: SlideId.make('hello') }),
        }),
      ),
      Story.Command.resolve(ReplaceInternal, CompletedNavigateInternal()),
    )
  })

  test('a URL that is not in the deck replaces to the first slide', () => {
    Story.story(
      update,
      Story.with(onSlide01),
      Story.message(
        ChangedUrl({ url: urlOrThrow('http://localhost/q/hello') }),
      ),
      Story.Command.expectExact(
        ReplaceInternal({
          url: slideRouter({ slideId: SlideId.make('01') }),
        }),
      ),
      Story.Command.resolve(ReplaceInternal, CompletedNavigateInternal()),
    )
  })

  test('pasting a JSON object that is not a deck shows the Schema path', () => {
    Story.story(
      update,
      Story.with(onSlide01),
      Story.message(PastedText({ text: '{"title":"DEATH"}' })),
      Story.model(model => {
        expect(model.deckStatus._tag).toBe('Error')
        if (model.deckStatus._tag === 'Error') {
          expect(model.deckStatus.error).toContain('This JSON is not a deck.')
          expect(model.deckStatus.error).toContain('roots')
        }
      }),
    )
  })

  test('empty deck JSON is missing, not ready', () => {
    const home = Model.make({
      route: HomeRoute(),
      deckStatus: LoadingDeck(),
      saveStatus: SaveIdle(),
      maybePointerStartX: Option.none(),
      answerLogs: [],
    })

    Story.story(
      update,
      Story.with(home),
      Story.message(
        SucceededFetchDeck({ deck: { title: 'Empty', roots: [] } }),
      ),
      Story.model(model => {
        expect(model.deckStatus).toStrictEqual(MissingDeck())
      }),
    )
  })
})
