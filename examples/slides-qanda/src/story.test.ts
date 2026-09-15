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
import {
  AnswerLog,
  AnswerStamp,
  Deck,
  PropositionId,
  ShowAll,
  SlideId,
} from './domain'
import { update } from './main'
import {
  ChangedUrl,
  ClickedChoice,
  CompletedNavigateInternal,
  MissedFetchAnswer,
  PastedText,
  PressedExplore,
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
import {
  HomeRoute,
  SIM_ANSWER_ID,
  SimRoute,
  SlideRoute,
  slideHref,
  slideRouter,
} from './route'

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
  fileCache: {},
  answerLogs: [],
})

describe('update', () => {
  test('loading a deck on /sim stays on the sim page', () => {
    const sim = Model.make({
      route: SimRoute(),
      deckStatus: LoadingDeck(),
      saveStatus: SaveIdle(),
      maybePointerStartX: Option.none(),
      fileCache: {},
      answerLogs: [],
    })

    Story.story(
      update,
      Story.with(sim),
      Story.message(SucceededFetchDeck({ deck: sampleDeck })),
      Story.model(model => {
        expect(model.route._tag).toBe('Sim')
        expect(model.deckStatus._tag).toBe('Ready')
      }),
      Story.Command.expectExact(
        FetchAnswers(),
        FetchAnswer({ slideId: SIM_ANSWER_ID }),
      ),
      Story.Command.resolve(FetchAnswers, SucceededFetchAnswers({ logs: [] })),
      Story.Command.resolve(
        FetchAnswer,
        MissedFetchAnswer({ slideId: SIM_ANSWER_ID }),
      ),
    )
  })

  test('loading a two-slide deck from Home replaces to the first slide', () => {
    const home = Model.make({
      route: HomeRoute(),
      deckStatus: LoadingDeck(),
      saveStatus: SaveIdle(),
      maybePointerStartX: Option.none(),
      fileCache: {},
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

  test('pasting on /sim saves beat feedback to answers/sim.json', () => {
    const sim = Model.make({
      route: SimRoute(),
      deckStatus: ReadyDeck({ deck: sampleDeck }),
      saveStatus: SaveIdle(),
      maybePointerStartX: Option.none(),
      fileCache: {},
      answerLogs: [],
    })

    Story.story(
      update,
      Story.with(sim),
      Story.message(PastedText({ text: 'fee should sit with the bundle' })),
      Story.Command.expectExact(
        SaveAnswer({
          slideId: SIM_ANSWER_ID,
          text: 'fee should sit with the bundle',
          maybeExploreScope: Option.none(),
          asNote: false,
        }),
      ),
      Story.Command.resolve(
        SaveAnswer,
        SucceededSaveAnswer({
          log: AnswerLog.make({
            slideId: SIM_ANSWER_ID,
            answers: [
              AnswerStamp.make({
                at: '2026-09-09T13:00:00-04:00',
                verbatim: 'fee should sit with the bundle',
                cleaned: '',
              }),
            ],
          }),
        }),
      ),
      Story.model(model => {
        expect(model.route._tag).toBe('Sim')
        expect(model.saveStatus).toStrictEqual(
          SaveOk({ preview: 'fee should sit with the bundle' }),
        )
      }),
      Story.Command.expectNone(),
    )
  })

  test('a second paste on /sim stays on sim and saves again', () => {
    Story.story(
      update,
      Story.with(
        Model.make({
          route: SimRoute(),
          deckStatus: ReadyDeck({ deck: sampleDeck }),
          saveStatus: SaveIdle(),
          maybePointerStartX: Option.none(),
          fileCache: {},
          answerLogs: [
            AnswerLog.make({
              slideId: SIM_ANSWER_ID,
              answers: [
                AnswerStamp.make({
                  at: '2026-09-09T13:00:00-04:00',
                  verbatim: 'fee should sit with the bundle',
                  cleaned: '',
                }),
              ],
            }),
          ],
        }),
      ),
      Story.message(PastedText({ text: 'stake is the second payment' })),
      Story.Command.expectExact(
        SaveAnswer({
          slideId: SIM_ANSWER_ID,
          text: 'stake is the second payment',
          maybeExploreScope: Option.none(),
          asNote: true,
        }),
      ),
      Story.Command.resolve(
        SaveAnswer,
        SucceededSaveAnswer({
          log: AnswerLog.make({
            slideId: SIM_ANSWER_ID,
            answers: [
              AnswerStamp.make({
                at: '2026-09-09T13:00:00-04:00',
                verbatim: 'fee should sit with the bundle',
                cleaned: '',
                notes: [
                  {
                    at: '2026-09-09T13:05:00-04:00',
                    verbatim: 'stake is the second payment',
                    cleaned: '',
                  },
                ],
              }),
            ],
          }),
        }),
      ),
      Story.model(model => {
        expect(model.route._tag).toBe('Sim')
        expect(model.saveStatus).toStrictEqual(
          SaveOk({ preview: 'stake is the second payment' }),
        )
      }),
      Story.Command.expectNone(),
    )
  })

  test('pasting A on a slide saves the answer', () => {
    Story.story(
      update,
      Story.with(onSlide01),
      Story.message(PastedText({ text: 'A' })),
      Story.Command.expectExact(
        SaveAnswer({
          slideId: SlideId.make('01'),
          text: 'A',
          maybeExploreScope: Option.none(),
          asNote: false,
        }),
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

  test('a second paste on a locked card stays on the card', () => {
    Story.story(
      update,
      Story.with(
        Model.make({
          route: SlideRoute({ slideId: SlideId.make('01') }),
          deckStatus: ReadyDeck({ deck: sampleDeck }),
          saveStatus: SaveIdle(),
          maybePointerStartX: Option.none(),
          fileCache: {},
          answerLogs: [savedA],
        }),
      ),
      Story.message(PastedText({ text: 'also cli/custom/rs' })),
      Story.Command.expectExact(
        SaveAnswer({
          slideId: SlideId.make('01'),
          text: 'also cli/custom/rs',
          maybeExploreScope: Option.none(),
          asNote: true,
        }),
      ),
      Story.Command.resolve(
        SaveAnswer,
        SucceededSaveAnswer({
          log: AnswerLog.make({
            slideId: SlideId.make('01'),
            answers: [
              AnswerStamp.make({
                at: '2026-09-07T16:00:00-04:00',
                verbatim: 'A',
                cleaned: '',
                notes: [
                  {
                    at: '2026-09-08T14:05:00-04:00',
                    verbatim: 'also cli/custom/rs',
                    cleaned: '',
                  },
                ],
              }),
            ],
          }),
        }),
      ),
      Story.model(model => {
        expect(model.route._tag).toBe('Slide')
        if (model.route._tag === 'Slide') {
          expect(model.route.slideId).toBe('01')
        }
        expect(model.saveStatus).toStrictEqual(
          SaveOk({ preview: 'also cli/custom/rs' }),
        )
      }),
      Story.Command.expectNone(),
    )
  })

  test('clicking B saves B', () => {
    Story.story(
      update,
      Story.with(onSlide01),
      Story.message(ClickedChoice({ letter: 'B' })),
      Story.Command.expectExact(
        SaveAnswer({
          slideId: SlideId.make('01'),
          text: 'B',
          maybeExploreScope: Option.none(),
          asNote: false,
        }),
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
      fileCache: {},
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

const exploreDeck = S.decodeUnknownSync(Deck)({
  title: 'DEATH',
  roots: [
    {
      id: '04h',
      title: 'WHAT DOES THE START STRING NAME?',
      mapLines: ['string'],
      story: 'The hospital sends start plus a string.',
      question: 'What does the start string name?',
      options: [
        { letter: 'A', text: 'device/framework/language' },
        { letter: 'B', text: 'Homework' },
        { letter: 'C', text: 'Bundle names' },
      ],
      prompt: 'Paste A, B, or C.',
      propositions: [
        {
          id: 'show',
          title: 'SHOW START',
          markdown: '# show',
        },
        {
          id: 'ios-expo',
          title: 'EXPO IOS',
          markdown: '# expo',
        },
      ],
      followUps: [],
    },
    {
      id: '05',
      title: 'WHEN TO SCORE?',
      mapLines: ['score'],
      story: 'Alice yields.',
      question: 'When to score?',
      options: [
        { letter: 'A', text: 'After yield' },
        { letter: 'B', text: 'Always' },
        { letter: 'C', text: 'Never' },
      ],
      prompt: 'Paste A, B, or C.',
      followUps: [],
    },
  ],
})

const onExplore04h = Model.make({
  route: SlideRoute({ slideId: SlideId.make('04h') }),
  deckStatus: ReadyDeck({ deck: exploreDeck }),
  saveStatus: SaveIdle(),
  maybePointerStartX: Option.none(),
  fileCache: {},
  answerLogs: [],
})

describe('explore update', () => {
  test('E leaves explore and drops the explore query', () => {
    Story.story(
      update,
      Story.with(
        Model.make({
          route: SlideRoute({
            slideId: SlideId.make('04h'),
            explore: PropositionId.make('show'),
          }),
          deckStatus: ReadyDeck({ deck: exploreDeck }),
          saveStatus: SaveIdle(),
          maybePointerStartX: Option.none(),
          fileCache: {},
          answerLogs: [],
        }),
      ),
      Story.message(PressedExplore()),
      Story.Command.expectExact(
        NavigateInternal({
          url: slideHref(SlideId.make('04h'), ShowAll()),
        }),
      ),
      Story.Command.resolve(NavigateInternal, CompletedNavigateInternal()),
    )
  })

  test('a deep link opens that explore step', () => {
    Story.story(
      update,
      Story.with(onExplore04h),
      Story.message(
        ChangedUrl({
          url: urlOrThrow(
            `http://localhost${slideHref(
              SlideId.make('04h'),
              ShowAll(),
              Option.some(PropositionId.make('ios-expo')),
            )}`,
          ),
        }),
      ),
      Story.model(model => {
        expect(model.route._tag).toBe('Slide')
        if (model.route._tag === 'Slide') {
          expect(model.route.slideId).toBe('04h')
          expect(model.route.explore).toBe('ios-expo')
        }
      }),
      Story.Command.expectExact(
        FetchAnswers(),
        FetchAnswer({ slideId: SlideId.make('04h') }),
      ),
      Story.Command.resolve(FetchAnswers, SucceededFetchAnswers({ logs: [] })),
      Story.Command.resolve(
        FetchAnswer,
        MissedFetchAnswer({ slideId: SlideId.make('04h') }),
      ),
    )
  })

  test('E enters the first proposition on this card', () => {
    Story.story(
      update,
      Story.with(onExplore04h),
      Story.message(PressedExplore()),
      Story.Command.expectExact(
        NavigateInternal({
          url: slideHref(
            SlideId.make('04h'),
            ShowAll(),
            Option.some(PropositionId.make('show')),
          ),
        }),
      ),
      Story.Command.resolve(NavigateInternal, CompletedNavigateInternal()),
    )
  })

  test('arrow right in explore walks propositions and does not change slide', () => {
    Story.story(
      update,
      Story.with(
        Model.make({
          route: SlideRoute({
            slideId: SlideId.make('04h'),
            explore: PropositionId.make('show'),
          }),
          deckStatus: ReadyDeck({ deck: exploreDeck }),
          saveStatus: SaveIdle(),
          maybePointerStartX: Option.none(),
          fileCache: {},
          answerLogs: [],
        }),
      ),
      Story.message(PressedTurn({ turn: 'Next' })),
      Story.Command.expectExact(
        NavigateInternal({
          url: slideHref(
            SlideId.make('04h'),
            ShowAll(),
            Option.some(PropositionId.make('ios-expo')),
          ),
        }),
      ),
      Story.Command.resolve(NavigateInternal, CompletedNavigateInternal()),
    )
  })

  test('paste in explore saves a note for the whole explorer', () => {
    Story.story(
      update,
      Story.with(
        Model.make({
          route: SlideRoute({
            slideId: SlideId.make('04h'),
            explore: PropositionId.make('ios-expo'),
          }),
          deckStatus: ReadyDeck({ deck: exploreDeck }),
          saveStatus: SaveIdle(),
          maybePointerStartX: Option.none(),
          fileCache: {},
          answerLogs: [],
        }),
      ),
      Story.message(PastedText({ text: 'ios/expo/ts looks right' })),
      Story.Command.expectExact(
        SaveAnswer({
          slideId: SlideId.make('04h'),
          text: 'ios/expo/ts looks right',
          maybeExploreScope: Option.some('explore'),
          asNote: false,
        }),
      ),
      Story.Command.resolve(
        SaveAnswer,
        SucceededSaveAnswer({
          log: AnswerLog.make({
            slideId: SlideId.make('04h'),
            answers: [],
            explores: [
              {
                at: '2026-09-08T13:00:00-04:00',
                verbatim: 'ios/expo/ts looks right',
                cleaned: '',
                scope: 'explore',
              },
            ],
          }),
        }),
      ),
      Story.model(model => {
        expect(model.route._tag).toBe('Slide')
        if (model.route._tag === 'Slide') {
          expect(model.route.slideId).toBe('04h')
          expect(model.route.explore).toBe('ios-expo')
        }
      }),
      Story.Command.expectNone(),
    )
  })
})
