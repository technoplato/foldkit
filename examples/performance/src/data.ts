import { Schema as S } from 'effect'

/**
 * The version of the data files this page reads. The exporter in the Scribe
 * repository (`scripts/perf/performance_export.py`) writes it into
 * `index.json`; a file with another version fails to decode, so a changed
 * export never reads as numbers it does not mean.
 */
export const DATA_SCHEMA_VERSION = 1

/**
 * Which minutes a number is over: minutes recording, minutes not recording, or
 * a canned-audio run (a file in place of the microphone, never mixed with a
 * real room's minutes).
 */
export const Scope = S.Literals(['Recording', 'NotRecording', 'CannedAudio'])
export type Scope = typeof Scope.Type

/**
 * A number that was measured: its value, the minutes it stands on (none when
 * the ledger's text names a run instead), whether those are too few to trust
 * alone, what is behind it, and the ledger line it was read from.
 */
export const Measured = S.TaggedStruct('Measured', {
  value: S.Number,
  maybeMinutes: S.OptionFromNullOr(S.Number),
  isFew: S.Boolean,
  maybeNote: S.OptionFromNullOr(S.String),
  maybeUrl: S.OptionFromNullOr(S.String),
}).pipe(
  S.encodeKeys({ maybeMinutes: 'minutes', maybeNote: 'note', maybeUrl: 'url' }),
)
export type Measured = typeof Measured.Type

/** A number nobody measured, and why. */
export const NotMeasured = S.TaggedStruct('NotMeasured', { reason: S.String })
export type NotMeasured = typeof NotMeasured.Type

export const Value = S.Union([Measured, NotMeasured])
export type Value = typeof Value.Type

/** One scope's numbers, by metric id (`cpu-front`, `disk-per-minute`). */
export const ScopeValues = S.Record(S.String, Value)
export type ScopeValues = typeof ScopeValues.Type

export const Scopes = S.Struct({
  Recording: ScopeValues,
  NotRecording: ScopeValues,
  CannedAudio: ScopeValues,
})
export type Scopes = typeof Scopes.Type

/**
 * The commit a build links to: the one it was built from when GitHub has it
 * (`Source`), else its cut commit (`Cut`), else one GitHub does not have.
 */
export const Commit = S.Struct({
  kind: S.Literals(['Source', 'Cut', 'Unpublished']),
  sha: S.String,
  maybeUrl: S.OptionFromNullOr(S.String),
  maybeNote: S.OptionFromNullOr(S.String),
}).pipe(S.encodeKeys({ maybeUrl: 'url', maybeNote: 'note' }))
export type Commit = typeof Commit.Type

export const Release = S.Struct({
  tag: S.String,
  maybeName: S.OptionFromNullOr(S.String),
  url: S.String,
}).pipe(S.encodeKeys({ maybeName: 'name' }))
export type Release = typeof Release.Type

/** When a build ran on a device, in the ledger's local time. */
export const Window = S.Struct({
  first: S.String,
  last: S.String,
  minutes: S.Number,
  recordingMinutes: S.Number,
})
export type Window = typeof Window.Type

const buildFields = {
  build: S.String,
  maybeDate: S.OptionFromNullOr(S.String),
  maybeChanged: S.OptionFromNullOr(S.String),
  cutIssues: S.Array(S.String),
  carries: S.Array(S.String),
  maybeCommit: S.OptionFromNullOr(Commit),
  maybeRelease: S.OptionFromNullOr(Release),
  maybeLibrary: S.OptionFromNullOr(S.String),
  maybeWindow: S.OptionFromNullOr(Window),
  maybeCannedWindow: S.OptionFromNullOr(Window),
  maybeLedgerLine: S.OptionFromNullOr(S.Number),
  maybeLedgerNote: S.OptionFromNullOr(S.String),
  scopes: Scopes,
}

/** One build of one app on one device, with every number in every scope. */
export const Build = S.Struct(buildFields).pipe(
  S.encodeKeys({
    maybeDate: 'date',
    maybeChanged: 'changed',
    maybeCommit: 'commit',
    maybeRelease: 'release',
    maybeLibrary: 'library',
    maybeWindow: 'window',
    maybeCannedWindow: 'cannedWindow',
    maybeLedgerLine: 'ledgerLine',
    maybeLedgerNote: 'ledgerNote',
  }),
)
export type Build = typeof Build.Type

/** A ledger fix row that names a library version. */
export const LedgerFix = S.Struct({
  line: S.Number,
  url: S.String,
  fix: S.String,
  ledgerSoFar: S.String,
})
export type LedgerFix = typeof LedgerFix.Type

/** One instant-data-swift version: its tag, commit, and the Scribe builds that pinned it. */
export const Version = S.Struct({
  version: S.String,
  tag: S.String,
  maybeDate: S.OptionFromNullOr(S.String),
  maybeSha: S.OptionFromNullOr(S.String),
  maybeUrl: S.OptionFromNullOr(S.String),
  tagUrl: S.String,
  maybeRelease: S.OptionFromNullOr(S.String),
  maybeFirstScribeBuild: S.OptionFromNullOr(S.String),
  scribeBuilds: S.Array(S.String),
  fixes: S.Array(LedgerFix),
}).pipe(
  S.encodeKeys({
    maybeDate: 'date',
    maybeSha: 'sha',
    maybeUrl: 'url',
    maybeRelease: 'release',
    maybeFirstScribeBuild: 'firstScribeBuild',
  }),
)
export type Version = typeof Version.Type

