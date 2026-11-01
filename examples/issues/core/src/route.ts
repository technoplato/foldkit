import {
  Array,
  Effect,
  Match as M,
  Option,
  Schema as S,
  String,
  pipe,
} from 'effect'
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

import { IssuePriority, IssueStatus } from '@foldkit/instant-tools/issues'

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
import {
  AnyClaimant,
  type ClaimantFilter,
  IssueGrouping,
  IssueLayout,
  IssueSort,
  type IssueView,
  OneClaimant,
  Unclaimed,
} from './issueView.js'
import {
  AllWork,
  CloseToLanding,
  type LandingFilter,
  WorkingNow,
} from './landing.js'
import { AllProducts, OneProduct, type ProductFilter } from './leftover.js'
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
 * The list's view as its URL's query, so a view is a link:
 * `/issues?q=heart+rate&product=foldkit&landing=close&status=Open%2CBlocked`.
 * A parameter it does not know, or a value that names nothing, is left out.
 */
const IssueViewQuery = S.Struct({
  q: S.OptionFromOptional(S.String),
  product: S.OptionFromOptional(S.String),
  landing: S.OptionFromOptional(S.String),
  status: S.OptionFromOptional(S.String),
  priority: S.OptionFromOptional(S.String),
  claimant: S.OptionFromOptional(S.String),
  sort: S.OptionFromOptional(S.String),
  group: S.OptionFromOptional(S.String),
  view: S.OptionFromOptional(S.String),
})

const BacklogQuery = S.Struct({ product: S.OptionFromOptional(S.String) })

const IssueListRoute = r('IssueListRoute', {
  q: S.Option(S.String),
  product: S.Option(S.String),
  landing: S.Option(S.String),
  status: S.Option(S.String),
  priority: S.Option(S.String),
  claimant: S.Option(S.String),
  sort: S.Option(S.String),
  group: S.Option(S.String),
  view: S.Option(S.String),
})
const IssueDetailRoute = r('IssueDetailRoute', { issueId: S.String })
const FileIssueRoute = r('FileIssueRoute')
const TriageInboxRoute = r('TriageInboxRoute')
const BacklogRoute = r('BacklogRoute', { product: S.Option(S.String) })
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

const LIST_SEPARATOR = ','
const CLOSE_TO_LANDING_WORD = 'close'
const WORKING_NOW_WORD = 'working'
const UNCLAIMED_WORD = 'unclaimed'

const productFilterOfWord = (maybeWord: Option.Option<string>): ProductFilter =>
  Option.match(maybeWord, {
    onNone: () => AllProducts.make({}),
    onSome: productId => OneProduct.make({ productId }),
  })

const wordOfProductFilter = (filter: ProductFilter): Option.Option<string> =>
  filter._tag === 'OneProduct' ? Option.some(filter.productId) : Option.none()

const landingFilterOfWord = (maybeWord: Option.Option<string>): LandingFilter =>
  M.value(Option.getOrElse(maybeWord, () => '')).pipe(
    M.withReturnType<LandingFilter>(),
    M.when(CLOSE_TO_LANDING_WORD, () => CloseToLanding.make({})),
    M.when(WORKING_NOW_WORD, () => WorkingNow.make({})),
    M.orElse(() => AllWork.make({})),
  )

const wordOfLandingFilter = (filter: LandingFilter): Option.Option<string> =>
  M.value(filter).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.tagsExhaustive({
      AllWork: () => Option.none(),
      CloseToLanding: () => Option.some(CLOSE_TO_LANDING_WORD),
      WorkingNow: () => Option.some(WORKING_NOW_WORD),
    }),
  )

const claimantFilterOfWord = (
  maybeWord: Option.Option<string>,
): ClaimantFilter =>
  Option.match(maybeWord, {
    onNone: () => AnyClaimant.make({}),
    onSome: word =>
      word === UNCLAIMED_WORD
        ? Unclaimed.make({})
        : OneClaimant.make({ claimantId: word }),
  })

const wordOfClaimantFilter = (filter: ClaimantFilter): Option.Option<string> =>
  M.value(filter).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.tagsExhaustive({
      AnyClaimant: () => Option.none(),
      Unclaimed: () => Option.some(UNCLAIMED_WORD),
      OneClaimant: ({ claimantId }) => Option.some(claimantId),
    }),
  )

const namedIn = <Literal extends string>(
  literals: ReadonlyArray<Literal>,
  maybeWords: Option.Option<string>,
): ReadonlyArray<Literal> =>
  Array.filter(literals, literal =>
    Option.exists(maybeWords, words =>
      Array.contains(words.split(LIST_SEPARATOR), literal),
    ),
  )

const inOrderTyped = <Literal extends string>(
  literals: ReadonlyArray<Literal>,
  maybeWords: Option.Option<string>,
): ReadonlyArray<Literal> => {
  const named = namedIn(literals, maybeWords)
  return Option.match(maybeWords, {
    onNone: () => [],
    onSome: words =>
      Array.flatMap(words.split(LIST_SEPARATOR), word =>
        Array.filter(named, literal => literal === word),
      ),
  })
}

const wordsOf = (words: ReadonlyArray<string>): Option.Option<string> =>
  Option.liftPredicate(Array.join(words, LIST_SEPARATOR), String.isNonEmpty)

const literalOfWord = <Literal extends string>(
  literals: ReadonlyArray<Literal>,
  fallback: Literal,
  maybeWord: Option.Option<string>,
): Literal =>
  Option.getOrElse(
    Option.flatMap(maybeWord, word =>
      Array.findFirst(literals, literal => literal.toLowerCase() === word),
    ),
    () => fallback,
  )

const wordOfLiteral = <Literal extends string>(
  literal: Literal,
  fallback: Literal,
): Option.Option<string> =>
  literal === fallback ? Option.none() : Option.some(literal.toLowerCase())

const viewOfQuery = (fields: typeof IssueViewQuery.Type): IssueView => ({
  claimant: claimantFilterOfWord(fields.claimant),
  grouping: literalOfWord(IssueGrouping.literals, 'None', fields.group),
  landing: landingFilterOfWord(fields.landing),
  layout: literalOfWord(IssueLayout.literals, 'List', fields.view),
  priorities: inOrderTyped(IssuePriority.literals, fields.priority),
  product: productFilterOfWord(fields.product),
  query: Option.getOrElse(fields.q, () => ''),
  sort: literalOfWord(IssueSort.literals, 'Created', fields.sort),
  statuses: inOrderTyped(IssueStatus.literals, fields.status),
})

const queryOfView = (view: IssueView): typeof IssueViewQuery.Type => ({
  q: Option.liftPredicate(view.query, String.isNonEmpty),
  product: wordOfProductFilter(view.product),
  landing: wordOfLandingFilter(view.landing),
  status: wordsOf(view.statuses),
  priority: wordsOf(view.priorities),
  claimant: wordOfClaimantFilter(view.claimant),
  sort: wordOfLiteral(view.sort, 'Created'),
  group: wordOfLiteral(view.grouping, 'None'),
  view: wordOfLiteral(view.layout, 'List'),
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
  query(BacklogQuery),
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
      BacklogRoute: ({ product }) =>
        Backlog.make({ product: productFilterOfWord(product) }),
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
      Backlog: ({ product }) =>
        backlogRouter({ product: wordOfProductFilter(product) }),
      AskFlow: () => askFlowRouter(),
      EntityPage: ({ entity }) => entityPagePath(entity),
    }),
  )
