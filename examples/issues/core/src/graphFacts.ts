import { Array, Option, Order, Predicate, Schema as S, pipe } from 'effect'

import { normalizeIssueId } from '@foldkit/instant-tools/issues'

// AGENT

/**
 * What a handle names, as Scribe's `agentRuns.name` spells it: the last path
 * part up to its account. `claude-code/issues-linear-1538@al` names
 * `issues-linear-1538`. The account in a handle is the one it logged from, and
 * a run's `agentID` says its newest account, so a run answers to several
 * handles. A sub-agent's `…@ld/Explore-afb857fb` only ever matches its whole
 * `agentID`.
 */
export const agentNameOfHandle = (handle: string): string => {
  const last = Option.getOrElse(Array.last(handle.split('/')), () => handle)
  const at = last.lastIndexOf('@')
  return at > 0 ? last.slice(0, at) : last
}

/**
 * The harness a handle starts with, known without any read:
 * `claude-code/issues-linear-1538@al` is `claude-code`, `tools/agent-run` is
 * none.
 */
export const harnessOfHandle = (handle: string): Option.Option<string> =>
  pipe(
    Option.liftPredicate(handle, text => text.includes('/')),
    Option.flatMap(text => Array.head(text.split('/'))),
    Option.filter(harness => harness !== 'tools' && harness !== 'issues'),
  )

/**
 * One run as a chip draws it: who, how it ran, and its state, such as
 * `claude-code/issues-linear-1538@max`, `claude-code`, `running`.
 */
export const AgentRunChip = S.Struct({
  agentId: S.String,
  harness: S.String,
  maybeAccount: S.Option(S.String),
  maybeEffort: S.Option(S.String),
  maybeEndedAtMs: S.Option(S.Number),
  maybeIssueId: S.Option(S.String),
  maybeKind: S.Option(S.String),
  maybeModel: S.Option(S.String),
  maybeStartedAtMs: S.Option(S.Number),
  name: S.String,
  runId: S.String,
  status: S.String,
})
/** One run as a chip draws it. */
export type AgentRunChip = typeof AgentRunChip.Type

/**
 * Everything a run's page shows of the run itself, from one `agentRuns` row:
 * how it was started, what it was asked, how it ended, and where its files are.
 */
export const AgentRun = S.Struct({
  ...AgentRunChip.fields,
  issueIds: S.Array(S.String),
  maybeAskedIn: S.Option(S.String),
  maybeAskedUrl: S.Option(S.String),
  maybeBranch: S.Option(S.String),
  maybeBriefPath: S.Option(S.String),
  maybeCostUsd: S.Option(S.Number),
  maybeEndedReason: S.Option(S.String),
  maybeExitCode: S.Option(S.Number),
  maybeHost: S.Option(S.String),
  maybeLane: S.Option(S.String),
  maybeLogPath: S.Option(S.String),
  maybeResumesRunId: S.Option(S.String),
  maybeSessionId: S.Option(S.String),
  maybeStartedBy: S.Option(S.String),
  maybeTask: S.Option(S.String),
  maybeTmux: S.Option(S.String),
  maybeWorktree: S.Option(S.String),
})
/** Everything a run's page shows of the run itself. */
export type AgentRun = typeof AgentRun.Type

/**
 * One session of a run: the harness's own id, how it ran, when, and the two
 * ways to reach it: the transcript's file on this Mac and, for the few sessions
 * with Remote Control on, its claude.ai link, which opens only on the account
 * that made it.
 */
export const AgentSession = S.Struct({
  harness: S.String,
  hostSessionId: S.String,
  issueIds: S.Array(S.String),
  maybeAccount: S.Option(S.String),
  maybeAgentId: S.Option(S.String),
  maybeBranch: S.Option(S.String),
  maybeConfigDir: S.Option(S.String),
  maybeCwd: S.Option(S.String),
  maybeEffort: S.Option(S.String),
  maybeEndedAtMs: S.Option(S.Number),
  maybeEndedReason: S.Option(S.String),
  maybeEntrypoint: S.Option(S.String),
  maybeMessageCount: S.Option(S.Number),
  maybeModel: S.Option(S.String),
  maybeRemoteUrl: S.Option(S.String),
  maybeTitle: S.Option(S.String),
  maybeToolCallCount: S.Option(S.Number),
  maybeTranscriptPath: S.Option(S.String),
  startedAtMs: S.Number,
})
/** One session of a run. */
export type AgentSession = typeof AgentSession.Type

/**
 * One thing an agent reported running into: its kind (`mistake`,
 * `environment`, `product`), where it was written, its words, and its fix when
 * it has one.
 */
export const AgentFinding = S.Struct({
  findingId: S.String,
  kind: S.String,
  maybeAgentId: S.Option(S.String),
  maybeDeepLink: S.Option(S.String),
  maybeFix: S.Option(S.String),
  maybeFixCommitSha: S.Option(S.String),
  maybeIssueId: S.Option(S.String),
  maybePromotedIssueId: S.Option(S.String),
  maybeQuoteLength: S.Option(S.Number),
  maybeSessionId: S.Option(S.String),
  occurredAtMs: S.Number,
  quote: S.String,
  source: S.String,
  status: S.String,
})
/** One thing an agent reported running into. */
export type AgentFinding = typeof AgentFinding.Type

/** A run, its sessions, findings and sub-agents, and the run that started it. */
export const AgentRunPage = S.Struct({
  children: S.Array(AgentRunChip),
  findings: S.Array(AgentFinding),
  maybeParent: S.Option(AgentRunChip),
  run: AgentRun,
  sessions: S.Array(AgentSession),
})
/** A run, its sessions, findings and sub-agents, and the run that started it. */
export type AgentRunPage = typeof AgentRunPage.Type

