import { Effect, Option, Schema as S } from 'effect'

import {
  Issue,
  IssueLandingState,
  IssueReference,
  IssueStatus,
  IssueSuccessEvidence,
  IssueWorkActivity,
  ProductCatalogEntry,
  TrackedProduct,
  TriageCandidate,
} from '@foldkit/instant-tools/issues'
import { LeftoverPeer } from '@foldkit/instant-tools/leftover'
import { IssueLogEvidence } from '@foldkit/instant-tools/logging'

import { DecisionRow } from './decisionFacts.js'
import { PageEntity } from './entityGraph.js'
import {
  AgentFinding,
  AgentRunChip,
  FeatureChip,
  FeatureLine,
  IssueGraph,
} from './graphFacts.js'
import { InboxFilter } from './inbox.js'
import { IssueFileAddress } from './issueFiles.js'
import { IssueLanding, LandedBuild, PageFacts } from './issueLandings.js'
import { IssueView, defaultIssueView } from './issueView.js'
import { SavedView } from './issueViews.js'
import { AllProducts, LeftoverKind, ProductFilter } from './leftover.js'
import { QuestionRow } from './questionFacts.js'
import { ReminderRow } from './reminderFacts.js'
import { FailedRowEdit, RowEdit } from './rowEdit.js'

/** The live collection has not emitted its first snapshot. */
export const LoadingIssues = S.TaggedStruct('LoadingIssues', {})
/** The live collection emitted its latest snapshot. */
export const LoadedIssues = S.TaggedStruct('LoadedIssues', {
  issues: S.Array(Issue),
})

/**
 * The loaded Issues, built without walking them again: the store decoded
 * them when they arrived, and `LoadedIssues.make` re-validates every one,
 * about 105 ms for the 1,535 stored Issues.
 */
export const loadedIssuesOf = (
  issues: ReadonlyArray<Issue>,
): typeof LoadedIssues.Type => ({ _tag: 'LoadedIssues', issues })
/** Live collection observation failed. */
export const FailedIssues = S.TaggedStruct('FailedIssues', {
  reason: S.String,
})
/** Every live Issue collection state. */
export const IssuesState = S.Union([LoadingIssues, LoadedIssues, FailedIssues])
/** Every live Issue collection state. */
export type IssuesState = typeof IssuesState.Type

/** The product catalog has not emitted its first snapshot. */
export const LoadingProducts = S.TaggedStruct('LoadingProducts', {})
/** The product catalog emitted its latest snapshot. */
export const LoadedProducts = S.TaggedStruct('LoadedProducts', {
  products: S.Array(ProductCatalogEntry),
})
/** Product catalog observation failed. */
export const FailedProducts = S.TaggedStruct('FailedProducts', {
  reason: S.String,
})
/** Every first-class product catalog state. */
export const ProductsState = S.Union([
  LoadingProducts,
  LoadedProducts,
  FailedProducts,
])
/** Every first-class product catalog state. */
export type ProductsState = typeof ProductsState.Type

/** Transcript-derived triage drafts have not emitted their first snapshot. */
export const LoadingTriageCandidates = S.TaggedStruct(
  'LoadingTriageCandidates',
  {},
)
/** The latest transcript-derived triage drafts are available. */
export const LoadedTriageCandidates = S.TaggedStruct('LoadedTriageCandidates', {
  candidates: S.Array(TriageCandidate),
})
/** Transcript-derived triage observation failed. */
export const FailedTriageCandidates = S.TaggedStruct('FailedTriageCandidates', {
  reason: S.String,
})
/** Every transcript triage observation state. */
export const TriageCandidatesState = S.Union([
  LoadingTriageCandidates,
  LoadedTriageCandidates,
  FailedTriageCandidates,
])
/** Every transcript triage observation state. */
export type TriageCandidatesState = typeof TriageCandidatesState.Type

