import { Match as M, Option, Schema as S, pipe } from 'effect'
import { Route } from 'foldkit'
import { literal, r, slash, string } from 'foldkit/route'
import { type Url } from 'foldkit/url'

import {
  CounterDetail,
  CounterFactAlert,
  CounterList,
  DeleteCounterConfirmation,
  LoadingCounterFact,
  type Navigation,
} from './model.js'

const CounterListRoute = r('CounterListRoute')
const CounterDetailRoute = r('CounterDetailRoute', { counterId: S.String })
const CounterFactRoute = r('CounterFactRoute', { counterId: S.String })
const DeleteCounterRoute = r('DeleteCounterRoute', { counterId: S.String })
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

/** Parses a host URL into navigation state through Foldkit's route parser. */
export const urlToNavigation = (url: Url): Navigation =>
  M.value(urlToRoute(url)).pipe(
    M.withReturnType<Navigation>(),
    M.tagsExhaustive({
      CounterListRoute: () => CounterList.make({}),
      CounterDetailRoute: ({ counterId }) =>
        CounterDetail.make({ counterId, maybeMode: Option.none() }),
      CounterFactRoute: ({ counterId }) =>
        CounterDetail.make({
          counterId,
          maybeMode: Option.some(
            CounterFactAlert.make({ status: LoadingCounterFact.make({}) }),
          ),
        }),
      DeleteCounterRoute: ({ counterId }) =>
        CounterDetail.make({
          counterId,
          maybeMode: Option.some(DeleteCounterConfirmation.make({})),
        }),
      NotFoundRoute: () => CounterList.make({}),
    }),
  )

/** Prints navigation state as a URL projection with no replay events. */
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