/**
 * What Scribe's rows say about one handle: every run it names, the newest
 * first. A name is reused across days, and a run moves accounts, so
 * `claude-code/issues-linear-1538@al` names two runs.
 */
export const AgentFacts = S.TaggedStruct('AgentFacts', {
  runs: S.Array(AgentRunPage),
})
/** What Scribe's rows say about one handle. */
export type AgentFacts = typeof AgentFacts.Type

/** What Scribe's rows say about one session: the session and its run. */
export const SessionFacts = S.TaggedStruct('SessionFacts', {
  maybeRun: S.Option(AgentRunChip),
  session: AgentSession,
})
/** What Scribe's rows say about one session. */
export type SessionFacts = typeof SessionFacts.Type

/** What Scribe's rows say about one finding: its words and the run behind it. */
export const FindingFacts = S.TaggedStruct('FindingFacts', {
  finding: AgentFinding,
  maybeRun: S.Option(AgentRunChip),
})
/** What Scribe's rows say about one finding. */
export type FindingFacts = typeof FindingFacts.Type

// FEATURE

/**
 * One line of a product's feature contract as a chip draws it: its bold name,
 * its state, and its number in the file, which can change, so a page goes by
 * its slug. `Scroll back, always.`, `active`, `3`.
 */
export const FeatureChip = S.Struct({
  isDraft: S.Boolean,
  maybeNumber: S.Option(S.Number),
  name: S.String,
  productId: S.String,
  slug: S.String,
  status: S.String,
})
/** One line of a product's feature contract as a chip draws it. */
export type FeatureChip = typeof FeatureChip.Type

/** One line with his words, whole, from `docs/FEATURES.md`, and the Issues it cites. */
export const FeatureLine = S.Struct({
  ...FeatureChip.fields,
  issueIds: S.Array(S.String),
  sourceCommittedAtMs: S.Number,
  text: S.String,
})
/** One line with his words, whole. */
export type FeatureLine = typeof FeatureLine.Type

/**
 * One Issue's tie to a feature: `implements` when the line cites it, `touches`
 * when a commit or the Issue's words name the line, with the note that says
 * how it is known.
 */
export const FeatureIssue = S.Struct({
  issueId: S.String,
  maybeBasis: S.Option(S.String),
  maybeNote: S.Option(S.String),
  predicate: S.String,
})
/** One Issue's tie to a feature. */
export type FeatureIssue = typeof FeatureIssue.Type

/** The builds one Issue's commits shipped in, by number. */
export const IssueBuilds = S.Struct({
  buildNumbers: S.Array(S.Int),
  issueId: S.String,
})
/** The builds one Issue's commits shipped in. */
export type IssueBuilds = typeof IssueBuilds.Type

/** The product a feature belongs to, as its `projects` row says. */
export const FeatureProduct = S.Struct({
  maybeKind: S.Option(S.String),
  name: S.String,
  productId: S.String,
})
/** The product a feature belongs to. */
export type FeatureProduct = typeof FeatureProduct.Type

/**
 * What Scribe's rows say about one feature: his words, when the file last said
 * them, the Issues tied to it, the builds those landed in, and its product.
 * Rows keep the newest words only, so the file's history stays in git.
 */
export const FeatureFacts = S.TaggedStruct('FeatureFacts', {
  feature: FeatureLine,
  issueBuilds: S.Array(IssueBuilds),
  issues: S.Array(FeatureIssue),
  maybeProduct: S.Option(FeatureProduct),
  maybeRemovedInCommitSha: S.Option(S.String),
  sourceCommitSha: S.String,
})
/** What Scribe's rows say about one feature. */
export type FeatureFacts = typeof FeatureFacts.Type

/** One feature an Issue is tied to, and how: `implements` or `touches`. */
export const IssueFeature = S.Struct({
  feature: FeatureChip,
  maybeBasis: S.Option(S.String),
  maybeNote: S.Option(S.String),
  namedNumbers: S.Array(S.Int),
  predicate: S.String,
})
/** One feature an Issue is tied to. */
export type IssueFeature = typeof IssueFeature.Type

/** What Scribe's rows say around an Issue: its features and its findings. */
export const IssueGraph = S.Struct({
  features: S.Array(IssueFeature),
  findings: S.Array(AgentFinding),
})
/** What Scribe's rows say around an Issue. */
export type IssueGraph = typeof IssueGraph.Type

/** An Issue with no feature and no finding known. */
export const noIssueGraph: IssueGraph = { features: [], findings: [] }

// PRODUCT

/**
 * One thing a product runs as, from its manifests: an app, an extension, a
 * CLI, a site. `ScribeSharedWatch`, `application`, `watchOS`.
 */
export const ProductSurface = S.Struct({
  bundleIds: S.Array(S.String),
  maybeDisplayName: S.Option(S.String),
  maybeGroup: S.Option(S.String),
  maybePlatform: S.Option(S.String),
  maybeType: S.Option(S.String),
  name: S.String,
  surfaceId: S.String,
})
/** One thing a product runs as. */
export type ProductSurface = typeof ProductSurface.Type

/** One Swift target or workspace package of a product, from its manifests. */
export const ProductModule = S.Struct({
  maybeGroup: S.Option(S.String),
  maybePath: S.Option(S.String),
  moduleId: S.String,
  name: S.String,
})
/** One Swift target or workspace package of a product. */
export type ProductModule = typeof ProductModule.Type

/**
 * What a product's manifests say, read from `products-map.json`, which
 * `scripts/schema/products-map.mjs` prints from git: nothing here is typed by
 * hand or stored in Instant.
 */
