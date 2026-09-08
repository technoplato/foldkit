import { Option, Schema as S } from 'effect'
import { Scene } from 'foldkit'
import { describe, test } from 'vitest'

import { Deck, SlideId } from './domain'
import { update, view } from './main'
import { Model, ReadyDeck, SaveIdle } from './model'
import { SlideRoute } from './route'

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
          answerLogs: [],
        }),
      ),
      Scene.expect(
        Scene.role('button', { name: 'Follow-up below. Press down.' }),
      ).toExist(),
    )
  })

  test('the last follow-up hides the bottom glow', () => {
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
          answerLogs: [],
        }),
      ),
      Scene.expect(
        Scene.role('button', { name: 'Follow-up below. Press down.' }),
      ).not.toExist(),
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
          name: 'Saved answer. Hover or focus to read the full text.',
        }),
      ).toExist(),
      Scene.expect(
        Scene.text('Saved: B. Pay is Alice attempt. Agents yield.'),
      ).toExist(),
      Scene.expect(Scene.text('Said: Pay 20 is the attempt')).toExist(),
    )
  })
})
