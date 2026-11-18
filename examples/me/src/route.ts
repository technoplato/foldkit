import { Match as M, Schema as S, pipe } from 'effect'
import { Route } from 'foldkit'
import { literal, r } from 'foldkit/route'

/** Who is signed in and what their folder holds: `/`. */
export const Home = r('Home')
/** The signed-in user's understanding profile, area by area: `/understanding`. */
export const UnderstandingPage = r('UnderstandingPage')
export const NotFound = r('NotFound', { path: S.String })

/**
 * Every place on the page. No destination names a user: the page is always
 * the signed-in user's own, so `/understanding` is one address that each
 * user reads as theirs. `parse(print(destination))` is the destination.
 */
export const Destination = S.Union([Home, UnderstandingPage, NotFound])
export type Destination = typeof Destination.Type

export const homeRouter = pipe(Route.root, Route.mapTo(Home))

export const understandingRouter = pipe(
  literal('understanding'),
  Route.mapTo(UnderstandingPage),
)

const destinationParser = Route.oneOf(understandingRouter, homeRouter)

/** The destination a URL names; a URL no page answers is NotFound with its path. */
export const urlToDestination = Route.parseUrlWithFallback(
  destinationParser,
  NotFound,
)

/** The canonical path of a destination: `/understanding`. */
export const destinationPath = (destination: Destination): string =>
  M.value(destination).pipe(
    M.tagsExhaustive({
      Home: () => homeRouter(),
      UnderstandingPage: () => understandingRouter(),
      NotFound: ({ path }) => path,
    }),
  )