/** No individual Issue destination is being observed. */
export const NotObservingIssue = S.TaggedStruct('NotObservingIssue', {})
/** One individual Issue is being observed, but has not emitted yet. */
export const LoadingIssue = S.TaggedStruct('LoadingIssue', {
  issueId: S.String,
})
/** One individual Issue observation emitted. */
export const LoadedIssue = S.TaggedStruct('LoadedIssue', {
  issue: S.Option(Issue),
  issueId: S.String,
})
/** One individual Issue observation failed. */
export const FailedIssue = S.TaggedStruct('FailedIssue', {
  issueId: S.String,
  reason: S.String,
})
/** Every selected-Issue observation state. */
export const IssueDetailState = S.Union([
  NotObservingIssue,
  LoadingIssue,
  LoadedIssue,
  FailedIssue,
])
/** Every selected-Issue observation state. */
export type IssueDetailState = typeof IssueDetailState.Type

/** No Issue log evidence destination is selected. */
export const NotObservingIssueLogs = S.TaggedStruct('NotObservingIssueLogs', {})
/** The selected Issue log query has not emitted yet. */
export const LoadingIssueLogs = S.TaggedStruct('LoadingIssueLogs', {
  issueId: S.String,
})
/** The selected Issue log query emitted its latest evidence rows. */
export const LoadedIssueLogs = S.TaggedStruct('LoadedIssueLogs', {
  issueId: S.String,
  logs: S.Array(IssueLogEvidence),
})
/** The selected Issue log query failed. */
export const FailedIssueLogs = S.TaggedStruct('FailedIssueLogs', {
  issueId: S.String,
  reason: S.String,
})
/** Every selected Issue log evidence state. */
export const IssueLogsState = S.Union([
  NotObservingIssueLogs,
  LoadingIssueLogs,
  LoadedIssueLogs,
  FailedIssueLogs,
])
/** Every selected Issue log evidence state. */
export type IssueLogsState = typeof IssueLogsState.Type

/** No Issue page is open, so no stored files are read. */
export const NotObservingIssueFiles = S.TaggedStruct(
  'NotObservingIssueFiles',
  {},
)
/** The open Issue's stored files and where the page can show them. */
export const LoadedIssueFiles = S.TaggedStruct('LoadedIssueFiles', {
  files: S.Array(IssueFileAddress),
  issueId: S.String,
})
/** The open Issue's stored files could not be read. */
export const FailedIssueFiles = S.TaggedStruct('FailedIssueFiles', {
  issueId: S.String,
  reason: S.String,
})
/** Every state of the open Issue's stored files (Scribe #1345). */
export const IssueFilesState = S.Union([
  NotObservingIssueFiles,
  LoadedIssueFiles,
  FailedIssueFiles,
])
/** Every state of the open Issue's stored files (Scribe #1345). */
export type IssueFilesState = typeof IssueFilesState.Type

/** No Issue is open, so no landing is read. */
export const NotObservingIssueLanding = S.TaggedStruct(
  'NotObservingIssueLanding',
  {},
)
/** Where the open Issue landed, from Scribe's rows. */
export const LoadedIssueLanding = S.TaggedStruct('LoadedIssueLanding', {
  issueId: S.String,
  landing: IssueLanding,
})
/** Scribe's rows could not be read, and the Issue page says why. */
export const FailedIssueLanding = S.TaggedStruct('FailedIssueLanding', {
  issueId: S.String,
  reason: S.String,
})
/** Every state of reading where the open Issue landed. */
export const IssueLandingObservation = S.Union([
  NotObservingIssueLanding,
  LoadedIssueLanding,
  FailedIssueLanding,
])
/** Every state of reading where the open Issue landed. */
export type IssueLandingObservation = typeof IssueLandingObservation.Type

/** No Issue is open, so nothing around one is read. */
export const NotObservingIssueGraph = S.TaggedStruct(
  'NotObservingIssueGraph',
  {},
)
/** The features and findings around the open Issue, from Scribe's rows. */
export const LoadedIssueGraph = S.TaggedStruct('LoadedIssueGraph', {
  graph: IssueGraph,
  issueId: S.String,
})
/** Scribe's rows could not be read, and the Issue page says why. */
export const FailedIssueGraph = S.TaggedStruct('FailedIssueGraph', {
  issueId: S.String,
  reason: S.String,
})
/** Every state of reading what stands around the open Issue. */
export const IssueGraphObservation = S.Union([
  NotObservingIssueGraph,
  LoadedIssueGraph,
  FailedIssueGraph,
])
/** Every state of reading what stands around the open Issue. */
export type IssueGraphObservation = typeof IssueGraphObservation.Type

