import { Array, Clock, Context, Effect, Option, Stream, pipe } from 'effect'

import {
  type DecisionRow,
  decisionFactsOf,
  decisionFactsQuery,
  decisionsQuery,
  keptDecisionsOf,
} from './decisionFacts.js'
import {
  type AgentFinding,
  type AgentRunChip,
  type FeatureChip,
  type FeatureFacts,
  type FeatureLine,
  type IssueGraph,
  ProductMapUnavailable,
  agentChipsOf,
  agentChipsQuery,
  agentFactsOf,
  agentFactsQuery,
  featureBuildsQuery,
  featureChipsOf,
  featureChipsQuery,
  featureFactsOf,
  featureFactsQuery,
  featuresOf,
  featuresQuery,
  findingFactsOf,
  findingFactsQuery,
  findingsOf,
  findingsQuery,
  issueBuildsOf,
  issueGraphOf,
  issueGraphQuery,
  noIssueGraph,
  productFactsOf,
  productFactsQuery,
  sessionFactsOf,
  sessionFactsQuery,
} from './graphFacts.js'
import {
  type IssueAgent,
  issueAgentsOf,
  issueAgentsQuery,
} from './issueAgents.js'
import {
  IssueLandingError,
  type LandingsDatabase,
  NoPageFacts,
  type PageFacts,
  observed,
} from './issueLandings.js'
import {
  type QuestionRow,
  keptQuestionsOf,
  questionFactsOf,
  questionFactsQuery,
  questionsQuery,
} from './questionFacts.js'
import {
  type ReminderRow,
  keptRemindersOf,
  reminderFactsOf,
  reminderFactsQuery,
  remindersQuery,
} from './reminderFacts.js'

// SERVICE

/**
 * What Scribe's rows say about agents and their sessions, findings, features
 * and products, as they change.
 */
export type GraphRowsService = Readonly<{
  observeAgentChips: (
    handles: ReadonlyArray<string>,
    maybeIssueNumber: Option.Option<number>,
  ) => Stream.Stream<ReadonlyArray<AgentRunChip>, IssueLandingError>
  observeAgentFacts: (
    handle: string,
  ) => Stream.Stream<PageFacts, IssueLandingError>
  observeDecisionFacts: (
    decisionId: string,
  ) => Stream.Stream<PageFacts, IssueLandingError>
  observeDecisions: Stream.Stream<ReadonlyArray<DecisionRow>, IssueLandingError>
  observeFeatureChips: Stream.Stream<
    ReadonlyArray<FeatureChip>,
    IssueLandingError
  >
  observeQuestionFacts: (
    questionId: string,
  ) => Stream.Stream<PageFacts, IssueLandingError>
  observeQuestions: Stream.Stream<ReadonlyArray<QuestionRow>, IssueLandingError>
  observeReminderFacts: (
    reminderId: string,
  ) => Stream.Stream<PageFacts, IssueLandingError>
  observeReminders: Stream.Stream<ReadonlyArray<ReminderRow>, IssueLandingError>
  observeFeatureFacts: (
    slug: string,
  ) => Stream.Stream<PageFacts, IssueLandingError>
  observeFeatures: Stream.Stream<ReadonlyArray<FeatureLine>, IssueLandingError>
  observeFindingFacts: (
    findingId: string,
  ) => Stream.Stream<PageFacts, IssueLandingError>
  observeFindings: Stream.Stream<ReadonlyArray<AgentFinding>, IssueLandingError>
  observeIssueGraph: (
    issueId: string,
  ) => Stream.Stream<IssueGraph, IssueLandingError>
  /** The agents started for an Issue, newest first, by its id (Scribe #2303). */
  observeIssueAgents: (
    issueId: string,
  ) => Stream.Stream<ReadonlyArray<IssueAgent>, IssueLandingError>
  observeProductFacts: (
    productId: string,
  ) => Stream.Stream<PageFacts, IssueLandingError>
  observeSessionFacts: (
    sessionId: string,
  ) => Stream.Stream<PageFacts, IssueLandingError>
  markFindingPromoted: (
    findingId: string,
    issueNumber: number,
  ) => Effect.Effect<void, IssueLandingError>
}>

/** A controlled dependency for what Scribe's rows say about the graph. */
export class GraphRows extends Context.Service<GraphRows, GraphRowsService>()(
  'issues-example/GraphRows',
) {}

/**
 * Hosts with no graph, such as previews and terminals: pages show only what
 * Issue text says.
 */
