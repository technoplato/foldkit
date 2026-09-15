import { Option, Schema as S } from 'effect'
import { Scene } from 'foldkit'
import { describe, test } from 'vitest'

import {
  AnswerLog,
  AnswerStamp,
  Deck,
  PropositionId,
  SlideId,
} from './domain'
import { update, view } from './main'
import { Model, ReadyDeck, SaveIdle, SaveOk } from './model'
import { SIM_ANSWER_ID, SimRoute, SlideRoute } from './route'

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
        {
          letter: 'A',
          text: 'Yes. Pay, write, READY, poke. Fail poke = 0.',
        },
        { letter: 'B', text: 'Skip pay. Just poke Foldkit Counter.' },
        { letter: 'C', text: 'No contest. Local score sheet only.' },
      ],
      prompt: 'Paste A, B, C, or a sentence.',
      followUps: [],
    },
  ],
})

const sampleModel = Model.make({
  route: SlideRoute({ slideId: SlideId.make('01') }),
  deckStatus: ReadyDeck({
    deck: sampleDeck,
  }),
  saveStatus: SaveIdle(),
  maybePointerStartX: Option.none(),
  fileCache: {},
  answerLogs: [],
})

describe('view', () => {
  test('the question slide shows the map, story, and choices', () => {
    Scene.scene(
      { update, view },
      Scene.with(sampleModel),
      Scene.expect(Scene.role('heading', { name: 'WHO PLAYS?' })).toExist(),
      Scene.expect(Scene.text('Is this the game?')).toExist(),
      Scene.expect(Scene.text('Alice pays. Dave pokes.')).toExist(),
      Scene.expect(Scene.selector('pre')).toHaveClass('whitespace-pre-wrap'),
      Scene.expect(Scene.selector('pre')).toHaveClass('break-words'),
      Scene.expect(
        Scene.role('button', {
          name: 'A. Yes. Pay, write, READY, poke. Fail poke = 0.',
        }),
      ).toExist(),
      Scene.expect(
        Scene.role('button', { name: 'Follow-up below. Press down.' }),
      ).not.toExist(),
    )
  })

  test('a root with a follow-up shows the bottom glow', () => {
    const withChild = S.decodeUnknownSync(Deck)({
      title: 'DEATH',
      roots: [
        {
          id: '03',
          title: 'MONEY IN V1?',
          mapLines: ['live'],
          story: 'Alice prepays.',
          question: 'Is money live?',
          options: [
            { letter: 'A', text: 'Paper' },
            { letter: 'B', text: 'Bank' },
            { letter: 'C', text: 'Ledger' },
          ],
          prompt: 'Paste A, B, or C.',
          followUps: [
            {
              id: '03a',
              title: 'LIVE HOW?',
              mapLines: ['bank or ledger'],
              story: 'Dave asks how live.',
              question: 'Real bank?',
              options: [
                { letter: 'A', text: 'Bank' },
                { letter: 'B', text: 'Ledger' },
                { letter: 'C', text: 'Paper' },
              ],
              prompt: 'Paste A, B, or C.',
            },
          ],
        },
      ],
    })

    Scene.scene(
      { update, view },
      Scene.with(
        Model.make({
          route: SlideRoute({ slideId: SlideId.make('03') }),
          deckStatus: ReadyDeck({ deck: withChild }),
          saveStatus: SaveIdle(),
          maybePointerStartX: Option.none(),
          fileCache: {},
          answerLogs: [],
        }),
      ),
      Scene.expect(
        Scene.role('button', { name: 'Follow-up below. Press down.' }),
      ).toExist(),
    )
  })

  test('an unanswered last follow-up still shows the bottom glow', () => {
    const withChild = S.decodeUnknownSync(Deck)({
      title: 'DEATH',
      roots: [
        {
          id: '03',
          title: 'MONEY IN V1?',
          mapLines: ['live'],
          story: 'Alice prepays.',
          question: 'Is money live?',
          options: [
            { letter: 'A', text: 'Paper' },
            { letter: 'B', text: 'Bank' },
            { letter: 'C', text: 'Ledger' },
          ],
          prompt: 'Paste A, B, or C.',
          followUps: [
            {
              id: '03a',
              title: 'LIVE HOW?',
              mapLines: ['bank or ledger'],
              story: 'Dave asks how live.',
              question: 'Real bank?',
              options: [
                { letter: 'A', text: 'Bank' },
                { letter: 'B', text: 'Ledger' },
                { letter: 'C', text: 'Paper' },
              ],
              prompt: 'Paste A, B, or C.',
            },
          ],
        },
      ],
    })

    Scene.scene(
      { update, view },
      Scene.with(
        Model.make({
          route: SlideRoute({ slideId: SlideId.make('03a') }),
          deckStatus: ReadyDeck({ deck: withChild }),
          saveStatus: SaveIdle(),
          maybePointerStartX: Option.none(),
          fileCache: {},
          answerLogs: [],
        }),
      ),
      Scene.expect(
        Scene.role('button', { name: 'Follow-up below. Press down.' }),
      ).toExist(),
    )
  })

  test('the glow hides only after every follow-up has a stamp', () => {
    const withChild = S.decodeUnknownSync(Deck)({
      title: 'DEATH',
      roots: [
        {
          id: '03',
          title: 'MONEY IN V1?',
          mapLines: ['live'],
          story: 'Alice prepays.',
          question: 'Is money live?',
          options: [
            { letter: 'A', text: 'Paper' },
            { letter: 'B', text: 'Bank' },
            { letter: 'C', text: 'Ledger' },
          ],
          prompt: 'Paste A, B, or C.',
          followUps: [
            {
              id: '03a',
              title: 'LIVE HOW?',
              mapLines: ['bank or ledger'],
              story: 'Dave asks how live.',
              question: 'Real bank?',
              options: [
                { letter: 'A', text: 'Bank' },
                { letter: 'B', text: 'Ledger' },
                { letter: 'C', text: 'Paper' },
              ],
              prompt: 'Paste A, B, or C.',
            },
          ],
        },
      ],
    })

    Scene.scene(
      { update, view },
      Scene.with(
        Model.make({
          route: SlideRoute({ slideId: SlideId.make('03a') }),
          deckStatus: ReadyDeck({ deck: withChild }),
          saveStatus: SaveIdle(),
          maybePointerStartX: Option.none(),
          fileCache: {},
          answerLogs: [
            {
              slideId: SlideId.make('03a'),
              answers: [
                {
                  at: '2026-09-07T17:00:00-04:00',
                  verbatim: 'A',
                  cleaned: 'A',
                },
              ],
            },
          ],
        }),
      ),
      Scene.expect(
        Scene.role('button', { name: 'Follow-up below. Press down.' }),
      ).not.toExist(),
    )
  })

  test('OPEN with no unanswered cards shows NONE OPEN', () => {
    Scene.scene(
      { update, view },
      Scene.with(
        Model.make({
          route: SlideRoute({
            slideId: SlideId.make('01'),
            filter: 'Unanswered',
          }),
          deckStatus: ReadyDeck({ deck: sampleDeck }),
          saveStatus: SaveIdle(),
          maybePointerStartX: Option.none(),
          fileCache: {},
          answerLogs: [
            {
              slideId: SlideId.make('01'),
              answers: [
                {
                  at: '2026-09-07T17:00:00-04:00',
                  verbatim: 'A',
                  cleaned: 'A',
                },
              ],
            },
          ],
        }),
      ),
      Scene.expect(Scene.role('heading', { name: 'NONE OPEN' })).toExist(),
      Scene.expect(Scene.text('Is this the game?')).not.toExist(),
      Scene.expect(Scene.text('No cards in OPEN. Press f for the next filter.')).toExist(),
    )
  })

  test('an answered slide shows the saved footer while idle', () => {
    Scene.scene(
      { update, view },
      Scene.with(
        Model.make({
          route: SlideRoute({ slideId: SlideId.make('01') }),
          deckStatus: ReadyDeck({ deck: sampleDeck }),
          saveStatus: SaveIdle(),
          maybePointerStartX: Option.none(),
          fileCache: {},
          answerLogs: [
            {
              slideId: SlideId.make('01'),
              answers: [
                {
                  at: '2026-09-07T17:00:00-04:00',
                  verbatim: 'Pay 20 is the attempt',
                  cleaned: 'B. Pay is Alice attempt. Agents yield.',
                },
              ],
            },
          ],
        }),
      ),
      Scene.expect(
        Scene.role('button', {
          name: 'Saved answer. Paste again to add a note. Hover or focus to read the full text.',
        }),
      ).toExist(),
      Scene.expect(
        Scene.text('Saved: B. Pay is Alice attempt. Agents yield.'),
      ).toExist(),
      Scene.expect(Scene.text('Paste again to add a note.')).toExist(),
      Scene.expect(Scene.text('Said: Pay 20 is the attempt')).toExist(),
    )
  })

  test('a saved note stays under the first verbatim', () => {
    Scene.scene(
      { update, view },
      Scene.with(
        Model.make({
          route: SlideRoute({ slideId: SlideId.make('01') }),
          deckStatus: ReadyDeck({ deck: sampleDeck }),
          saveStatus: SaveIdle(),
          maybePointerStartX: Option.none(),
          fileCache: {},
          answerLogs: [
            {
              slideId: SlideId.make('01'),
              answers: [
                {
                  at: '2026-09-07T17:00:00-04:00',
                  verbatim: 'A',
                  cleaned: 'A',
                  notes: [
                    {
                      at: '2026-09-08T14:05:00-04:00',
                      verbatim: 'also cli/custom/rs',
                      cleaned: '',
                    },
                  ],
                },
              ],
            },
          ],
        }),
      ),
      Scene.expect(Scene.text('Said: A')).toExist(),
      Scene.expect(Scene.text('Note: also cli/custom/rs')).toExist(),
      Scene.expect(Scene.text('Saved: A')).toExist(),
      Scene.expect(Scene.text('Paste again to add a note.')).toExist(),
    )
  })
})