/** No build or commit page is open, or the host has no graph. */
export const NotObservingPageFacts = S.TaggedStruct('NotObservingPageFacts', {})
/** What Scribe's rows say about the entity on the page. */
export const LoadedPageFacts = S.TaggedStruct('LoadedPageFacts', {
  entity: PageEntity,
  facts: PageFacts,
})
/** Scribe's rows could not be read for the entity on the page. */
export const FailedPageFacts = S.TaggedStruct('FailedPageFacts', {
  entity: PageEntity,
  reason: S.String,
})
/** Every state of reading what Scribe's rows say about the entity on the page. */
export const PageFactsObservation = S.Union([
  NotObservingPageFacts,
  LoadedPageFacts,
  FailedPageFacts,
])
/** Every state of reading what Scribe's rows say about the entity on the page. */
export type PageFactsObservation = typeof PageFactsObservation.Type

/** No findings page is open, so no finding is read. */
export const NotObservingFindings = S.TaggedStruct('NotObservingFindings', {})
/** Every finding, from Scribe's rows, the newest first. */
export const LoadedFindings = S.TaggedStruct('LoadedFindings', {
  findings: S.Array(AgentFinding),
})
/** Scribe's rows could not be read, and the page says why. */
export const FailedFindings = S.TaggedStruct('FailedFindings', {
  reason: S.String,
})
/** Every state of reading what agents reported. */
export const FindingsObservation = S.Union([
  NotObservingFindings,
  LoadedFindings,
  FailedFindings,
])
/** Every state of reading what agents reported. */
export type FindingsObservation = typeof FindingsObservation.Type

/** No page has asked for the decisions, so none is read. */
export const NotObservingDecisions = S.TaggedStruct('NotObservingDecisions', {})
/** Every decision, from Scribe's rows, the newest first. */
export const LoadedDecisions = S.TaggedStruct('LoadedDecisions', {
  decisions: S.Array(DecisionRow),
})
/** Scribe's rows could not be read, and the page says why. */
export const FailedDecisions = S.TaggedStruct('FailedDecisions', {
  reason: S.String,
})
/** What `/decisions`, a chip and an Issue's page know of his decisions. */
export const DecisionsObservation = S.Union([
  NotObservingDecisions,
  LoadedDecisions,
  FailedDecisions,
])
/** What `/decisions`, a chip and an Issue's page know of his decisions. */
export type DecisionsObservation = typeof DecisionsObservation.Type

/** No page has asked for every question, so none is read. */
export const NotObservingQuestions = S.TaggedStruct('NotObservingQuestions', {})
/** Every question, from Scribe's rows, the newest first. */
export const LoadedQuestions = S.TaggedStruct('LoadedQuestions', {
  questions: S.Array(QuestionRow),
})
/** Scribe's rows could not be read, and the page says why. */
export const FailedQuestions = S.TaggedStruct('FailedQuestions', {
  reason: S.String,
})
/** What `/questions` knows. */
export const QuestionsObservation = S.Union([
  NotObservingQuestions,
  LoadedQuestions,
  FailedQuestions,
])
/** What `/questions` knows. */
export type QuestionsObservation = typeof QuestionsObservation.Type

/** No page has asked for every reminder, so none is read. */
export const NotObservingReminders = S.TaggedStruct('NotObservingReminders', {})
/** Every reminder, from Scribe's rows, the newest first. */
export const LoadedReminders = S.TaggedStruct('LoadedReminders', {
  reminders: S.Array(ReminderRow),
})
/** Scribe's rows could not be read, and the page says why. */
export const FailedReminders = S.TaggedStruct('FailedReminders', {
  reason: S.String,
})
/** What `/reminders` knows. */
export const RemindersObservation = S.Union([
  NotObservingReminders,
  LoadedReminders,
  FailedReminders,
])
/** What `/reminders` knows. */
export type RemindersObservation = typeof RemindersObservation.Type