export const ProductMapped = S.TaggedStruct('ProductMapped', {
  modules: S.Array(ProductModule),
  platforms: S.Array(S.String),
  repos: S.Array(S.String),
  surfaces: S.Array(ProductSurface),
})
/** What a product's manifests say. */
export type ProductMapped = typeof ProductMapped.Type

/** The map could not be read, or does not hold this product, and the page says why. */
export const ProductMapUnavailable = S.TaggedStruct('ProductMapUnavailable', {
  reason: S.String,
})

/** What a product's page knows from code. */
export const ProductMapState = S.Union([ProductMapped, ProductMapUnavailable])
/** What a product's page knows from code. */
export type ProductMapState = typeof ProductMapState.Type

/**
 * What Scribe's rows and the map say about one product: its kind, features,
 * builds by number, and what its code says it runs as.
 */
export const ProductFacts = S.TaggedStruct('ProductFacts', {
  buildNumbers: S.Array(S.Int),
  features: S.Array(FeatureChip),
  map: ProductMapState,
  maybeKind: S.Option(S.String),
  maybeName: S.Option(S.String),
})
/** What Scribe's rows and the map say about one product. */
export type ProductFacts = typeof ProductFacts.Type

// STORED

const OptionalText = S.optionalKey(S.NullOr(S.String))
const OptionalNumber = S.optionalKey(S.NullOr(S.Number))

const StoredRunChip = S.Struct({
  account: OptionalText,
  agentID: S.String,
  effort: OptionalText,
  endedAtMs: OptionalNumber,
  harness: S.String,
  id: S.String,
  issueNumber: OptionalNumber,
  kind: OptionalText,
  model: OptionalText,
  name: S.String,
  startedAtMs: OptionalNumber,
  status: S.String,
})

const StoredRun = S.Struct({
  ...StoredRunChip.fields,
  askedIn: OptionalText,
  askedURL: OptionalText,
  branch: OptionalText,
  briefPath: OptionalText,
  costUsd: OptionalNumber,
  endedReason: OptionalText,
  exitCode: OptionalNumber,
  host: OptionalText,
  issueNumbersJSON: OptionalText,
  lane: OptionalText,
  logPath: OptionalText,
  resumesRunID: OptionalText,
  sessionID: OptionalText,
  startedBy: OptionalText,
  task: OptionalText,
  tmux: OptionalText,
  worktree: OptionalText,
})

const StoredSession = S.Struct({
  account: OptionalText,
  agentID: OptionalText,
  branch: OptionalText,
  configDir: OptionalText,
  cwd: OptionalText,
  effort: OptionalText,
  endedAtMs: OptionalNumber,
  endedReason: OptionalText,
  entrypoint: OptionalText,
  harness: S.String,
  hostSessionID: S.String,
  issueNumber: OptionalNumber,
  issueNumbersJSON: OptionalText,
  messageCount: OptionalNumber,
  model: OptionalText,
  remoteURL: OptionalText,
  startedAtMs: S.Number,
  title: OptionalText,
  toolCallCount: OptionalNumber,
  transcriptPath: OptionalText,
})

const StoredFinding = S.Struct({
  agentID: OptionalText,
  deepLink: OptionalText,
  fix: OptionalText,
  fixCommitSha: OptionalText,
  id: S.String,
  issueNumber: OptionalNumber,
  kind: S.String,
  occurredAtMs: S.Number,
  promotedIssueNumber: OptionalNumber,
  quote: S.String,
  quoteLength: OptionalNumber,
  sessionID: OptionalText,
  source: S.String,
  status: S.String,
})

const manyOf = <Row extends S.Top>(row: Row) =>
  S.optionalKey(S.NullOr(S.Union([row, S.Array(row)])))

const StoredRunPage = S.Struct({
  ...StoredRun.fields,
  children: manyOf(StoredRunChip),
  findings: manyOf(StoredFinding),
  parent: manyOf(StoredRunChip),
  sessions: manyOf(StoredSession),
})

const StoredAgentPages = S.Struct({ agentRuns: S.Array(StoredRunPage) })

const StoredSessionPages = S.Struct({
  agentSessions: S.Array(
    S.Struct({ ...StoredSession.fields, run: manyOf(StoredRunChip) }),
  ),
})

const StoredFindings = S.Struct({ agentFindings: S.Array(StoredFinding) })

const StoredFindingPages = S.Struct({
  agentFindings: S.Array(
    S.Struct({ ...StoredFinding.fields, agentRun: manyOf(StoredRunChip) }),
  ),
})

const StoredFeatureChip = S.Struct({
  isDraft: S.optionalKey(S.NullOr(S.Boolean)),
  name: S.String,
  number: OptionalNumber,
  productSlug: S.String,
  slug: S.String,
  status: S.String,
})

const StoredFeatureLine = S.Struct({
  ...StoredFeatureChip.fields,
  issueNumbersJSON: OptionalText,
  sourceCommittedAtMs: S.Number,
  text: S.String,
})

const StoredFeatureEdge = S.Struct({
  basis: OptionalText,
  issueNumber: OptionalNumber,
  note: OptionalText,
  predicate: S.String,
})

const StoredProject = S.Struct({
  productKind: OptionalText,
  slug: S.String,
  title: S.String,
})

const StoredFeaturePage = S.Struct({
  ...StoredFeatureLine.fields,
  edges: manyOf(StoredFeatureEdge),
  project: manyOf(StoredProject),
  removedInCommitSha: OptionalText,
  sourceCommitSha: S.String,
})

const StoredFeatures = S.Struct({ features: S.Array(StoredFeatureLine) })
const StoredFeatureChips = S.Struct({ features: S.Array(StoredFeatureChip) })
const StoredFeaturePages = S.Struct({ features: S.Array(StoredFeaturePage) })

