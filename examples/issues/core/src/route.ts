import { Effect, Match as M, Option, Schema as S, String, pipe } from 'effect'
import { Route } from 'foldkit'
import {
  ParseError,
  literal,
  param,
  query,
  r,
  slash,
  string,
} from 'foldkit/route'
import { type Url, fromString } from 'foldkit/url'

import {
  AgentEntity,
  BuildEntity,
  CommitEntity,
  type PageEntity,
  ProductEntity,
  RecordingEntity,
  RecordingNumberEntity,
  SegmentEntity,
} from './entityGraph.js'
import { type IssueView } from './issueView.js'
import {
  AskFlow,
  Backlog,
  EntityPage,
  FileIssue,
  IssueDetail,
  IssueList,
  type Navigation,
  TriageInbox,
} from './model.js'

/**
 * The list's view as its URL's query: `q` is the search, `/issues?q=heart+rate`.
 * A parameter it does not know is left out.
 */
const IssueViewQuery = S.Struct({ q: S.OptionFromOptional(S.String) })

const IssueListRoute = r('IssueListRoute', { q: S.Option(S.String) })
const IssueDetailRoute = r('IssueDetailRoute', { issueId: S.String })
const FileIssueRoute = r('FileIssueRoute')
const TriageInboxRoute = r('TriageInboxRoute')
const BacklogRoute = r('BacklogRoute')
const AskFlowRoute = r('AskFlowRoute')
const RecordingRoute = r('RecordingRoute', { recording: S.String })
const SegmentRoute = r('SegmentRoute', { segmentId: S.String })
const AgentRoute = r('AgentRoute', { agentId: S.String })
const CommitRoute = r('CommitRoute', { sha: S.String })
const BuildRoute = r('BuildRoute', { number: S.String })
const ProductRoute = r('ProductRoute', { productId: S.String })
const NotFoundRoute = r('NotFoundRoute', { path: S.String })

const decodedSegment = (
  label: string,
  segment: string,
): Effect.Effect<string, ParseError> =>
  Effect.try({
    try: () => decodeURIComponent(segment),
    catch: () =>
      new ParseError({
        message: `Expected an encoded ${label}`,
        expected: label,
        actual: segment,
      }),
  })

const agentIdSegment = param(
  'agent id',
  segment =>
    Effect.map(decodedSegment('agent id', segment), agentId => ({ agentId })),
  ({ agentId }: Readonly<{ agentId: string }>) => encodeURIComponent(agentId),
)

const ALL_DIGITS = /^\d+$/

const issueListRouter = pipe(
  literal('issues'),
  query(IssueViewQuery),
  Route.mapTo(IssueListRoute),
)

const viewOfQuery = ({ q }: typeof IssueViewQuery.Type): IssueView => ({
  query: Option.getOrElse(q, () => ''),
})

const queryOfView = (view: IssueView): typeof IssueViewQuery.Type => ({
  q: Option.liftPredicate(view.query, String.isNonEmpty),
})
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

const askFlowRouter = pipe(literal('asks'), Route.mapTo(AskFlowRoute))
const backlogRouter = pipe(
  literal('issues'),
  slash(literal('backlog')),
  Route.mapTo(BacklogRoute),
)

const recordingRouter = pipe(
  literal('recordings'),
  slash(string('recording')),
  Route.mapTo(RecordingRoute),
)
const segmentRouter = pipe(
  literal('segments'),
  slash(string('segmentId')),
  Route.mapTo(SegmentRoute),
)
const agentRouter = pipe(
  literal('agents'),
  slash(agentIdSegment),
  Route.mapTo(AgentRoute),
)
const commitRouter = pipe(
  literal('commits'),
  slash(string('sha')),
  Route.mapTo(CommitRoute),
)
const buildRouter = pipe(
  literal('builds'),
  slash(string('number')),
  Route.mapTo(BuildRoute),
)
const productRouter = pipe(
  literal('products'),
  slash(string('productId')),
  Route.mapTo(ProductRoute),
)

const routeParser = Route.oneOf(
  fileIssueRouter,
  triageInboxRouter,
  backlogRouter,
  askFlowRouter,
  issueDetailRouter,
  issueListRouter,
  recordingRouter,
  segmentRouter,
  agentRouter,
  commitRouter,
  buildRouter,
  productRouter,
)
const urlToRoute = Route.parseUrlWithFallback(routeParser, NotFoundRoute)

/** Parses one host URL into Issue Tracker navigation state. */
export const urlToNavigation = (url: Url): Navigation =>
  M.value(urlToRoute(url)).pipe(
    M.withReturnType<Navigation>(),
    M.tagsExhaustive({
      IssueListRoute: route => IssueList.make({ view: viewOfQuery(route) }),
      IssueDetailRoute: ({ issueId }) => IssueDetail.make({ issueId }),
      FileIssueRoute: () => FileIssue.make({}),
      TriageInboxRoute: () => TriageInbox.make({}),
      BacklogRoute: () => Backlog.make({}),
      AskFlowRoute: () => AskFlow.make({}),
      RecordingRoute: ({ recording }) =>
        EntityPage.make({
          entity: ALL_DIGITS.test(recording)
            ? RecordingNumberEntity.make({ recordingNumber: Number(recording) })
            : RecordingEntity.make({ recordingId: recording.toLowerCase() }),
        }),
      SegmentRoute: ({ segmentId }) =>
        EntityPage.make({
          entity: SegmentEntity.make({ segmentId: segmentId.toLowerCase() }),
        }),
      AgentRoute: ({ agentId }) =>
        EntityPage.make({ entity: AgentEntity.make({ agentId }) }),
      CommitRoute: ({ sha }) =>
        EntityPage.make({
          entity: CommitEntity.make({ sha: sha.toLowerCase() }),
        }),
      BuildRoute: ({ number }) =>
        EntityPage.make({ entity: BuildEntity.make({ number }) }),
      ProductRoute: ({ productId }) =>
        EntityPage.make({ entity: ProductEntity.make({ productId }) }),
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

const entityPagePath = (entity: PageEntity): string =>
  M.value(entity).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      RecordingEntity: ({ recordingId }) =>
        recordingRouter({ recording: recordingId }),
      RecordingNumberEntity: ({ recordingNumber }) =>
        recordingRouter({ recording: recordingNumber.toString() }),
      SegmentEntity: ({ segmentId }) => segmentRouter({ segmentId }),
      AgentEntity: ({ agentId }) => agentRouter({ agentId }),
      CommitEntity: ({ sha }) => commitRouter({ sha }),
      BuildEntity: ({ number }) => buildRouter({ number }),
      ProductEntity: ({ productId }) => productRouter({ productId }),
    }),
  )

/** Prints Issue Tracker navigation state as one canonical portable path. */
export const navigationToPath = (navigation: Navigation): string =>
  M.value(navigation).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      IssueList: ({ view }) => issueListRouter(queryOfView(view)),
      IssueDetail: ({ issueId }) => issueDetailRouter({ issueId }),
      FileIssue: () => fileIssueRouter(),
      TriageInbox: () => triageInboxRouter(),
      Backlog: () => backlogRouter(),
      AskFlow: () => askFlowRouter(),
      EntityPage: ({ entity }) => entityPagePath(entity),
    }),
  )
