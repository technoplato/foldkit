import { Match as M, Schema as S, pipe } from 'effect'
import * as Route from 'foldkit/route'
import { literal, r, slash } from 'foldkit/route'
import type { Url } from 'foldkit/url'

import {
  CalculatorScene,
  CardboardScene,
  CounterScene,
  FactScene,
  HomeScene,
  MultipleCountersScene,
  type Navigation,
  WalletScene,
} from './model.js'

const HomeRoute = r('HomeRoute')
const CounterRoute = r('CounterRoute')
const MultipleCountersRoute = r('MultipleCountersRoute')
const CalculatorRoute = r('CalculatorRoute')
const FactRoute = r('FactRoute')
const WalletRoute = r('WalletRoute')
const CardboardRoute = r('CardboardRoute')
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
const walletRouter = pipe(
  literal('showcase'),
  slash(literal('wallet')),
  Route.mapTo(WalletRoute),
)
const cardboardRouter = pipe(literal('0'), Route.mapTo(CardboardRoute))

const routeParser = Route.oneOf(
  counterRouter,
  multipleCountersRouter,
  calculatorRouter,
  factRouter,
  walletRouter,
  cardboardRouter,
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
      WalletRoute: () => WalletScene.make({}),
      CardboardRoute: () => CardboardScene.make({}),
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
      WalletScene: () => walletRouter(),
      CardboardScene: () => cardboardRouter(),
    }),
  )