/** No features page is open, so no line is read. */
export const NotObservingFeatures = S.TaggedStruct('NotObservingFeatures', {})
/** Every line of the feature contracts, from Scribe's rows, in his order. */
export const LoadedFeatures = S.TaggedStruct('LoadedFeatures', {
  features: S.Array(FeatureLine),
})
/** Scribe's rows could not be read, and the page says why. */
export const FailedFeatures = S.TaggedStruct('FailedFeatures', {
  reason: S.String,
})
/** Every state of reading the feature contracts. */
export const FeaturesObservation = S.Union([
  NotObservingFeatures,
  LoadedFeatures,
  FailedFeatures,
])
/** Every state of reading the feature contracts. */
export type FeaturesObservation = typeof FeaturesObservation.Type

/**
 * Which findings `/findings` shows: `{ maybeKind: Option.some('mistake') }` is
 * `/findings?kind=mistake`. Nothing chosen shows every one.
 */
export const FindingFilter = S.Struct({
  maybeKind: S.Option(S.String),
  maybeSource: S.Option(S.String),
  maybeStatus: S.Option(S.String),
})
/** Which findings `/findings` shows. */
export type FindingFilter = typeof FindingFilter.Type

/**
 * Which decisions `/decisions` shows:
 * `{ maybeStatus: Option.some('unconfirmed') }` is
 * `/decisions?status=unconfirmed`. Nothing chosen shows every one.
 */
export const DecisionFilter = S.Struct({ maybeStatus: S.Option(S.String) })
/** Which decisions `/decisions` shows. */
export type DecisionFilter = typeof DecisionFilter.Type

const everyDecision: DecisionFilter = { maybeStatus: Option.none() }

/**
 * Which questions `/questions` shows: `isLearningOnly` keeps what he wants to
 * learn about, `/questions?learning=yes`. Nothing chosen shows every one.
 */
export const QuestionFilter = S.Struct({
  isLearningOnly: S.Boolean,
  maybeStatus: S.Option(S.String),
})
/** Which questions `/questions` shows. */
export type QuestionFilter = typeof QuestionFilter.Type

/**
 * Which reminders `/reminders` shows: `{ maybeStatus: Option.some('done') }` is
 * `/reminders?status=done`. Nothing chosen shows every one.
 */
export const ReminderFilter = S.Struct({ maybeStatus: S.Option(S.String) })
/** Which reminders `/reminders` shows. */
export type ReminderFilter = typeof ReminderFilter.Type

const everyReminder: ReminderFilter = { maybeStatus: Option.none() }

const everyQuestion: QuestionFilter = {
  isLearningOnly: false,
  maybeStatus: Option.none(),
}

const everyFinding: FindingFilter = {
  maybeKind: Option.none(),
  maybeSource: Option.none(),
  maybeStatus: Option.none(),
}

const ListedView = IssueView.pipe(
  S.withDecodingDefaultKey(Effect.succeed(defaultIssueView)),
  S.withConstructorDefault(Effect.succeed(defaultIssueView)),
)

/**
 * The live Issue collection is visible, as its view shows it:
 * `IssueList.make({})` is every Issue, newest first, at `/issues`.
 */
export const IssueList = S.TaggedStruct('IssueList', { view: ListedView })
/** One Issue detail is visible. */
export const IssueDetail = S.TaggedStruct('IssueDetail', {
  issueId: S.String,
})
/** The new-Issue filing form is visible. */
export const FileIssue = S.TaggedStruct('FileIssue', {})
/** Transcript-derived draft triage candidates are visible. */
export const TriageInbox = S.TaggedStruct('TriageInbox', {})
/**
 * The backlog: the next build's lane, then each priority in rank order, of
 * one product: `/issues/backlog?product=foldkit`.
 */
export const Backlog = S.TaggedStruct('Backlog', {
  product: ProductFilter.pipe(
    S.withConstructorDefault(Effect.succeed(AllProducts.make({}))),
  ),
})
/** How long asks take: each step's median and its slowest asks. */
export const AskFlow = S.TaggedStruct('AskFlow', {})
/**
 * What happened to the Issues, newest first: `/inbox`, or one kind of it,
 * `/inbox?kind=status`.
 */
export const Inbox = S.TaggedStruct('Inbox', {
  kind: InboxFilter.pipe(
    S.withConstructorDefault(Effect.succeed('All' as const)),
  ),
})
/**
 * One entity's page, listing every Issue that points at it: Recording 208,
 * the agent `claude-code/issues-linear-1538@ld`, commit `6ff20758d`, build
 * 218, or the product Scribe.
 */