const exploreDeck = S.decodeUnknownSync(Deck)({
  title: 'DEATH',
  roots: [
    {
      id: '04h',
      title: 'WHAT DOES THE START STRING NAME?',
      mapLines: ['Start always starts a new device.'],
      story: 'The hospital sends start plus a string.',
      question: 'What does the start string name?',
      options: [
        { letter: 'A', text: 'device/framework/language' },
        { letter: 'B', text: 'Homework list' },
        { letter: 'C', text: 'Bundle names' },
      ],
      prompt: 'Paste A, B, C, or a sentence.',
      propositions: [
        {
          id: 'show',
          title: 'SHOW START',
          markdown: 'The program prints the count.',
        },
        {
          id: 'ios-expo',
          title: 'EXPO IOS',
          markdown: 'The start string is ios/expo/ts.',
        },
        {
          id: 'cli-print',
          title: 'CLI PRINT',
          markdown:
            '```text\nStdin is the hospital writing lines to the process.\n```',
        },
      ],
      followUps: [],
    },
  ],
})

describe('explore view', () => {
  test('E on 04h shows the first proposition, not the A/B/C card', () => {
    Scene.scene(
      { update, view },
      Scene.with(
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
      Scene.expect(Scene.role('heading', { name: 'SHOW START' })).toExist(),
      Scene.expect(Scene.text('The program prints the count.')).toExist(),
      Scene.expect(Scene.text('Paste feedback for this explore')).toExist(),
      Scene.expect(Scene.text('What does the start string name?')).not.toExist(),
      Scene.expect(
        Scene.role('button', { name: 'A. device/framework/language' }),
      ).not.toExist(),
    )
  })

  test('explore Next stays on 04h and opens the next proposition', () => {
    Scene.scene(
      { update, view },
      Scene.with(
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
      Scene.expect(Scene.role('heading', { name: 'EXPO IOS' })).toExist(),
      Scene.expect(Scene.text('The start string is ios/expo/ts.')).toExist(),
      Scene.expect(
        Scene.role('heading', { name: 'WHAT DOES THE START STRING NAME?' }),
      ).not.toExist(),
    )
  })

  test('a zinc explore fence wraps long lines', () => {
    Scene.scene(
      { update, view },
      Scene.with(
        Model.make({
          route: SlideRoute({
            slideId: SlideId.make('04h'),
            explore: PropositionId.make('cli-print'),
          }),
          deckStatus: ReadyDeck({ deck: exploreDeck }),
          saveStatus: SaveIdle(),
          maybePointerStartX: Option.none(),
          fileCache: {},
          answerLogs: [],
        }),
      ),
      Scene.expect(Scene.role('heading', { name: 'CLI PRINT' })).toExist(),
      Scene.expect(
        Scene.text('Stdin is the hospital writing lines to the process.'),
      ).toExist(),
      Scene.expect(Scene.selector('pre')).toHaveClass('whitespace-pre-wrap'),
      Scene.expect(Scene.selector('pre')).toHaveClass('break-words'),
    )
  })

  test('OPEN still shows 04h when only explore notes exist', () => {
    Scene.scene(
      { update, view },
      Scene.with(
        Model.make({
          route: SlideRoute({
            slideId: SlideId.make('04h'),
            filter: 'Unanswered',
          }),
          deckStatus: ReadyDeck({ deck: exploreDeck }),
          saveStatus: SaveIdle(),
          maybePointerStartX: Option.none(),
          fileCache: {},
          answerLogs: [
            {
              slideId: SlideId.make('04h'),
              answers: [],
              explores: [
                {
                  at: '2026-09-08T13:00:00-04:00',
                  verbatim: 'ios/expo/ts',
                  cleaned: '',
                  scope: 'explore',
                },
              ],
            },
          ],
        }),
      ),
      Scene.expect(
        Scene.role('heading', { name: 'WHAT DOES THE START STRING NAME?' }),
      ).toExist(),
      Scene.expect(Scene.role('heading', { name: 'NONE OPEN' })).not.toExist(),
    )
  })
})

describe('sim view', () => {
  test('the sim page shows the first-beat submit ASCII', () => {
    Scene.scene(
      { update, view },
      Scene.with(
        Model.make({
          route: SimRoute(),
          deckStatus: ReadyDeck({ deck: sampleDeck }),
          saveStatus: SaveIdle(),
          maybePointerStartX: Option.none(),
          fileCache: {},
          answerLogs: [],
        }),
      ),
      Scene.expect(Scene.selector('pre')).toContainText('submission fee'),
      Scene.expect(Scene.selector('pre')).toContainText('stake'),
      Scene.expect(Scene.selector('pre')).toContainText('waiting'),
      Scene.expect(Scene.selector('pre')).toContainText('empty'),
      Scene.expect(Scene.selector('pre')).not.toContainText('LICENSE'),
      Scene.expect(Scene.role('main')).toContainText(
        'Paste feedback for this beat',
      ),
    )
  })

  test('a follow-up sim paste shows the latest note', () => {
    Scene.scene(
      { update, view },
      Scene.with(
        Model.make({
          route: SimRoute(),
          deckStatus: ReadyDeck({ deck: sampleDeck }),
          saveStatus: SaveOk({ preview: 'stake is the second payment' }),
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
          ],
        }),
      ),
      Scene.expect(Scene.role('main')).toContainText(
        'stake is the second payment',
      ),
      Scene.expect(Scene.role('main')).toContainText('1 note'),
    )
  })
})