const StoredIssueGraph = S.Struct({
  agentFindings: S.Array(StoredFinding),
  edges: S.Array(
    S.Struct({
      basis: OptionalText,
      feature: manyOf(StoredFeatureChip),
      note: OptionalText,
      predicate: S.String,
    }),
  ),
})

const StoredShippedBuild = S.Struct({ number: S.Number })

const StoredIssueCommit = S.Struct({
  edges: manyOf(S.Struct({ build: manyOf(StoredShippedBuild) })),
})

const StoredIssueBuilds = S.Struct({
  edges: S.Array(
    S.Struct({
      commit: manyOf(StoredIssueCommit),
      issueNumber: OptionalNumber,
    }),
  ),
})

const StoredProductPages = S.Struct({
  builds: S.Array(S.Struct({ number: S.Number })),
  projects: S.Array(
    S.Struct({ ...StoredProject.fields, features: manyOf(StoredFeatureChip) }),
  ),
})

const StoredSurface = S.Struct({
  bundleIDs: S.optionalKey(S.NullOr(S.Array(S.String))),
  displayName: OptionalText,
  group: OptionalText,
  id: S.String,
  name: S.String,
  platform: OptionalText,
  type: OptionalText,
})

const StoredModule = S.Struct({
  group: OptionalText,
  id: S.String,
  name: S.String,
  path: OptionalText,
})

const StoredMap = S.Struct({
  products: S.Record(
    S.String,
    S.Struct({
      modules: S.Array(StoredModule),
      platforms: S.Array(S.String),
      repos: S.Array(S.String),
      surfaces: S.Array(StoredSurface),
    }),
  ),
})

const isList = <A>(value: A | ReadonlyArray<A>): value is ReadonlyArray<A> =>
  globalThis.Array.isArray(value)

const listOf = <A>(
  value: A | ReadonlyArray<A> | null | undefined,
): ReadonlyArray<A> => {
  if (value === null || value === undefined) {
    return []
  } else if (isList(value)) {
    return value
  } else {
    return [value]
  }
}

/** An Issue's number as the tracker's id: `41` is `041`, `1538` is `1538`. */
export const issueIdOfNumber = (issueNumber: number): string =>
  Option.getOrElse(normalizeIssueId(issueNumber.toString()), () =>
    issueNumber.toString(),
  )

const numbersOfJson = (
  stored: string | null | undefined,
): ReadonlyArray<number> =>
  pipe(
    Option.fromNullishOr(stored),
    Option.flatMap(
      Option.liftThrowable((text: string): unknown => JSON.parse(text)),
    ),
    Option.flatMap(S.decodeUnknownOption(S.Array(S.Number))),
    Option.getOrElse((): ReadonlyArray<number> => []),
  )

const issueIdsOf = (
  maybeFirst: number | null | undefined,
  stored: string | null | undefined,
): ReadonlyArray<string> =>
  pipe(
    [maybeFirst, ...numbersOfJson(stored)],
    Array.filter(Predicate.isNumber),
    Array.dedupe,
    Array.map(issueIdOfNumber),
  )

const runChipOf = (stored: typeof StoredRunChip.Type): AgentRunChip =>
  AgentRunChip.make({
    agentId: stored.agentID,
    harness: stored.harness,
    maybeAccount: Option.fromNullishOr(stored.account),
    maybeEffort: Option.fromNullishOr(stored.effort),
    maybeEndedAtMs: Option.fromNullishOr(stored.endedAtMs),
    maybeIssueId: Option.map(
      Option.fromNullishOr(stored.issueNumber),
      issueIdOfNumber,
    ),
    maybeKind: Option.fromNullishOr(stored.kind),
    maybeModel: Option.fromNullishOr(stored.model),
    maybeStartedAtMs: Option.fromNullishOr(stored.startedAtMs),
    name: stored.name,
    runId: stored.id,
    status: stored.status,
  })

const runOf = (stored: typeof StoredRun.Type): AgentRun =>
  AgentRun.make({
    ...runChipOf(stored),
    issueIds: issueIdsOf(stored.issueNumber, stored.issueNumbersJSON),
    maybeAskedIn: Option.fromNullishOr(stored.askedIn),
    maybeAskedUrl: Option.fromNullishOr(stored.askedURL),
    maybeBranch: Option.fromNullishOr(stored.branch),
    maybeBriefPath: Option.fromNullishOr(stored.briefPath),
    maybeCostUsd: Option.fromNullishOr(stored.costUsd),
    maybeEndedReason: Option.fromNullishOr(stored.endedReason),
    maybeExitCode: Option.fromNullishOr(stored.exitCode),
    maybeHost: Option.fromNullishOr(stored.host),
    maybeLane: Option.fromNullishOr(stored.lane),
    maybeLogPath: Option.fromNullishOr(stored.logPath),
    maybeResumesRunId: Option.fromNullishOr(stored.resumesRunID),
    maybeSessionId: Option.fromNullishOr(stored.sessionID),
    maybeStartedBy: Option.fromNullishOr(stored.startedBy),
    maybeTask: Option.fromNullishOr(stored.task),
    maybeTmux: Option.fromNullishOr(stored.tmux),
    maybeWorktree: Option.fromNullishOr(stored.worktree),
  })