export const EntityPage = S.TaggedStruct('EntityPage', { entity: PageEntity })
/**
 * What agents reported running into, counted, each one reachable:
 * `Findings.make({})` is every finding at `/findings`.
 */
export const Findings = S.TaggedStruct('Findings', {
  filter: FindingFilter.pipe(
    S.withDecodingDefaultKey(Effect.succeed(everyFinding)),
    S.withConstructorDefault(Effect.succeed(everyFinding)),
  ),
})
/**
 * What he decided, counted by state, each one reachable:
 * `Decisions.make({})` is every decision at `/decisions`.
 */
export const Decisions = S.TaggedStruct('Decisions', {
  filter: DecisionFilter.pipe(
    S.withDecodingDefaultKey(Effect.succeed(everyDecision)),
    S.withConstructorDefault(Effect.succeed(everyDecision)),
  ),
})
/**
 * What he asked, counted by state, each one reachable:
 * `Questions.make({})` is every question at `/questions`.
 */
export const Questions = S.TaggedStruct('Questions', {
  filter: QuestionFilter.pipe(
    S.withDecodingDefaultKey(Effect.succeed(everyQuestion)),
    S.withConstructorDefault(Effect.succeed(everyQuestion)),
  ),
})
/**
 * His reminders, counted by state, each one reachable:
 * `Reminders.make({})` is every reminder at `/reminders`.
 */
export const Reminders = S.TaggedStruct('Reminders', {
  filter: ReminderFilter.pipe(
    S.withDecodingDefaultKey(Effect.succeed(everyReminder)),
    S.withConstructorDefault(Effect.succeed(everyReminder)),
  ),
})
/** Every line of the products' feature contracts, at `/features`. */
export const Features = S.TaggedStruct('Features', {})
/** Every product in the catalog, at `/products`. */
export const Products = S.TaggedStruct('Products', {})
/** Every representable navigation destination. */
export const Navigation = S.Union([
  IssueList,
  IssueDetail,
  FileIssue,
  TriageInbox,
  Backlog,
  AskFlow,
  Inbox,
  EntityPage,
  Findings,
  Decisions,
  Questions,
  Reminders,
  Features,
  Products,
])
/** Every representable navigation destination. */
export type Navigation = typeof Navigation.Type

/** Nothing shows above the page. */
export const NoLayer = S.TaggedStruct('NoLayer', {})
/**
 * Which rows a layer of choices lists: `Everything` is the command palette,
 * every action and place, the filter and order ones hold one filter's or
 * order's choices, and the `Set` ones change the Issues in hand.
 */
export const ChoiceMenu = S.Literals([
  'Everything',
  'ProductFilter',
  'StatusFilter',
  'PriorityFilter',
  'ClaimantFilter',
  'Sort',
  'Group',
  'SetStatus',
  'SetPriority',
  'SetClaim',
  'SetProduct',
  'SavedViews',
])
/** Which rows a layer of choices lists. */
export type ChoiceMenu = typeof ChoiceMenu.Type

/**
 * Choices show above the page: which ones, what is typed into their field,
 * and the position of the row the mark is on. Opened over a peek, they name
 * the Issue it shows and return to it. Opened from a field on a row, they
 * name that row's Issue, which is what they change.
 */
export const ChoiceLayer = S.TaggedStruct('ChoiceLayer', {
  maybePeekedIssueId: S.Option(S.String).pipe(
    S.withConstructorDefault(Effect.succeed(Option.none())),
  ),
  maybeRowIssueId: S.Option(S.String).pipe(
    S.withConstructorDefault(Effect.succeed(Option.none())),
  ),
  menu: ChoiceMenu,
  position: S.Number,
  query: S.String,
})
/** One Issue shows in a side panel above the list, which keeps its place. */
export const PeekLayer = S.TaggedStruct('PeekLayer', { issueId: S.String })
/**
 * A person names a view: a new one of what the list shows, or the saved one
 * `maybeViewId` names. `name` is what they typed so far.
 */
