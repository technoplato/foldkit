import { Option, Schema as S, pipe } from 'effect'
import { Route } from 'foldkit'
import { literal, query, r, schemaSegment, slash } from 'foldkit/route'

import {
  PropositionId,
  ShowAll,
  ShowAnswered,
  ShowFollowUp,
  ShowUnanswered,
  SlideFilter,
  SlideId,
} from './domain'

export const HomeRoute = r('Home')
export const SimRoute = r('Sim')

/**
 * Answer log id for `/sim`. The plugin writes `answers/sim.json`.
 * This is not a deck card. Paste on `/sim` POSTs `/answers/sim`.
 */
export const SIM_ANSWER_ID = SlideId.make('sim')
export const SlideRoute = r('Slide', {
  slideId: SlideId,
  filter: S.optionalKey(S.Literals(['Unanswered', 'Answered', 'FollowUp'])),
  explore: S.optionalKey(PropositionId),
})
export const NotFoundRoute = r('NotFound', { path: S.String })

export const AppRoute = S.Union([HomeRoute, SimRoute, SlideRoute, NotFoundRoute])

export type HomeRoute = typeof HomeRoute.Type
export type SimRoute = typeof SimRoute.Type
export type SlideRoute = typeof SlideRoute.Type
export type NotFoundRoute = typeof NotFoundRoute.Type
export type AppRoute = typeof AppRoute.Type

export const homeRouter = pipe(Route.root, Route.mapTo(HomeRoute))
export const simRouter = pipe(literal('sim'), Route.mapTo(SimRoute))

export const slideRouter = pipe(
  literal('q'),
  slash(schemaSegment('slideId', SlideId)),
  query(
    S.Struct({
      filter: S.optionalKey(S.Literals(['Unanswered', 'Answered', 'FollowUp'])),
      explore: S.optionalKey(PropositionId),
    }),
  ),
  Route.mapTo(SlideRoute),
)

const routeParser = Route.oneOf(slideRouter, simRouter, homeRouter)

export const urlToAppRoute = Route.parseUrlWithFallback(
  routeParser,
  NotFoundRoute,
)

/** All when the URL has no filter query. Example: `/q/01` is All. */
export const filterOf = (route: AppRoute): SlideFilter => {
  if (route._tag !== 'Slide') {
    return ShowAll()
  }
  if (route.filter === 'Unanswered') {
    return ShowUnanswered()
  }
  if (route.filter === 'Answered') {
    return ShowAnswered()
  }
  if (route.filter === 'FollowUp') {
    return ShowFollowUp()
  }
  return ShowAll()
}

/**
 * Explore screen on this slide URL, if any. Example:
 * `/q/04h?explore=lock-in-vs-surface` is `lock-in-vs-surface`.
 */
export const exploreOf = (route: AppRoute): Option.Option<PropositionId> => {
  if (route._tag !== 'Slide') {
    return Option.none()
  }
  if (route.explore === undefined) {
    return Option.none()
  }
  return Option.some(route.explore)
}

/**
 * Printer for a slide plus filter and optional explore id. All prints
 * `/q/01` with no filter query. Unanswered prints
 * `/q/01?filter=Unanswered`. Explore prints the stable proposition id:
 * `/q/04h?filter=Unanswered&explore=lock-in-vs-surface`.
 */
export const slideHref = (
  slideId: SlideId,
  filter: SlideFilter,
  maybeExplore: Option.Option<PropositionId> = Option.none(),
): string => {
  if (filter._tag === 'All') {
    if (Option.isNone(maybeExplore)) {
      return slideRouter({ slideId })
    }
    return slideRouter({
      slideId,
      explore: maybeExplore.value,
    })
  }
  if (Option.isNone(maybeExplore)) {
    return slideRouter({
      slideId,
      filter: filter._tag,
    })
  }
  return slideRouter({
    slideId,
    filter: filter._tag,
    explore: maybeExplore.value,
  })
}
