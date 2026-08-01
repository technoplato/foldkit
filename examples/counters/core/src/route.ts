import { Match as M, Option, Schema as S, pipe } from 'effect'
import { Route } from 'foldkit'
import { literal, r, slash, string } from 'foldkit/route'
import { type Url, fromString } from 'foldkit/url'

import {
  CounterDetailTarget,
  CounterFactTarget,
  CounterListTarget,
  DeleteCounterTarget,
  type NavigationTarget,
} from './message.js'
import { CounterId, type Navigation } from './model.js'

const CounterListRoute = r('CounterListRoute')
const CounterDetailRoute = r('CounterDetailRoute', { counterId: CounterId })
const CounterFactRoute = r('CounterFactRoute', { counterId: CounterId })
const DeleteCounterRoute = r('DeleteCounterRoute', { counterId: CounterId })
const NotFoundRoute = r('NotFoundRoute', { path: S.String })

const counterListRouter = pipe(
  literal('counters'),
  Route.mapTo(CounterListRoute),
)
const counterDetailRouter = pipe(
  literal('counters'),
  slash(string('counterId')),
  Route.mapTo(CounterDetailRoute),
)
const counterFactRouter = pipe(
  literal('counters'),
  slash(string('counterId')),
  slash(literal('fact')),
  Route.mapTo(CounterFactRoute),
)
const deleteCounterRouter = pipe(
  literal('counters'),
  slash(string('counterId')),
  slash(literal('delete')),
  Route.mapTo(DeleteCounterRoute),
)

const routeParser = Route.oneOf(
  counterFactRouter,
  deleteCounterRouter,
  counterDetailRouter,
  counterListRouter,
)

const urlToRoute = Route.parseUrlWithFallback(routeParser, NotFoundRoute)
const absoluteCarrierPattern = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//u

/** Parses a host URL into a semantic target with no transient identities. */
export const urlToNavigationTarget = (url: Url): NavigationTarget =>
  M.value(urlToRoute(url)).pipe(
    M.withReturnType<NavigationTarget>(),
    M.tagsExhaustive({
      CounterListRoute: () => CounterListTarget.make({}),
      CounterDetailRoute: ({ counterId }) =>
        CounterDetailTarget.make({ counterId }),
      CounterFactRoute: ({ counterId }) =>
        CounterFactTarget.make({ counterId }),
      DeleteCounterRoute: ({ counterId }) =>
        DeleteCounterTarget.make({ counterId }),
      NotFoundRoute: () => CounterListTarget.make({}),
    }),
  )

/** Parses a relative path or host carrier into a semantic navigation target. */
export const pathToNavigationTarget = (
  pathOrCarrier: string,
): NavigationTarget => {
  const relativePath = pathOrCarrier.startsWith('/')
    ? pathOrCarrier
    : `/${pathOrCarrier}`
  const carrier = absoluteCarrierPattern.test(pathOrCarrier)
    ? pathOrCarrier
    : `https://counters.invalid${relativePath}`
  const maybeUrl = fromString(carrier)
  return Option.isSome(maybeUrl)
    ? urlToNavigationTarget(maybeUrl.value)
    : CounterListTarget.make({})
}

/** Prints a semantic target without adding transient presentation identities. */
export const navigationTargetToPath = (target: NavigationTarget): string =>
  M.value(target).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      CounterListTarget: () => counterListRouter(),
      CounterDetailTarget: ({ counterId }) =>
        counterDetailRouter({ counterId }),
      CounterFactTarget: ({ counterId }) => counterFactRouter({ counterId }),
      DeleteCounterTarget: ({ counterId }) =>
        deleteCounterRouter({ counterId }),
    }),
  )

/** Prints current navigation state as its semantic URL projection. */
export const navigationToPath = (navigation: Navigation): string =>
  M.value(navigation).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      CounterList: () => counterListRouter(),
      CounterDetail: ({ counterId, maybeMode }) => {
        if (Option.isNone(maybeMode)) {
          return counterDetailRouter({ counterId })
        }
        return M.value(maybeMode.value).pipe(
          M.withReturnType<string>(),
          M.tagsExhaustive({
            CounterFactAlert: () => counterFactRouter({ counterId }),
            DeleteCounterConfirmation: () => deleteCounterRouter({ counterId }),
          }),
        )
      },
    }),
  )