const sessionOf = (stored: typeof StoredSession.Type): AgentSession =>
  AgentSession.make({
    harness: stored.harness,
    hostSessionId: stored.hostSessionID,
    issueIds: issueIdsOf(stored.issueNumber, stored.issueNumbersJSON),
    maybeAccount: Option.fromNullishOr(stored.account),
    maybeAgentId: Option.fromNullishOr(stored.agentID),
    maybeBranch: Option.fromNullishOr(stored.branch),
    maybeConfigDir: Option.fromNullishOr(stored.configDir),
    maybeCwd: Option.fromNullishOr(stored.cwd),
    maybeEffort: Option.fromNullishOr(stored.effort),
    maybeEndedAtMs: Option.fromNullishOr(stored.endedAtMs),
    maybeEndedReason: Option.fromNullishOr(stored.endedReason),
    maybeEntrypoint: Option.fromNullishOr(stored.entrypoint),
    maybeMessageCount: Option.fromNullishOr(stored.messageCount),
    maybeModel: Option.fromNullishOr(stored.model),
    maybeRemoteUrl: Option.fromNullishOr(stored.remoteURL),
    maybeTitle: Option.fromNullishOr(stored.title),
    maybeToolCallCount: Option.fromNullishOr(stored.toolCallCount),
    maybeTranscriptPath: Option.fromNullishOr(stored.transcriptPath),
    startedAtMs: stored.startedAtMs,
  })

const issueIdOfStored = (
  stored: number | null | undefined,
): Option.Option<string> =>
  Option.map(Option.fromNullishOr(stored), issueIdOfNumber)

const findingOf = (stored: typeof StoredFinding.Type): AgentFinding =>
  AgentFinding.make({
    findingId: stored.id,
    kind: stored.kind,
    maybeAgentId: Option.fromNullishOr(stored.agentID),
    maybeDeepLink: Option.fromNullishOr(stored.deepLink),
    maybeFix: Option.fromNullishOr(stored.fix),
    maybeFixCommitSha: Option.fromNullishOr(stored.fixCommitSha),
    maybeIssueId: issueIdOfStored(stored.issueNumber),
    maybePromotedIssueId: issueIdOfStored(stored.promotedIssueNumber),
    maybeQuoteLength: Option.fromNullishOr(stored.quoteLength),
    maybeSessionId: Option.fromNullishOr(stored.sessionID),
    occurredAtMs: stored.occurredAtMs,
    quote: stored.quote,
    source: stored.source,
    status: stored.status,
  })

const startedAt = (run: AgentRunChip): number =>
  Option.getOrElse(run.maybeStartedAtMs, () => 0)

const oldestRunFirst: Order.Order<AgentRunChip> = Order.mapInput(
  Order.Number,
  startedAt,
)

const newestPageFirst: Order.Order<AgentRunPage> = Order.flip(
  Order.mapInput(oldestRunFirst, (page: AgentRunPage) => page.run),
)

const oldestSessionFirst: Order.Order<AgentSession> = Order.mapInput(
  Order.Number,
  (session: AgentSession) => session.startedAtMs,
)

/** The newest finding first. */
export const newestFindingFirst: Order.Order<AgentFinding> = Order.flip(
  Order.mapInput(Order.Number, (finding: AgentFinding) => finding.occurredAtMs),
)

/**
 * An agent's page from the rows Instant answers with: every run, the newest
 * first, each with its sessions oldest first, its findings newest first and
 * its sub-agents in the order they started. Instant answers a link to one row
 * as that row or as a list of one; both read the same.
 */
export const agentFactsOf = (data: unknown): AgentFacts =>
  AgentFacts.make({
    runs: Array.sort(
      Array.map(
        S.decodeUnknownSync(StoredAgentPages)(data).agentRuns,
        stored => ({
          children: Array.sort(
            Array.map(listOf(stored.children), runChipOf),
            oldestRunFirst,
          ),
          findings: Array.sort(
            Array.map(listOf(stored.findings), findingOf),
            newestFindingFirst,
          ),
          maybeParent: Option.map(Array.head(listOf(stored.parent)), runChipOf),
          run: runOf(stored),
          sessions: Array.sort(
            Array.map(listOf(stored.sessions), sessionOf),
            oldestSessionFirst,
          ),
        }),
      ),
      newestPageFirst,
    ),
  })

/** A session's page from the row Instant answers with, none when it holds none. */
export const sessionFactsOf = (data: unknown): Option.Option<SessionFacts> =>
  Option.map(
    Array.head(S.decodeUnknownSync(StoredSessionPages)(data).agentSessions),
    stored =>
      SessionFacts.make({
        maybeRun: Option.map(Array.head(listOf(stored.run)), runChipOf),
        session: sessionOf(stored),
      }),
  )

/** Every finding Instant answers with, the newest first. */
export const findingsOf = (data: unknown): ReadonlyArray<AgentFinding> =>
  Array.sort(
    Array.map(
      S.decodeUnknownSync(StoredFindings)(data).agentFindings,
      findingOf,
    ),
    newestFindingFirst,
  )

/** A finding's page from the row Instant answers with, none when it holds none. */
export const findingFactsOf = (data: unknown): Option.Option<FindingFacts> =>
  Option.map(
    Array.head(S.decodeUnknownSync(StoredFindingPages)(data).agentFindings),
    stored =>
      FindingFacts.make({
        finding: findingOf(stored),
        maybeRun: Option.map(Array.head(listOf(stored.agentRun)), runChipOf),
      }),
  )

const featureChipOf = (stored: typeof StoredFeatureChip.Type): FeatureChip =>
  FeatureChip.make({
    isDraft: stored.isDraft === true,
    maybeNumber: Option.fromNullishOr(stored.number),
    name: stored.name,
    productId: stored.productSlug,
    slug: stored.slug,
    status: stored.status,
  })

const featureLineOf = (stored: typeof StoredFeatureLine.Type): FeatureLine =>
  FeatureLine.make({
    ...featureChipOf(stored),
    issueIds: issueIdsOf(undefined, stored.issueNumbersJSON),
    sourceCommittedAtMs: stored.sourceCommittedAtMs,
    text: stored.text,
  })