export const NamingViewLayer = S.TaggedStruct('NamingViewLayer', {
  maybeViewId: S.Option(S.String),
  name: S.String,
})
/** What shows above the page. */
export const ScreenLayer = S.Union([
  NoLayer,
  ChoiceLayer,
  PeekLayer,
  NamingViewLayer,
])
/** What shows above the page. */
export type ScreenLayer = typeof ScreenLayer.Type

const defaultDraftStatus: IssueStatus = 'Open'

const DraftOptionalString = S.Option(S.String).pipe(
  S.withDecodingDefaultKey(Effect.succeed(Option.none())),
  S.withConstructorDefault(Effect.succeed(Option.none())),
)

/**
 * One Mention written into a draft before the Issue has a number: Michael's
 * line in Recording 208, its words, and its deep link. Filing gives it the id
 * `mention-<number>-<position>`.
 */
export const DraftMention = S.Struct({
  capturedAtMs: S.Option(S.Number),
  directQuote: S.Option(S.String),
  note: S.Option(S.String),
  related: S.Array(IssueReference),
  reporter: S.Option(IssueReference),
  source: IssueReference,
})
/** One Mention written into a draft before the Issue has a number. */
export type DraftMention = typeof DraftMention.Type

/** One outcome a draft promises and the proof it needs. */
export const DraftSuccessCriterion = S.Struct({
  outcome: S.String,
  requiredEvidence: S.Array(IssueSuccessEvidence),
})
/** One outcome a draft promises and the proof it needs. */
export type DraftSuccessCriterion = typeof DraftSuccessCriterion.Type

/**
 * One work-log entry written into a draft, such as the agent that filed the
 * Issue saying so. Filing gives it the id `work-<number>-<state>-<time>`.
 */
export const DraftWorkLogEntry = S.Struct({
  agentId: S.Option(S.String),
  commitSha: S.Option(S.String),
  occurredAtMs: S.Number,
  state: S.Option(S.String),
  summary: S.String,
})
/** One work-log entry written into a draft. */
export type DraftWorkLogEntry = typeof DraftWorkLogEntry.Type

/**
 * The editable fields required to file one Issue. `productId` holds the
 * product as written, its id or its name, until filing resolves it.
 */
export const IssueDraft = S.Struct({
  area: DraftOptionalString,
  claimantId: DraftOptionalString,
  details: S.String,
  issueType: DraftOptionalString,
  leftoverKind: S.Option(LeftoverKind),
  mentions: S.Array(DraftMention).pipe(
    S.withDecodingDefaultKey(Effect.succeed([])),
    S.withConstructorDefault(Effect.succeed([])),
  ),
  priority: Issue.fields.priority,
  productId: S.String,
  relatedIssueIds: S.Array(S.String).pipe(
    S.withDecodingDefaultKey(Effect.succeed([])),
    S.withConstructorDefault(Effect.succeed([])),
  ),
  status: IssueStatus.pipe(
    S.withDecodingDefaultKey(Effect.succeed(defaultDraftStatus)),
    S.withConstructorDefault(Effect.succeed(defaultDraftStatus)),
  ),
  successCriteria: S.Array(DraftSuccessCriterion).pipe(
    S.withDecodingDefaultKey(Effect.succeed([])),
    S.withConstructorDefault(Effect.succeed([])),
  ),
  title: S.String,
  workLog: S.Array(DraftWorkLogEntry).pipe(
    S.withDecodingDefaultKey(Effect.succeed([])),
    S.withConstructorDefault(Effect.succeed([])),
  ),
})
/** The editable fields required to file one Issue. */
export type IssueDraft = typeof IssueDraft.Type

/**
 * One change to an Issue's work in progress: only the fields given change.
 * `{ landingState: Option.some('Green'), commitSha: Option.some('5e1f00d') }`
 * moves the work to Green at that commit and keeps its branch and worktree.
 */
export const WorkInProgressEdit = S.Struct({
  activity: S.Option(IssueWorkActivity),
  agentId: S.Option(S.String),
  branch: S.Option(S.String),
  commitSha: S.Option(S.String),
  landingState: S.Option(IssueLandingState),
  lastStep: S.Option(S.String),
  repository: S.Option(S.String),
  targetBuild: S.Option(S.String),
  worktree: S.Option(S.String),
})
/** One change to an Issue's work in progress. */
export type WorkInProgressEdit = typeof WorkInProgressEdit.Type