export const NoGraphRows: GraphRowsService = {
  observeAgentChips: () => Stream.empty,
  observeAgentFacts: () => Stream.empty,
  observeDecisionFacts: () => Stream.empty,
  observeDecisions: Stream.empty,
  observeFeatureChips: Stream.empty,
  observeQuestionFacts: () => Stream.empty,
  observeQuestions: Stream.empty,
  observeReminderFacts: () => Stream.empty,
  observeReminders: Stream.empty,
  observeFeatureFacts: () => Stream.empty,
  observeFeatures: Stream.empty,
  observeFindingFacts: () => Stream.empty,
  observeFindings: Stream.empty,
  observeIssueGraph: () => Stream.succeed(noIssueGraph),
  observeIssueAgents: () => Stream.empty,
  observeProductFacts: () => Stream.empty,
  observeSessionFacts: () => Stream.empty,
  markFindingPromoted: () => Effect.void,
}

/** What a finding's row changes to when it becomes an Issue. */
export type FindingPromotion = Readonly<{
  promotedIssueNumber: number
  status: 'promoted'
  updatedAtMs: number
}>

/**
 * The part of Scribe's Instant client the graph uses: its live queries, and the
 * one write a page makes, marking a finding promoted. findings-sync.ts never
 * writes a held row's status, so the mark stays.
 */
export type GraphDatabase = LandingsDatabase &
  Readonly<{
    updateFinding: (
      findingId: string,
      promotion: FindingPromotion,
    ) => Promise<unknown>
  }>

const WRITE_TIMEOUT = '5 seconds'
const MAP_TIMEOUT_MS = 5_000

/** Where the site's server answers with `products-map.json`. */
export const PRODUCTS_MAP_PATH = '/__foldkit/products-map'

/**
 * The map of what each product's code says, from the site's own server, read
 * once per page: `scripts/schema/products-map.mjs` prints it from git, and
 * nothing holds it in Instant.
 */
export const fetchedProductsMap: Effect.Effect<unknown, unknown> =
  Effect.tryPromise(async () => {
    const response = await fetch(PRODUCTS_MAP_PATH, {
      signal: AbortSignal.timeout(MAP_TIMEOUT_MS),
    })
    if (!response.ok) {
      throw new Error(
        `The site’s server has no map of code (${response.status.toString()}).`,
      )
    }
    const map: unknown = await response.json()
    return map
  })

const mapFailureReason = (failure: unknown): string =>
  failure instanceof Error ? failure.message : String(failure)

const FULL_ROW_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A row's id from what a link gave: the id itself, or the row among `rows`
 * whose id starts with the first 8 characters agents cite. `decisions.id` takes
 * no range, so a short id reads the table's list, which chips hold open anyway.
 */
const fullIdOfRow = <Row>(
  id: string,
  rows: Stream.Stream<ReadonlyArray<Row>, IssueLandingError>,
  idOfRow: (row: Row) => string,
): Stream.Stream<Option.Option<string>, IssueLandingError> =>
  FULL_ROW_ID.test(id)
    ? Stream.succeed(Option.some(id))
    : rows.pipe(
        Stream.map(found =>
          Option.map(
            Array.findFirst(found, row => idOfRow(row).startsWith(id)),
            idOfRow,
          ),
        ),
        Stream.changes,
      )

const factsOfRow = <Row>(
  id: string,
  rows: Stream.Stream<ReadonlyArray<Row>, IssueLandingError>,
  idOfRow: (row: Row) => string,
  factsOf: (fullId: string) => Stream.Stream<PageFacts, IssueLandingError>,
): Stream.Stream<PageFacts, IssueLandingError> =>
  fullIdOfRow(id, rows, idOfRow).pipe(
    Stream.switchMap(maybeId =>
      Option.match(maybeId, {
        onNone: () => Stream.succeed<PageFacts>(NoPageFacts.make({})),
        onSome: factsOf,
      }),
    ),
  )

const numberOfIssueId = (issueId: string): Option.Option<number> =>
  Option.liftPredicate(Number(issueId), Number.isSafeInteger)

const featureWithBuilds =
  (openDatabase: Effect.Effect<GraphDatabase, IssueLandingError>) =>
  (facts: FeatureFacts): Stream.Stream<PageFacts, IssueLandingError> => {
    const numbers = pipe(
      facts.issues,
      Array.flatMap(issue => Option.toArray(numberOfIssueId(issue.issueId))),
      Array.dedupe,
    )
    return Array.isReadonlyArrayEmpty(numbers)
      ? Stream.succeed(facts)
      : Stream.concat(
          Stream.succeed(facts),
          observed(
            openDatabase,
            featureBuildsQuery(numbers),
            (data): PageFacts => ({
              ...facts,
              issueBuilds: issueBuildsOf(data),
            }),
          ),
        )
  }

const factsOrNone = <Facts extends PageFacts>(
  maybeFacts: Option.Option<Facts>,
): PageFacts =>
  Option.getOrElse<PageFacts, PageFacts>(maybeFacts, () => NoPageFacts.make({}))

/**
 * The graph, live from Scribe's Instant app, opened the first time a page asks
 * for it, so the list pays nothing for it: each page reads its own rows by an
 * indexed field, and no live read is open for a page that is not.
 */