const LAST_NUMBER = Number.MAX_SAFE_INTEGER

/** His order: the numbered lines, then what left the file, by name. */
export const featureOrder: Order.Order<FeatureChip> = Order.combine(
  Order.mapInput(Order.Number, (feature: FeatureChip) =>
    Option.getOrElse(feature.maybeNumber, () => LAST_NUMBER),
  ),
  Order.mapInput(Order.String, (feature: FeatureChip) => feature.name),
)

/** Every line Instant answers with, in his order. */
export const featuresOf = (data: unknown): ReadonlyArray<FeatureLine> =>
  Array.sort(
    Array.map(
      S.decodeUnknownSync(StoredFeatures)(data).features,
      featureLineOf,
    ),
    featureOrder,
  )

/** Every line's chip Instant answers with, in his order. */
export const featureChipsOf = (data: unknown): ReadonlyArray<FeatureChip> =>
  Array.sort(
    Array.map(
      S.decodeUnknownSync(StoredFeatureChips)(data).features,
      featureChipOf,
    ),
    featureOrder,
  )

const featureIssuesOf = (
  edges: ReadonlyArray<typeof StoredFeatureEdge.Type>,
): ReadonlyArray<FeatureIssue> =>
  Array.flatMap(edges, edge =>
    Option.match(Option.fromNullishOr(edge.issueNumber), {
      onNone: () => [],
      onSome: issueNumber => [
        FeatureIssue.make({
          issueId: issueIdOfNumber(issueNumber),
          maybeBasis: Option.fromNullishOr(edge.basis),
          maybeNote: Option.fromNullishOr(edge.note),
          predicate: edge.predicate,
        }),
      ],
    }),
  )

/**
 * A feature's page from the row Instant answers with, none when it holds none.
 * The builds its Issues landed in come from a second read, {@link featureBuildsQuery}.
 */
export const featureFactsOf = (data: unknown): Option.Option<FeatureFacts> =>
  Option.map(
    Array.head(S.decodeUnknownSync(StoredFeaturePages)(data).features),
    stored =>
      FeatureFacts.make({
        feature: featureLineOf(stored),
        issueBuilds: [],
        issues: featureIssuesOf(listOf(stored.edges)),
        maybeProduct: Option.map(Array.head(listOf(stored.project)), project =>
          FeatureProduct.make({
            maybeKind: Option.fromNullishOr(project.productKind),
            name: project.title,
            productId: project.slug,
          }),
        ),
        maybeRemovedInCommitSha: Option.fromNullishOr(
          stored.removedInCommitSha,
        ),
        sourceCommitSha: stored.sourceCommitSha,
      }),
  )

const NAMED_NUMBER = /\bnames FEATURES (\d{1,2}),/

const namedNumberOf = (
  note: string | null | undefined,
): ReadonlyArray<number> =>
  pipe(
    Option.fromNullishOr(note),
    Option.flatMapNullishOr(text => NAMED_NUMBER.exec(text)?.[1]),
    Option.map(Number),
    Option.toArray,
  )

const implementsFirst: Order.Order<IssueFeature> = Order.mapInput(
  Order.Number,
  (tie: IssueFeature) => (tie.predicate === 'implements' ? 0 : 1),
)

/**
 * The features and findings around an Issue from the rows Instant answers
 * with: each feature once, its strongest tie kept, with every number the
 * Issue's words gave it, in his order, and the findings, the newest first. A
 * `touches` note says `#702's details names FEATURES 3, Recording., as of
 * 521edbfdb`, so `3` on that Issue names Recording, whatever the file says now.
 */
export const issueGraphOf = (data: unknown): IssueGraph => {
  const { agentFindings, edges } = S.decodeUnknownSync(StoredIssueGraph)(data)
  const ties = Array.flatMap(edges, edge =>
    Array.map(listOf(edge.feature), feature =>
      IssueFeature.make({
        feature: featureChipOf(feature),
        maybeBasis: Option.fromNullishOr(edge.basis),
        maybeNote: Option.fromNullishOr(edge.note),
        namedNumbers: namedNumberOf(edge.note),
        predicate: edge.predicate,
      }),
    ),
  )
  const numbersOfSlug = (slug: string): ReadonlyArray<number> =>
    pipe(
      ties,
      Array.filter(tie => tie.feature.slug === slug),
      Array.flatMap(tie => tie.namedNumbers),
      Array.dedupe,
    )
  return IssueGraph.make({
    features: pipe(
      ties,
      Array.sort(implementsFirst),
      Array.dedupeWith(
        (left, right) => left.feature.slug === right.feature.slug,
      ),
      Array.map(tie => ({
        ...tie,
        namedNumbers: numbersOfSlug(tie.feature.slug),
      })),
      Array.sort(
        Order.mapInput(featureOrder, (tie: IssueFeature) => tie.feature),
      ),
    ),
    findings: Array.sort(
      Array.map(agentFindings, findingOf),
      newestFindingFirst,
    ),
  })
}

const shippedNumbers = (
  commits: ReadonlyArray<typeof StoredIssueCommit.Type>,
): ReadonlyArray<number> =>
  pipe(
    commits,
    Array.flatMap(commit => listOf(commit.edges)),
    Array.flatMap(edge => listOf(edge.build)),
    Array.map(build => build.number),
  )

/**
 * The builds each Issue shipped in, lowest number first, from each `implements`
 * edge's commit and that commit's `shippedIn` edges.
 */
