import { Match as M, Schema as S, pipe } from 'effect'
import * as Route from 'foldkit/route'
import { literal, r, slash } from 'foldkit/route'
import type { Url } from 'foldkit/url'

import {
  CalculatorScene,
  CounterScene,
  FactScene,
  HomeScene,
  MultipleCountersScene,
  type Navigation,
} from './model.js'

const HomeRoute = r('HomeRoute')
const CounterRoute = r('CounterRoute')
const MultipleCountersRoute = r('MultipleCountersRoute')
const CalculatorRoute = r('CalculatorRoute')
const FactRoute = r('FactRoute')
const NotFoundRoute = r('NotFoundRoute', { path: S.String })

const homeRouter = pipe(literal('showcase'), Route.mapTo(HomeRoute))
const counterRouter = pipe(
  literal('showcase'),
  slash(literal('counter')),
  Route.mapTo(CounterRoute),
)
const multipleCountersRouter = pipe(
  literal('showcase'),
  slash(literal('counters')),
  Route.mapTo(MultipleCountersRoute),
)
const calculatorRouter = pipe(
  literal('showcase'),
  slash(literal('calculator')),
  Route.mapTo(CalculatorRoute),
)
const factRouter = pipe(
  literal('showcase'),
  slash(literal('fact')),
  Route.mapTo(FactRoute),
)

const routeParser = Route.oneOf(
  counterRouter,
  multipleCountersRouter,
  calculatorRouter,
  factRouter,
  homeRouter,
)

const urlToRoute = Route.parseUrlWithFallback(routeParser, NotFoundRoute)

/** Parses a host URL into portable showcase navigation state. */
export const urlToNavigation = (url: Url): Navigation =>
  M.value(urlToRoute(url)).pipe(
    M.withReturnType<Navigation>(),
    M.tagsExhaustive({
      HomeRoute: () => HomeScene.make({}),
      CounterRoute: () => CounterScene.make({}),
      MultipleCountersRoute: () => MultipleCountersScene.make({}),
      CalculatorRoute: () => CalculatorScene.make({}),
      FactRoute: () => FactScene.make({}),
      NotFoundRoute: () => HomeScene.make({}),
    }),
  )

/** Prints showcase navigation as one canonical relative path. */
export const navigationToPath = (navigation: Navigation): string =>
  M.value(navigation).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      HomeScene: () => homeRouter(),
      CounterScene: () => counterRouter(),
      MultipleCountersScene: () => multipleCountersRouter(),
      CalculatorScene: () => calculatorRouter(),
      FactScene: () => factRouter(),
    }),
  )