/** Which way subtasks are marked: checked off, or back to unchecked. */
export const SubtaskMark = S.Literals(['Checked', 'Unchecked'])
/** Which way subtasks are marked. */
export type SubtaskMark = typeof SubtaskMark.Type

/** The filing form is ready for editing or submission. */
export const EditingIssueDraft = S.TaggedStruct('EditingIssueDraft', {})
/** The filing form is saving an Issue. */
export const SavingIssueDraft = S.TaggedStruct('SavingIssueDraft', {})
/** The filing form failed to save. */
export const FailedIssueDraft = S.TaggedStruct('FailedIssueDraft', {
  reason: S.String,
})
/** Every filing state. */
export const IssueDraftState = S.Union([
  EditingIssueDraft,
  SavingIssueDraft,
  FailedIssueDraft,
])
/** Every filing state. */
export type IssueDraftState = typeof IssueDraftState.Type

/** No leftover mutation is in flight. */
export const IdleIssueMutation = S.TaggedStruct('IdleIssueMutation', {})
/** A leftover comment, link, or status save is in flight. */
export const SavingIssueMutation = S.TaggedStruct('SavingIssueMutation', {})
/** A leftover mutation failed. */
export const FailedIssueMutation = S.TaggedStruct('FailedIssueMutation', {
  reason: S.String,
})
/**
 * The last change to an Issue was read back from the store. A work-log entry
 * names its id, such as `work-692-claimed-1792017248455`.
 */
export const SavedIssueMutation = S.TaggedStruct('SavedIssueMutation', {
  entryId: S.Option(S.String),
  issueId: S.String,
})
/** The last mutation deleted this Issue. */
export const DeletedIssueMutation = S.TaggedStruct('DeletedIssueMutation', {
  issue: Issue,
})
/** Every leftover mutation phase. */
export const IssueMutationState = S.Union([
  IdleIssueMutation,
  SavingIssueMutation,
  FailedIssueMutation,
  SavedIssueMutation,
  DeletedIssueMutation,
])
/** Every leftover mutation phase. */
export type IssueMutationState = typeof IssueMutationState.Type

/** No product is being added to the catalog. */
export const IdleProductAddition = S.TaggedStruct('IdleProductAddition', {})
/** A new product, such as `acaga` named ACAGA, is being saved. */
export const SavingProductAddition = S.TaggedStruct('SavingProductAddition', {
  product: TrackedProduct,
})
/** The catalog saved the new product and read it back. */
export const SavedProductAddition = S.TaggedStruct('SavedProductAddition', {
  product: TrackedProduct,
})
/** The catalog already holds the product as given, so nothing was written. */
export const UnchangedProductAddition = S.TaggedStruct(
  'UnchangedProductAddition',
  { product: TrackedProduct },
)
/**
 * The product was refused before anything was written: a malformed id, a
 * blank name, or an id or name another product already holds.
 */
export const RefusedProductAddition = S.TaggedStruct('RefusedProductAddition', {
  reason: S.String,
})
/** The catalog was not loaded, refused the save, or lost the product. */
export const FailedProductAddition = S.TaggedStruct('FailedProductAddition', {
  reason: S.String,
})
/** Every phase of adding one product to the catalog. */
export const ProductAdditionState = S.Union([
  IdleProductAddition,
  SavingProductAddition,
  SavedProductAddition,
  UnchangedProductAddition,
  RefusedProductAddition,
  FailedProductAddition,
])
/** Every phase of adding one product to the catalog. */
export type ProductAdditionState = typeof ProductAdditionState.Type

/** No leftover room is being observed. */
export const NotObservingLeftoverPresence = S.TaggedStruct(
  'NotObservingLeftoverPresence',
  {},
)
/** A leftover room is joined, but has not emitted peers yet. */
export const LoadingLeftoverPresence = S.TaggedStruct(
  'LoadingLeftoverPresence',
  { leftoverId: S.String },
)
/** Latest leftover room peers. */
export const LoadedLeftoverPresence = S.TaggedStruct('LoadedLeftoverPresence', {
  leftoverId: S.String,
  peers: S.Array(LeftoverPeer),
})
/** Leftover room observation failed. */
export const FailedLeftoverPresence = S.TaggedStruct('FailedLeftoverPresence', {
  leftoverId: S.String,
  reason: S.String,
})
/** Every leftover presence observation state. */
export const LeftoverPresenceState = S.Union([
  NotObservingLeftoverPresence,
  LoadingLeftoverPresence,
  LoadedLeftoverPresence,
  FailedLeftoverPresence,
])
/** Every leftover presence observation state. */
export type LeftoverPresenceState = typeof LeftoverPresenceState.Type