export const AppKind = S.Literals(['App', 'Library'])
export type AppKind = typeof AppKind.Type

/** One entry per app: Scribe on the iPhone first, then the others, then the library. */
export const App = S.Struct({
  id: S.String,
  name: S.String,
  kind: AppKind,
  platform: S.String,
  summary: S.String,
  defaultScope: Scope,
  repo: S.Struct({ name: S.String, url: S.String }),
  builds: S.Array(Build),
  versions: S.Array(Version),
})
export type App = typeof App.Type

/** A budget line: the target and the line above which a number fails. */
export const Budget = S.Struct({
  target: S.Number,
  fail: S.Number,
  source: S.String,
})
export type Budget = typeof Budget.Type

/** What a metric reads, how to run it again, and its budget in each scope. */
export const Metric = S.Struct({
  id: S.String,
  label: S.String,
  unit: S.String,
  digits: S.Number,
  reads: S.String,
  budgets: S.Struct({
    Recording: S.OptionFromNullOr(Budget),
    NotRecording: S.OptionFromNullOr(Budget),
    CannedAudio: S.OptionFromNullOr(Budget),
  }),
  maybeLine: S.OptionFromNullOr(S.Number),
  maybeUrl: S.OptionFromNullOr(S.String),
  command: S.String,
}).pipe(S.encodeKeys({ maybeLine: 'line', maybeUrl: 'url' }))
export type Metric = typeof Metric.Type

const provenFields = {
  devices: S.Array(S.String),
  builds: S.Array(S.String),
  measurement: S.String,
  command: S.String,
  line: S.Number,
  url: S.String,
}

/**
 * What proves an issue's fix: proven on a device (the ledger's evidence row
 * names the device, the builds and the measurement), disproved, landed in a
 * build but not proven, or in progress.
 */
export const Proven = S.TaggedStruct('Proven', provenFields)
export const Disproved = S.TaggedStruct('Disproved', provenFields)
export const Landed = S.TaggedStruct('Landed', {
  builds: S.Array(S.String),
  reason: S.String,
})
export const InProgress = S.TaggedStruct('InProgress', {
  builds: S.Array(S.String),
  reason: S.String,
})
export const Evidence = S.Union([Proven, Disproved, Landed, InProgress])
export type Evidence = typeof Evidence.Type

/** The four evidence states by name, for counts and legends. */
export const EvidenceTag = S.Literals([
  'Proven',
  'Disproved',
  'Landed',
  'InProgress',
])
export type EvidenceTag = typeof EvidenceTag.Type

/** A fix row from the ledger that names an issue. */
export const IssueFix = S.Struct({
  line: S.Number,
  url: S.String,
  fix: S.String,
  onThePhone: S.String,
  ledgerSoFar: S.String,
})
export type IssueFix = typeof IssueFix.Type

export const Issue = S.Struct({
  number: S.String,
  maybeTitle: S.OptionFromNullOr(S.String),
  maybeStatus: S.OptionFromNullOr(S.String),
  maybePriority: S.OptionFromNullOr(S.String),
  url: S.String,
  evidence: Evidence,
  isNamedByTheBrief: S.Boolean,
  fixes: S.Array(IssueFix),
  hypotheses: S.Array(S.Number),
}).pipe(
  S.encodeKeys({
    maybeTitle: 'title',
    maybeStatus: 'status',
    maybePriority: 'priority',
  }),
)
export type Issue = typeof Issue.Type

export const Verdict = S.Literals(['Held', 'Disproved', 'NotMet', 'Open'])
export type Verdict = typeof Verdict.Type

/** A hypothesis stated before measuring, and what the measurement said. */
export const Hypothesis = S.Struct({
  hypothesis: S.String,
  maybeIssue: S.OptionFromNullOr(S.String),
  predicted: S.String,
  measured: S.String,
  verdict: Verdict,
  verdictText: S.String,
  source: S.String,
  line: S.Number,
  maybeUrl: S.OptionFromNullOr(S.String),
  ledgerUrl: S.String,
}).pipe(S.encodeKeys({ maybeIssue: 'issue', maybeUrl: 'url' }))
export type Hypothesis = typeof Hypothesis.Type

/** Where the numbers came from and when: the ledger's commit and its newest minute. */
export const Ledger = S.Struct({
  commit: S.String,
  url: S.String,
  path: S.String,
  maybeNewestMinute: S.OptionFromNullOr(S.String),
  minutes: S.Number,
  cannedMinutes: S.Number,
  problems: S.Array(S.String),
}).pipe(S.encodeKeys({ maybeNewestMinute: 'newestMinute' }))
export type Ledger = typeof Ledger.Type

