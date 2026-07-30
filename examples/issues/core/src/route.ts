import { Match as M, Option, Schema as S, pipe } from 'effect'
import { Route } from 'foldkit'
import { literal, r, slash, string } from 'foldkit/route'
import { type Url, fromString } from 'foldkit/url'

import {
  FileIssue,
  IssueDetail,
  IssueList,
  type Navigation,
  TriageInbox,
} from './model.js'

const IssueListRoute = r('IssueListRoute')
const IssueDetailRoute = r('IssueDetailRoute', { issueId: S.String })
const FileIssueRoute = r('FileIssueRoute')
const TriageInboxRoute = r('TriageInboxRoute')
const NotFoundRoute = r('NotFoundRoute', { path: S.String })

const issueListRouter = pipe(literal('issues'), Route.mapTo(IssueListRoute))
const issueDetailRouter = pipe(
  literal('issues'),
  slash(string('issueId')),
  Route.mapTo(IssueDetailRoute),
)
const fileIssueRouter = pipe(
  literal('issues'),
  slash(literal('new')),
  Route.mapTo(FileIssueRoute),
)
const triageInboxRouter = pipe(
  literal('issues'),
  slash(literal('triage')),
  Route.mapTo(TriageInboxRoute),
)

const routeParser = Route.oneOf(
  fileIssueRouter,
  triageInboxRouter,
  issueDetailRouter,
  issueListRouter,
)
const urlToRoute = Route.parseUrlWithFallback(routeParser, NotFoundRoute)

/** Parses one host URL into Issue Tracker navigation state. */
export const urlToNavigation = (url: Url): Navigation =>
  M.value(urlToRoute(url)).pipe(
    M.withReturnType<Navigation>(),
    M.tagsExhaustive({
      IssueListRoute: () => IssueList.make({}),
      IssueDetailRoute: ({ issueId }) => IssueDetail.make({ issueId }),
      FileIssueRoute: () => FileIssue.make({}),
      TriageInboxRoute: () => TriageInbox.make({}),
      NotFoundRoute: () => IssueList.make({}),
    }),
  )

/** Parses a portable relative path or host carrier into navigation state. */
export const pathToNavigation = (pathOrCarrier: string): Navigation => {
  const carrier = pathOrCarrier.includes('://')
    ? pathOrCarrier
    : `https://issues.invalid${pathOrCarrier.startsWith('/') ? pathOrCarrier : `/${pathOrCarrier}`}`
  const maybeUrl = fromString(carrier)
  return Option.isSome(maybeUrl)
    ? urlToNavigation(maybeUrl.value)
    : IssueList.make({})
}

/** Prints Issue Tracker navigation state as one canonical portable path. */
export const navigationToPath = (navigation: Navigation): string =>
  M.value(navigation).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      IssueList: () => issueListRouter(),
      IssueDetail: ({ issueId }) => issueDetailRouter({ issueId }),
      FileIssue: () => fileIssueRouter(),
      TriageInbox: () => triageInboxRouter(),
    }),
  )