export const instantGraphRows = (
  openDatabase: Effect.Effect<GraphDatabase, IssueLandingError>,
  readProductsMap: Effect.Effect<unknown, unknown> = fetchedProductsMap,
): GraphRowsService => ({
  observeAgentChips: (handles, maybeIssueNumber) =>
    observed(
      openDatabase,
      agentChipsQuery(handles, Option.getOrUndefined(maybeIssueNumber)),
      agentChipsOf,
    ),
  observeAgentFacts: handle =>
    observed(openDatabase, agentFactsQuery(handle), data => {
      const facts = agentFactsOf(data)
      return facts.runs.length === 0 ? NoPageFacts.make({}) : facts
    }),
  observeDecisionFacts: decisionId =>
    factsOfRow(
      decisionId,
      observed(openDatabase, decisionsQuery, keptDecisionsOf()),
      row => row.decisionId,
      fullId =>
        observed(openDatabase, decisionFactsQuery(fullId), data =>
          factsOrNone(decisionFactsOf(data)),
        ),
    ),
  observeDecisions: observed(openDatabase, decisionsQuery, keptDecisionsOf()),
  observeQuestionFacts: questionId =>
    factsOfRow(
      questionId,
      observed(openDatabase, questionsQuery, keptQuestionsOf()),
      row => row.questionId,
      fullId =>
        observed(openDatabase, questionFactsQuery(fullId), data =>
          factsOrNone(questionFactsOf(data)),
        ),
    ),
  observeQuestions: observed(openDatabase, questionsQuery, keptQuestionsOf()),
  observeReminderFacts: reminderId =>
    factsOfRow(
      reminderId,
      observed(openDatabase, remindersQuery, keptRemindersOf()),
      row => row.reminderId,
      fullId =>
        observed(openDatabase, reminderFactsQuery(fullId), data =>
          factsOrNone(reminderFactsOf(data)),
        ),
    ),
  observeReminders: observed(openDatabase, remindersQuery, keptRemindersOf()),
  observeFeatureChips: observed(
    openDatabase,
    featureChipsQuery,
    featureChipsOf,
  ),
  observeFeatureFacts: slug =>
    observed(openDatabase, featureFactsQuery(slug), featureFactsOf).pipe(
      Stream.switchMap(maybeFacts =>
        Option.match(maybeFacts, {
          onNone: () => Stream.succeed<PageFacts>(NoPageFacts.make({})),
          onSome: featureWithBuilds(openDatabase),
        }),
      ),
    ),
  observeFeatures: observed(openDatabase, featuresQuery, featuresOf),
  observeFindingFacts: findingId =>
    observed(openDatabase, findingFactsQuery(findingId), data =>
      factsOrNone(findingFactsOf(data)),
    ),
  observeFindings: observed(openDatabase, findingsQuery, findingsOf),
  observeIssueGraph: issueId =>
    Option.match(numberOfIssueId(issueId), {
      onNone: () => Stream.succeed(noIssueGraph),
      onSome: issueNumber =>
        observed(openDatabase, issueGraphQuery(issueNumber), data =>
          issueGraphOf(data, Option.some(issueId)),
        ),
    }),
  observeIssueAgents: issueId =>
    Option.match(numberOfIssueId(issueId), {
      onNone: () => Stream.empty,
      onSome: issueNumber =>
        observed(openDatabase, issueAgentsQuery([issueNumber]), data =>
          Array.flatMap(
            issueAgentsOf([issueNumber], data),
            found => found.agents,
          ),
        ),
    }),
  observeProductFacts: productId =>
    Stream.unwrap(
      Effect.map(Effect.result(readProductsMap), map =>
        observed(
          openDatabase,
          productFactsQuery(productId),
          (data): PageFacts => {
            const facts = productFactsOf(
              data,
              map._tag === 'Success' ? map.success : { products: {} },
              productId,
            )
            return map._tag === 'Success'
              ? facts
              : {
                  ...facts,
                  map: ProductMapUnavailable.make({
                    reason: mapFailureReason(map.failure),
                  }),
                }
          },
        ),
      ),
    ),
  observeSessionFacts: sessionId =>
    observed(openDatabase, sessionFactsQuery(sessionId), data =>
      factsOrNone(sessionFactsOf(data)),
    ),
  markFindingPromoted: (findingId, issueNumber) =>
    Effect.gen(function* () {
      const database = yield* openDatabase
      const updatedAtMs = yield* Clock.currentTimeMillis
      yield* Effect.tryPromise({
        try: () =>
          database.updateFinding(findingId, {
            promotedIssueNumber: issueNumber,
            status: 'promoted',
            updatedAtMs,
          }),
        catch: cause => new IssueLandingError({ cause }),
      }).pipe(
        Effect.timeoutOrElse({
          duration: WRITE_TIMEOUT,
          orElse: () =>
            Effect.fail(
              new IssueLandingError({
                cause: new Error('Scribe did not answer within 5 seconds.'),
              }),
            ),
        }),
      )
    }),
})
