import { Schema as S, pipe } from 'effect'
import { Route } from 'foldkit'
import { literal, query, r, schemaSegment, slash } from 'foldkit/route'

import {
  ShowAll,
  ShowAnswered,
  ShowFollowUp,
  ShowUnanswered,
  SlideFilter,
  SlideId,
} from './domain'

export const HomeRoute = r('Home')
export const SlideRoute = r('Slide', {
  slideId: SlideId,
  filter: S.optionalKey(S.Literals(['Unanswered', 'Answered', 'FollowUp'])),
})
export const NotFoundRoute = r('NotFound', { path: S.String })

export const AppRoute = S.Union([HomeRoute, SlideRoute, NotFoundRoute])

export type HomeRoute = typeof HomeRoute.Type
export type SlideRoute = typeof SlideRoute.Type
export type NotFoundRoute = typeof NotFoundRoute.Type
export type AppRoute = typeof AppRoute.Type

export const homeRouter = pipe(Route.root, Route.mapTo(HomeRoute))

export const slideRouter = pipe(
  literal('q'),
  slash(schemaSegment('slideId', SlideId)),
  query(
    S.Struct({
      filter: S.optionalKey(S.Literals(['Unanswered', 'Answered', 'FollowUp'])),
    }),
  ),
  Route.mapTo(SlideRoute),
)

const routeParser = Route.oneOf(slideRouter, homeRouter)

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
 * Printer for a slide plus the current filter. All prints `/q/01` with no
 * query. Unanswered prints `/q/01?filter=Unanswered`.
 */
export const slideHref = (slideId: SlideId, filter: SlideFilter): string => {
  if (filter._tag === 'All') {
    return slideRouter({ slideId })
  }
  return slideRouter({
    slideId,
    filter: filter._tag,
  })
}