/** Saved views have not emitted their first snapshot. */
export const LoadingSavedViews = S.TaggedStruct('LoadingSavedViews', {})
/** A person's saved views, in their order. */
export const LoadedSavedViews = S.TaggedStruct('LoadedSavedViews', {
  views: S.Array(SavedView),
})
/** Saved views could not be read, and the list says why. */
export const FailedSavedViews = S.TaggedStruct('FailedSavedViews', {
  reason: S.String,
})
/** Every state of reading a person's saved views. */
export const SavedViewsState = S.Union([
  LoadingSavedViews,
  LoadedSavedViews,
  FailedSavedViews,
])
/** Every state of reading a person's saved views. */
export type SavedViewsState = typeof SavedViewsState.Type

/**
 * A run of rows Shift is extending: the row it started from, and what was
 * selected before it. `{ anchorId: '103', chosenBefore: ['101'] }` with the
 * cursor on 105 selects 101, 103, 104 and 105.
 */
export const SelectionRun = S.Struct({
  anchorId: S.String,
  chosenBefore: S.Array(S.String),
})
/** A run of rows Shift is extending. */
export type SelectionRun = typeof SelectionRun.Type

/**
 * The reader's clock, read once a minute: the time and the offset of their
 * time zone from UTC in minutes, -300 on Eastern Standard Time. `nowMs` is 0
 * until the first reading, and pages show dates until then instead of how
 * long ago things were.
 */
export const Clock = S.Struct({ nowMs: S.Number, offsetMinutes: S.Number })
/** The reader's clock, read once a minute. */
export type Clock = typeof Clock.Type

/** The shared renderer-independent Issue Tracker Model. */
export const Model = S.Struct({
  clock: Clock,
  draft: IssueDraft,
  draftState: IssueDraftState,
  failedRowEdits: S.Array(FailedRowEdit),
  featuresList: FeaturesObservation,
  findingsList: FindingsObservation,
  issueDetail: IssueDetailState,
  issueFiles: IssueFilesState,
  issueGraph: IssueGraphObservation,
  issueLanding: IssueLandingObservation,
  issueLogs: IssueLogsState,
  issueMutation: IssueMutationState,
  isGoKeyPending: S.Boolean,
  isSearchFocused: S.Boolean,
  issues: IssuesState,
  knownAgents: S.Array(AgentRunChip),
  knownBuilds: S.Array(LandedBuild),
  knownDecisions: DecisionsObservation,
  knownFeatures: S.Array(FeatureChip),
  layer: ScreenLayer,
  leftoverComment: S.String,
  leftoverLink: S.String,
  leftoverPresence: LeftoverPresenceState,
  leftPageFacts: S.Array(LoadedPageFacts),
  maybeDraftFindingId: S.Option(S.String),
  maybeRowCursor: S.Option(S.String),
  maybeSelectionRun: S.Option(SelectionRun),
  maybeViewFailure: S.Option(S.String),
  navigation: Navigation,
  pageFacts: PageFactsObservation,
  productAddition: ProductAdditionState,
  products: ProductsState,
  questionsList: QuestionsObservation,
  remindersList: RemindersObservation,
  returnListView: IssueView,
  rowEdits: S.Array(RowEdit),
  savedViews: SavedViewsState,
  selectedIssueIds: S.Array(S.String),
  triageCandidates: TriageCandidatesState,
})
/** The shared renderer-independent Issue Tracker Model. */
export type Model = typeof Model.Type

/**
 * The next Model, from fields already typed as a Model, without walking them
 * again: `nextModel({ ...model, leftoverComment: 'w' })`. `Model.make`
 * re-validates every loaded Issue, about 105 ms with the 1,535 stored Issues,
 * which no keystroke or live change can afford.
 */
export const nextModel = (fields: Model): Model => fields
