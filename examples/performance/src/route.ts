import { Match as M, Schema as S, pipe } from 'effect'
import { Route } from 'foldkit'
import { literal, r, slash, string } from 'foldkit/route'

import { Scope } from './data'

/** Every app, Scribe first: `/`. */
export const Home = r('Home')
/** One app's charts and builds: `/apps/scribe`, `/apps/scribe-mac?scope=NotRecording`. */
export const AppPage = r('AppPage', { appId: S.String, scope: S.Option(Scope) })
/** One build on one app's device: `/apps/scribe/builds/270`. */
export const BuildPage = r('BuildPage', { appId: S.String, build: S.String })
/** One metric across builds, with its table and how it is measured: `/apps/scribe/metrics/cpu-front`. */
export const MetricPage = r('MetricPage', {
  appId: S.String,
  metricId: S.String,
  scope: S.Option(Scope),
})
/** Every issue the performance work names, with its evidence: `/issues`. */
export const IssuesPage = r('IssuesPage')
/** How every number is made, where it comes from, and who can open this page: `/method`. */
export const MethodPage = r('MethodPage')
/** The understanding profile's areas at proficient, area by area: `/understanding`. */
export const UnderstandingPage = r('UnderstandingPage')
export const NotFound = r('NotFound', { path: S.String })

/**
 * Every place on the page. The URL is this value printed: `print` and `parse`
 * below are one pair, so `parse(print(destination))` is the destination.
 */
export const Destination = S.Union([
  Home,
  AppPage,
  BuildPage,
  MetricPage,
  IssuesPage,
  MethodPage,
  UnderstandingPage,
  NotFound,
])
export type Destination = typeof Destination.Type

const scopeQuery = Route.query(S.Struct({ scope: S.OptionFromOptional(Scope) }))

export const homeRouter = pipe(Route.root, Route.mapTo(Home))

export const appRouter = pipe(
  literal('apps'),
  slash(string('appId')),
  scopeQuery,
  Route.mapTo(AppPage),
)

export const buildRouter = pipe(
  literal('apps'),
  slash(string('appId')),
  slash(literal('builds')),
  slash(string('build')),
  Route.mapTo(BuildPage),
)

export const metricRouter = pipe(
  literal('apps'),
  slash(string('appId')),
  slash(literal('metrics')),
  slash(string('metricId')),
  scopeQuery,
  Route.mapTo(MetricPage),
)

export const issuesRouter = pipe(literal('issues'), Route.mapTo(IssuesPage))

export const methodRouter = pipe(literal('method'), Route.mapTo(MethodPage))

export const understandingRouter = pipe(
  literal('understanding'),
  Route.mapTo(UnderstandingPage),
)

const destinationParser = Route.oneOf(
  buildRouter,
  metricRouter,
  appRouter,
  issuesRouter,
  methodRouter,
  understandingRouter,
  homeRouter,
)

/** The destination a URL names; a URL no page answers is NotFound with its path. */
export const urlToDestination = Route.parseUrlWithFallback(
  destinationParser,
  NotFound,
)

/** The canonical path of a destination: `/apps/scribe/builds/270`. */
export const destinationPath = (destination: Destination): string =>
  M.value(destination).pipe(
    M.tagsExhaustive({
      Home: () => homeRouter(),
      AppPage: ({ appId, scope }) => appRouter({ appId, scope }),
      BuildPage: ({ appId, build }) => buildRouter({ appId, build }),
      MetricPage: ({ appId, metricId, scope }) =>
        metricRouter({ appId, metricId, scope }),
      IssuesPage: () => issuesRouter(),
      MethodPage: () => methodRouter(),
      UnderstandingPage: () => understandingRouter(),
      NotFound: ({ path }) => path,
    }),
  )
