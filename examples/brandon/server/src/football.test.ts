import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { gameOf, gamesInOrder, shownGames } from './football.js'

const event = (id: string, state: string, name: string, rank = 99) => ({
  id,
  date: `2026-10-31T${id.padStart(2, '0')}:00Z`,
  competitions: [
    {
      status: { type: { state, shortDetail: 'detail' } },
      competitors: [
        {
          homeAway: 'home',
          score: '7',
          team: { shortDisplayName: 'Home' },
          curatedRank: { current: 99 },
        },
        {
          homeAway: 'away',
          score: '3',
          team: { shortDisplayName: name },
          curatedRank: { current: rank },
        },
      ],
    },
  ],
})

describe('the games', () => {
  it('puts the away team first and hides a rank past 25', () => {
    const { game } = gameOf(event('1', 'in', 'Clemson', 9))
    expect(game.state).toBe('Live')
    expect(game.teams.map(({ name }) => name)).toEqual(['Clemson', 'Home'])
    expect(game.teams.map(({ maybeRank }) => maybeRank)).toEqual([
      Option.some(9),
      Option.none(),
    ])
  })

  it('orders live first, then pinned, then ranked', () => {
    const games = gamesInOrder(
      [
        gameOf(event('1', 'post', 'Finished')),
        gameOf(event('2', 'pre', 'Upcoming')),
        gameOf(event('3', 'in', 'Unranked')),
        gameOf(event('4', 'in', 'Ranked', 5)),
        gameOf(event('5', 'in', 'Pinned')),
      ],
      ['Pinned'],
    )
    expect(games.map(({ id }) => id)).toEqual(['5', '4', '3', '2', '1'])
  })

  it('keeps a phone’s page short', () => {
    const many = Array.from({ length: 40 }, (_, index) =>
      gameOf(event(index.toString(), 'post', 'Team')),
    )
    expect(gamesInOrder(many, [])).toHaveLength(shownGames)
  })
})