export const issueBuildsOf = (data: unknown): ReadonlyArray<IssueBuilds> => {
  const byIssue = new Map<number, ReadonlyArray<number>>()
  for (const edge of S.decodeUnknownSync(StoredIssueBuilds)(data).edges) {
    const issueNumber = edge.issueNumber
    if (issueNumber !== null && issueNumber !== undefined) {
      byIssue.set(issueNumber, [
        ...(byIssue.get(issueNumber) ?? []),
        ...shippedNumbers(listOf(edge.commit)),
      ])
    }
  }
  return Array.map([...byIssue], ([issueNumber, numbers]) =>
    IssueBuilds.make({
      buildNumbers: Array.sort(Array.dedupe(numbers), Order.Number),
      issueId: issueIdOfNumber(issueNumber),
    }),
  )
}

const surfaceOf = (stored: typeof StoredSurface.Type): ProductSurface =>
  ProductSurface.make({
    bundleIds: stored.bundleIDs ?? [],
    maybeDisplayName: Option.fromNullishOr(stored.displayName),
    maybeGroup: Option.fromNullishOr(stored.group),
    maybePlatform: Option.fromNullishOr(stored.platform),
    maybeType: Option.fromNullishOr(stored.type),
    name: stored.name,
    surfaceId: stored.id,
  })

const moduleOf = (stored: typeof StoredModule.Type): ProductModule =>
  ProductModule.make({
    maybeGroup: Option.fromNullishOr(stored.group),
    maybePath: Option.fromNullishOr(stored.path),
    moduleId: stored.id,
    name: stored.name,
  })

/** One product's part of `products-map.json`, none when it holds no such product. */
export const productMapOf = (
  data: unknown,
  productId: string,
): Option.Option<ProductMapped> =>
  Option.map(
    Option.fromUndefinedOr(
      S.decodeUnknownSync(StoredMap)(data).products[productId],
    ),
    stored =>
      ProductMapped.make({
        modules: Array.map(stored.modules, moduleOf),
        platforms: stored.platforms,
        repos: stored.repos,
        surfaces: Array.map(stored.surfaces, surfaceOf),
      }),
  )

const NOT_MAPPED = 'The map of code holds no such product.'

/**
 * A product's page from the rows Instant answers with and what the map says:
 * `map` is the parsed `products-map.json`.
 */
export const productFactsOf = (
  data: unknown,
  map: unknown,
  productId: string,
): ProductFacts => {
  const { builds, projects } = S.decodeUnknownSync(StoredProductPages)(data)
  const maybeProject = Array.head(projects)
  return ProductFacts.make({
    buildNumbers: Array.sort(
      Array.map(builds, build => build.number),
      Order.flip(Order.Number),
    ),
    features: Option.match(maybeProject, {
      onNone: () => [],
      onSome: project =>
        Array.sort(
          Array.map(listOf(project.features), featureChipOf),
          featureOrder,
        ),
    }),
    map: Option.getOrElse(
      productMapOf(map, productId),
      (): ProductMapState => ProductMapUnavailable.make({ reason: NOT_MAPPED }),
    ),
    maybeKind: Option.flatMap(maybeProject, project =>
      Option.fromNullishOr(project.productKind),
    ),
    maybeName: Option.map(maybeProject, project => project.title),
  })
}

// QUERY

const RUN_CHIP_FIELDS = [
  'account',
  'agentID',
  'effort',
  'endedAtMs',
  'harness',
  'issueNumber',
  'kind',
  'model',
  'name',
  'startedAtMs',
  'status',
]

const RUN_FIELDS = [
  ...RUN_CHIP_FIELDS,
  'askedIn',
  'askedURL',
  'branch',
  'briefPath',
  'costUsd',
  'endedReason',
  'exitCode',
  'host',
  'issueNumbersJSON',
  'lane',
  'logPath',
  'resumesRunID',
  'sessionID',
  'startedBy',
  'task',
  'tmux',
  'worktree',
]

const SESSION_FIELDS = [
  'account',
  'agentID',
  'branch',
  'configDir',
  'cwd',
  'effort',
  'endedAtMs',
  'endedReason',
  'entrypoint',
  'harness',
  'hostSessionID',
  'issueNumber',
  'issueNumbersJSON',
  'messageCount',
  'model',
  'remoteURL',
  'startedAtMs',
  'title',
  'toolCallCount',
  'transcriptPath',
]

const FINDING_FIELDS = [
  'agentID',
  'deepLink',
  'fix',
  'fixCommitSha',
  'issueNumber',
  'kind',
  'occurredAtMs',
  'promotedIssueNumber',
  'quote',
  'quoteLength',
  'sessionID',
  'source',
  'status',
]

/**
 * What an agent's page asks for: every run the handle or its name names, with
 * each run's sessions, findings, sub-agents and parent, by indexed `agentID`
 * and `name`, so the page costs its own runs and nothing per unrelated run.
 */
export const agentFactsQuery = (handle: string) => ({
  agentRuns: {
    $: {
      where: {
        or: [{ agentID: handle }, { name: agentNameOfHandle(handle) }],
      },
      fields: RUN_FIELDS,
    },
    children: { $: { fields: RUN_CHIP_FIELDS } },
    findings: { $: { fields: FINDING_FIELDS } },
    parent: { $: { fields: RUN_CHIP_FIELDS } },
    sessions: { $: { fields: SESSION_FIELDS } },
  },
})

const FULL_SESSION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NEXT_AFTER_ANY_HEX = 'g'

const sessionWhere = (sessionId: string) =>
  FULL_SESSION_ID.test(sessionId)
    ? { hostSessionID: sessionId }
    : {
        and: [
          { hostSessionID: { $gte: sessionId } },
          { hostSessionID: { $lte: `${sessionId}${NEXT_AFTER_ANY_HEX}` } },
        ],
      }