/** `index.json`: everything the charts, tables and lists draw. */
export const Index = S.Struct({
  schemaVersion: S.Literal(DATA_SCHEMA_VERSION),
  generatedAt: S.String,
  ledger: Ledger,
  method: S.String,
  metrics: S.Array(Metric),
  scopes: S.Array(Scope),
  apps: S.Array(App),
  issues: S.Array(Issue),
  hypotheses: S.Array(Hypothesis),
})
export type Index = typeof Index.Type

/** The scenario beside one scope's numbers (#1799): front share, charging, speech. */
export const Conditions = S.Struct({
  maybeFrontShare: S.OptionFromNullOr(S.Number),
  maybeChargingShare: S.OptionFromNullOr(S.Number),
  maybeWordsPerMinute: S.OptionFromNullOr(S.Number),
  maybeFinalsPerMinute: S.OptionFromNullOr(S.Number),
  maybeTransactionsPerMinute: S.OptionFromNullOr(S.Number),
}).pipe(
  S.encodeKeys({
    maybeFrontShare: 'frontShare',
    maybeChargingShare: 'chargingShare',
    maybeWordsPerMinute: 'wordsPerMinute',
    maybeFinalsPerMinute: 'finalsPerMinute',
    maybeTransactionsPerMinute: 'transactionsPerMinute',
  }),
)
export type Conditions = typeof Conditions.Type

/** The ledger's own row for a build, cell by header, with its line. */
export const LedgerRow = S.Struct({
  line: S.Number,
  url: S.String,
  cells: S.Record(S.String, S.String),
  maybeTraceMainShare: S.OptionFromNullOr(S.Number),
}).pipe(S.encodeKeys({ maybeTraceMainShare: 'traceMainShare' }))
export type LedgerRow = typeof LedgerRow.Type

/** `builds/<app>/<build>.json`: one build's numbers with the ledger's row and conditions. */
export const BuildDetail = S.Struct({
  ...buildFields,
  app: S.String,
  maybeDevice: S.OptionFromNullOr(S.String),
  conditions: S.Struct({
    Recording: S.OptionFromNullOr(Conditions),
    NotRecording: S.OptionFromNullOr(Conditions),
    CannedAudio: S.OptionFromNullOr(Conditions),
  }),
  maybeLedgerRow: S.OptionFromNullOr(LedgerRow),
  maybePowerlogNote: S.OptionFromNullOr(S.String),
  maybeHangsNote: S.OptionFromNullOr(S.String),
}).pipe(
  S.encodeKeys({
    maybeDate: 'date',
    maybeChanged: 'changed',
    maybeCommit: 'commit',
    maybeRelease: 'release',
    maybeLibrary: 'library',
    maybeWindow: 'window',
    maybeCannedWindow: 'cannedWindow',
    maybeLedgerLine: 'ledgerLine',
    maybeLedgerNote: 'ledgerNote',
    maybeDevice: 'device',
    maybeLedgerRow: 'ledgerRow',
    maybePowerlogNote: 'powerlogNote',
    maybeHangsNote: 'hangsNote',
  }),
)
export type BuildDetail = typeof BuildDetail.Type

/**
 * The version of `understanding.json` this page reads, which the exporter
 * writes beside the index; another version fails to decode.
 */
export const UNDERSTANDING_SCHEMA_VERSION = 1

/**
 * One area of the understanding profile as its newest rating has it: where a
 * course would teach it, a score out of 10, whether it is at proficient (a
 * problem in it found and fixed without an agent), when and by whom it was
 * rated, how many ratings it has had, and the links to the words behind it.
 */
export const UnderstandingArea = S.Struct({
  name: S.String,
  level: S.String,
  score: S.Number,
  isProficient: S.Boolean,
  ratedAt: S.String,
  by: S.String,
  ratings: S.Number,
  evidence: S.Array(S.String),
}).pipe(S.encodeKeys({ isProficient: 'proficient' }))
export type UnderstandingArea = typeof UnderstandingArea.Type

/** The count after one rating: the areas at proficient, of the areas rated by then. */
export const UnderstandingPoint = S.Struct({
  at: S.String,
  proficient: S.Number,
  areas: S.Number,
})
export type UnderstandingPoint = typeof UnderstandingPoint.Type

/** The count now: the areas the newest ratings put at proficient, of how many. */
export const UnderstandingCount = S.TaggedStruct('Measured', {
  proficient: S.Number,
  areas: S.Number,
})
export type UnderstandingCount = typeof UnderstandingCount.Type

/**
 * `understanding.json`: the understanding profile's areas at proficient, now
 * and after each rating, every area by its newest rating, how it is counted,
 * and the lines the exporter could not read. A count nobody measured says why.
 */
export const Understanding = S.Struct({
  schemaVersion: S.Literal(UNDERSTANDING_SCHEMA_VERSION),
  generatedAt: S.String,
  source: S.String,
  method: S.String,
  count: S.Union([UnderstandingCount, NotMeasured]),
  list: S.Array(UnderstandingArea),
  history: S.Array(UnderstandingPoint),
  problems: S.Array(S.String),
})
export type Understanding = typeof Understanding.Type
