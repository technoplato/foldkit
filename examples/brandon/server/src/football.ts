import type { Game, GameState, GameTeam } from 'brandon-core-example'
import { Array, Effect, Option, Order, Schema as S } from 'effect'

// FOOTBALL

const espnScoreboard =
  'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=300'

const unrankedFrom = 26

const cacheForMs = 5_000

const EspnTeam = S.Struct({
  score: S.optionalKey(S.String),
  homeAway: S.optionalKey(S.String),
  curatedRank: S.optionalKey(S.Struct({ current: S.optionalKey(S.Number) })),
  team: S.optionalKey(
    S.Struct({
      shortDisplayName: S.optionalKey(S.String),
      displayName: S.optionalKey(S.String),
    }),
  ),
})
type EspnTeam = typeof EspnTeam.Type

const EspnStatus = S.Struct({
  type: S.optionalKey(
    S.Struct({
      state: S.optionalKey(S.String),
      shortDetail: S.optionalKey(S.String),
    }),
  ),
})

const EspnEvent = S.Struct({
  id: S.String,
  date: S.optionalKey(S.String),
  status: S.optionalKey(EspnStatus),
  competitions: S.optionalKey(
    S.Array(
      S.Struct({
        status: S.optionalKey(EspnStatus),
        competitors: S.optionalKey(S.Array(EspnTeam)),
      }),
    ),
  ),
})
type EspnEvent = typeof EspnEvent.Type

const EspnScoreboard = S.Struct({
  events: S.optionalKey(S.Array(EspnEvent)),
})

const stateOf = (espnState: string): GameState => {
  if (espnState === 'in') {
    return 'Live'
  } else if (espnState === 'post') {
    return 'Final'
  } else {
    return 'Scheduled'
  }
}

const gameTeamOf = (team: EspnTeam): GameTeam => ({
  name: team.team?.shortDisplayName ?? team.team?.displayName ?? '',
  score: team.score ?? '',
  maybeRank: Option.filter(
    Option.fromNullishOr(team.curatedRank?.current),
    rank => rank > 0 && rank < unrankedFrom,
  ),
})

const byAwayFirst = Order.mapInput(
  Order.Boolean,
  (team: EspnTeam) => team.homeAway === 'home',
)

type DatedGame = Readonly<{ game: Game; date: string }>

/** One ESPN event as a game, away team first. */
export const gameOf = (event: EspnEvent): DatedGame => {
  const maybeCompetition = Array.head(event.competitions ?? [])
  const competition = Option.getOrUndefined(maybeCompetition)
  const status = competition?.status ?? event.status
  return {
    date: event.date ?? '',
    game: {
      id: event.id,
      state: stateOf(status?.type?.state ?? 'pre'),
      detail: status?.type?.shortDetail ?? '',
      teams: Array.map(
        Array.sort(competition?.competitors ?? [], byAwayFirst),
        gameTeamOf,
      ),
    },
  }
}

const stateOrder: Readonly<Record<GameState, number>> = {
  Live: 0,
  Scheduled: 1,
  Final: 2,
}

/**
 * Live games first, then upcoming, then finished; within each, a pinned
 * team, then a ranked one, then by kickoff.
 */
export const gamesInOrder = (
  dated: ReadonlyArray<DatedGame>,
  pinnedTeams: ReadonlyArray<string>,
): ReadonlyArray<Game> => {
  const isPinned = ({ game }: DatedGame): boolean =>
    Array.some(game.teams, team => Array.contains(pinnedTeams, team.name))
  const isRanked = ({ game }: DatedGame): boolean =>
    Array.some(game.teams, team => Option.isSome(team.maybeRank))
  const order = Order.combineAll<DatedGame>([
    Order.mapInput(Order.Number, ({ game }) => stateOrder[game.state]),
    Order.mapInput(Order.flip(Order.Boolean), isPinned),
    Order.mapInput(Order.flip(Order.Boolean), isRanked),
    Order.mapInput(Order.String, ({ date }) => date),
  ])
  return Array.map(Array.sort(dated, order), ({ game }) => game)
}

/**
 * The games, shared by everyone and read from ESPN at most every 5
 * seconds. A failed read keeps the last games.
 */
export const makeFootball = (
  config: Readonly<{
    fetch: typeof globalThis.fetch
    pinnedTeams: ReadonlyArray<string>
    nowMs?: () => number
  }>,
): Effect.Effect<ReadonlyArray<Game>, Error> => {
  const nowMs = config.nowMs ?? Date.now
  let cachedAtMs = 0
  let games: ReadonlyArray<Game> = []
  const refresh = async (): Promise<void> => {
    try {
      const response = await config.fetch(espnScoreboard, {
        headers: { 'user-agent': 'brandon-dot' },
      })
      const scoreboard = S.decodeUnknownSync(EspnScoreboard)(
        await response.json(),
      )
      games = gamesInOrder(
        Array.map(scoreboard.events ?? [], gameOf),
        config.pinnedTeams,
      )
    } catch (error) {
      console.error('football read failed:', error)
    }
    cachedAtMs = nowMs()
  }
  return Effect.promise(async () => {
    if (nowMs() - cachedAtMs >= cacheForMs) {
      await refresh()
    }
    return games
  })
}