/**
 * What a session's page asks for: the row by its harness's id, and its run.
 * Text often gives the first eight characters, `2914b977`, which read a range
 * on the same index.
 */
export const sessionFactsQuery = (hostSessionId: string) => ({
  agentSessions: {
    $: { where: sessionWhere(hostSessionId), fields: SESSION_FIELDS },
    run: { $: { fields: RUN_CHIP_FIELDS } },
  },
})

/**
 * What a page's agent chips ask for: the drawn fields of the runs the page
 * names, by indexed `agentID` and `name`. It reads only what the open page
 * names, never the 2,600 runs.
 */
export const agentChipsQuery = (
  handles: ReadonlyArray<string>,
  maybeIssueNumber?: number,
) => ({
  agentRuns: {
    $: {
      where: {
        or: [
          { agentID: { $in: [...handles] } },
          {
            name: { $in: Array.dedupe(Array.map(handles, agentNameOfHandle)) },
          },
          ...(maybeIssueNumber === undefined
            ? []
            : [{ issueNumber: maybeIssueNumber }]),
        ],
      },
      fields: RUN_CHIP_FIELDS,
    },
  },
})

const StoredAgentChips = S.Struct({ agentRuns: S.Array(StoredRunChip) })

/** The runs a page's chips draw, from the rows Instant answers with. */
export const agentChipsOf = (data: unknown): ReadonlyArray<AgentRunChip> =>
  Array.map(S.decodeUnknownSync(StoredAgentChips)(data).agentRuns, runChipOf)

/**
 * What `/findings` asks for: every finding's scalars, the newest first, and no
 * link per row. Its `agentID`, `sessionID` and `issueNumber` link the rest.
 */
export const findingsQuery = {
  agentFindings: {
    $: {
      fields: FINDING_FIELDS,
      order: { occurredAtMs: 'desc' as const },
    },
  },
}

/** What a finding's page asks for: the row by its id, and its run. */
export const findingFactsQuery = (findingId: string) => ({
  agentFindings: {
    $: { where: { id: findingId }, fields: FINDING_FIELDS },
    agentRun: { $: { fields: RUN_CHIP_FIELDS } },
  },
})

const FEATURE_CHIP_FIELDS = [
  'isDraft',
  'name',
  'number',
  'productSlug',
  'slug',
  'status',
]

const FEATURE_LINE_FIELDS = [
  ...FEATURE_CHIP_FIELDS,
  'issueNumbersJSON',
  'sourceCommittedAtMs',
  'text',
]

/** What `/features` asks for: every line's scalars, his words among them. */
export const featuresQuery = {
  features: { $: { fields: FEATURE_LINE_FIELDS } },
}

/** Every line without its words, for a page's chips and the palette. */
export const featureChipsQuery = {
  features: { $: { fields: FEATURE_CHIP_FIELDS } },
}

/** What a feature's page asks for: the line, its Issues and its product. */
export const featureFactsQuery = (slug: string) => ({
  features: {
    $: {
      where: { slug },
      fields: [...FEATURE_LINE_FIELDS, 'removedInCommitSha', 'sourceCommitSha'],
    },
    edges: { $: { fields: ['basis', 'issueNumber', 'note', 'predicate'] } },
    project: { $: { fields: ['productKind', 'slug', 'title'] } },
  },
})

/**
 * Which builds Issues landed in: each `implements` edge by its indexed
 * `issueNumber`, its commit's `shippedIn` edges, and each build's number. The
 * page knows every build already, so it reads no more of one.
 */
export const featureBuildsQuery = (issueNumbers: ReadonlyArray<number>) => ({
  edges: {
    $: {
      where: {
        issueNumber: { $in: [...issueNumbers] },
        objectKind: 'issue',
        predicate: 'implements',
      },
      fields: ['issueNumber'],
    },
    commit: {
      $: { fields: ['sha'] },
      edges: {
        $: { where: { predicate: 'shippedIn' }, fields: ['predicate'] },
        build: { $: { fields: ['number'] } },
      },
    },
  },
})

/**
 * What a product's page asks for: its `projects` row by its slug, its features
 * without their words, and its builds by their app, for their numbers.
 */
export const productFactsQuery = (productId: string) => ({
  builds: { $: { where: { app: productId }, fields: ['number'] } },
  projects: {
    $: {
      where: { slug: productId },
      fields: ['productKind', 'slug', 'title'],
    },
    features: { $: { fields: FEATURE_CHIP_FIELDS } },
  },
})

/**
 * What an Issue's page asks of the graph: the features its number is tied to,
 * and the findings raised on it or promoted into it, by indexed fields.
 */
export const issueGraphQuery = (issueNumber: number) => ({
  agentFindings: {
    $: {
      where: {
        or: [{ issueNumber }, { promotedIssueNumber: issueNumber }],
      },
      fields: FINDING_FIELDS,
    },
  },
  edges: {
    $: {
      where: { issueNumber, objectKind: 'feature' },
      fields: ['basis', 'note', 'predicate'],
    },
    feature: { $: { fields: FEATURE_CHIP_FIELDS } },
  },
})

/** Every query the graph's pages ask Scribe's app. */
export type GraphQuery =
  | ReturnType<typeof agentChipsQuery>
  | ReturnType<typeof agentFactsQuery>
  | ReturnType<typeof featureBuildsQuery>
  | ReturnType<typeof featureFactsQuery>
  | ReturnType<typeof findingFactsQuery>
  | ReturnType<typeof issueGraphQuery>
  | ReturnType<typeof productFactsQuery>
  | ReturnType<typeof sessionFactsQuery>
  | typeof featureChipsQuery
  | typeof featuresQuery
  | typeof findingsQuery
