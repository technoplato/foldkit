#!/usr/bin/env node
import { Array, Console, Effect, Option } from 'effect'
import { Argument, Command, Flag } from 'effect/unstable/cli'
import { pathToNavigation } from 'issues-core-example'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import {
  type IssuesHost,
  type IssuesOutcome,
  addCriterionCommand,
  addMentionCommand,
  addProductCommand,
  attachIssueFilesCommand,
  claimIssueCommand,
  deleteIssueCommand,
  downloadIssueFileCommand,
  editIssueCommand,
  fileIssueCommand,
  linkIssuesCommand,
  listIssuesCommand,
  listProductsCommand,
  logIssueCommand,
  markCriteriaCommand,
  redactCredentials,
  setIssueStatusCommand,
  showIssueCommand,
} from './commands.js'
import { runIssues } from './host.js'
import {
  IssuesInstantConfigError,
  type LiveIssueHostServices,
  defaultIssuesAgent,
  liveIssueHostServices,
} from './resources.js'

const DEVELOPMENT_PROVENANCE = 'development build (not installed from a bundle)'

const buildProvenance = (): string =>
  process.env['ISSUES_BUILD_PROVENANCE'] ?? DEVELOPMENT_PROVENANCE

const readStandardInput = (): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Array<Buffer> = []
    process.stdin.on('data', chunk => chunks.push(Buffer.from(chunk)))
    process.stdin.on('end', () =>
      resolve(Buffer.concat(chunks).toString('utf8')),
    )
    process.stdin.on('error', reject)
  })

const environmentPath = (name: string, fallback: string): string => {
  const value = process.env[name]
  return value === undefined || value === '' ? fallback : value
}

const liveHost = (services: LiveIssueHostServices): IssuesHost => ({
  backupDirectory: environmentPath(
    'ISSUES_BACKUP_DIR',
    join(homedir(), 'Sync', 'audit', 'issues-deleted'),
  ),
  defaultAgent: defaultIssuesAgent(),
  files: services.files,
  mirrorRoot: environmentPath('SCRIBE_ROOT', join(homedir(), 'Scribe')),
  nowMs: () => Date.now(),
  readStandardInput: Effect.promise(readStandardInput),
  records: services.records,
  resources: services.resources,
})

const report = (outcome: IssuesOutcome): Effect.Effect<void> =>
  Effect.gen(function* () {
    for (const line of outcome.stdout) {
      yield* Console.log(line)
    }
    for (const line of outcome.stderr) {
      yield* Console.error(line)
    }
    if (outcome.exitCode !== 0) {
      yield* Effect.sync(() => {
        process.exitCode = outcome.exitCode
      })
    }
  })

const withLiveHost = (
  run: (host: IssuesHost) => Effect.Effect<IssuesOutcome>,
): Effect.Effect<void> => {
  const services = liveIssueHostServices()
  if (services instanceof IssuesInstantConfigError) {
    return report({
      exitCode: 1,
      stderr: [`issues: ${services.message}`],
      stdout: [],
    })
  }
  return Effect.flatMap(run(liveHost(services)), outcome =>
    report(redactCredentials(outcome, services.credentials)),
  )
}

const jsonFlag = Flag.boolean('json').pipe(
  Flag.withDescription('Print JSON instead of text'),
)
const optionalText = (name: string, description: string) =>
  Flag.string(name).pipe(Flag.withDescription(description), Flag.optional)
const repeatedText = (name: string, description: string) =>
  Flag.string(name).pipe(Flag.withDescription(description), Flag.atLeast(0))
const issueArgument = Argument.string('issue').pipe(
  Argument.withDescription('Issue number, such as 692 or #692'),
)

const file = Command.make(
  'file',
  {
    agent: optionalText(
      'agent',
      'Who writes the initial work-log entry (default $SCRIBE_AGENT or claude-code)',
    ),
    area: optionalText('area', 'Area, such as "Recording / images"'),
    claim: optionalText('claim', 'Claim it for this agent at once'),
    criteria: repeatedText(
      'criterion',
      'A success criterion: one user-visible outcome (repeat for more)',
    ),
    details: optionalText('details', 'The body: what is wrong or wanted'),
    dryRun: Flag.boolean('dry-run').pipe(
      Flag.withDescription('Print the Issue it would file and file nothing'),
    ),
    evidence: repeatedText(
      'evidence',
      'Evidence every --criterion needs, such as FocusedTest,Log (default FocusedTest)',
    ),
    isJson: jsonFlag,
    jsonInput: optionalText(
      'from-json',
      'Read the draft from a JSON file, or - for standard input (no "id": the number is allocated)',
    ),
    log: optionalText(
      'log',
      'The first work-log entry, such as "Filed from Recording 208."',
    ),
    logState: optionalText(
      'log-state',
      'State of the first entry (default filed)',
    ),
    priority: optionalText('priority', 'P0 to P4 (default P2)'),
    product: optionalText(
      'product',
      'Product id or name, such as scribe or Scribe',
    ),
    related: repeatedText('related', 'Related Issue numbers, such as 502,691'),
    said: repeatedText(
      'said',
      "Michael's recording lines, such as 208:1884-1888: read word for word from ~/Scribe with a deep link per line",
    ),
    status: optionalText('status', 'Status (default Open)'),
    title: optionalText('title', 'Title'),
    type: optionalText('type', 'Issue type, such as defect or feature'),
    typed: optionalText(
      'typed',
      'Words Michael typed in the Claude chat, verbatim',
    ),
    typedAt: optionalText('typed-at', 'When he typed them (ISO time)'),
    typedMessage: optionalText('typed-message', 'The chat message id'),
    typedSession: optionalText('typed-session', 'The Claude Code session id'),
  },
  input => withLiveHost(host => fileIssueCommand(host, input)),
).pipe(
  Command.withDescription(
    'File a new Issue under the next free number. It never writes over a stored Issue.',
  ),
)

const show = Command.make(
  'show',
  { isJson: jsonFlag, issue: issueArgument },
  input => withLiveHost(host => showIssueCommand(host, input)),
).pipe(Command.withDescription('Print one Issue in full'))

const list = Command.make(
  'list',
  {
    claimant: optionalText('claimant', 'Only Issues this agent claimed'),
    isJson: jsonFlag,
    limit: Flag.integer('limit').pipe(
      Flag.withDescription('At most this many'),
      Flag.optional,
    ),
    product: optionalText('product', 'Only this product (id or name)'),
    recording: optionalText(
      'recording',
      'Only Issues from this recording: its number (208) or id',
    ),
    search: optionalText(
      'search',
      'Only Issues whose title or details hold this text',
    ),
    statuses: repeatedText(
      'status',
      'Only these statuses, such as Open,InProgress',
    ),
    type: optionalText('type', 'Only this issue type'),
  },
  input => withLiveHost(host => listIssuesCommand(host, input)),
).pipe(
  Command.withDescription(
    'List Issues newest first; --json prints every field. Fails when a stored Issue cannot be read.',
  ),
)

const log = Command.make(
  'log',
  {
    agent: optionalText(
      'agent',
      'Who did the work (default $SCRIBE_AGENT or claude-code)',
    ),
    claim: optionalText('claim', 'Also set the claimant'),
    commit: optionalText('commit', 'The commit this entry is about'),
    isJson: jsonFlag,
    issue: issueArgument,
    state: Argument.string('state').pipe(
      Argument.withDescription(
        'claimed, progress, landed, waiting, blocked, ...',
      ),
    ),
    status: optionalText('status', 'Also set the status'),
    summary: Argument.string('summary').pipe(
      Argument.withDescription(
        'What happened and the next step (- reads standard input)',
      ),
    ),
  },
  input => withLiveHost(host => logIssueCommand(host, input)),
).pipe(
  Command.withDescription(
    'Append a work-log entry and check that it landed (what tools/issue-log did)',
  ),
)

const claim = Command.make(
  'claim',
  {
    issue: issueArgument,
    agent: Argument.string('agent').pipe(Argument.withDescription('Claimant')),
    isJson: jsonFlag,
    summary: Argument.string('summary').pipe(
      Argument.withDescription('What the claim is for'),
      Argument.optional,
    ),
  },
  input => withLiveHost(host => claimIssueCommand(host, input)),
).pipe(
  Command.withDescription(
    'Claim an Issue: a claimed work-log entry, the claimant, and InProgress',
  ),
)

const status = Command.make(
  'status',
  {
    isJson: jsonFlag,
    issue: issueArgument,
    status: Argument.string('status').pipe(
      Argument.withDescription('Any stored status, such as VerificationNeeded'),
    ),
  },
  input => withLiveHost(host => setIssueStatusCommand(host, input)),
).pipe(Command.withDescription("Set an Issue's status"))

const link = Command.make(
  'link',
  {
    isJson: jsonFlag,
    issue: issueArgument,
    targets: Argument.string('related').pipe(
      Argument.withDescription('Issue numbers to link'),
      Argument.variadic({ min: 1 }),
    ),
  },
  input => withLiveHost(host => linkIssuesCommand(host, input)),
).pipe(Command.withDescription('Link related Issues'))

const remove = Command.make(
  'delete',
  {
    isJson: jsonFlag,
    issue: issueArgument,
    yes: Flag.string('yes').pipe(
      Flag.withDescription(
        "Michael's typed yes, verbatim: a permanent delete needs it",
      ),
      Flag.withDefault(''),
    ),
  },
  input => withLiveHost(host => deleteIssueCommand(host, input)),
).pipe(
  Command.withDescription(
    'Delete an Issue after writing its stored record to a backup file ($ISSUES_BACKUP_DIR, default ~/Sync/audit/issues-deleted)',
  ),
)

const edit = Command.make(
  'edit',
  {
    issue: issueArgument,
    area: optionalText('area', 'New area'),
    details: optionalText('details', 'New details (the whole body)'),
    isJson: jsonFlag,
    priority: optionalText('priority', 'New priority, P0 to P4'),
    product: optionalText('product', 'New product, by id or name'),
    title: optionalText('title', 'New title'),
    type: optionalText('type', 'New issue type'),
  },
  input => withLiveHost(host => editIssueCommand(host, input)),
).pipe(
  Command.withDescription(
    "Change an Issue's title, details, priority, type, area, or product (only the fields given)",
  ),
)

const criterion = Command.make(
  'criterion',
  {
    issue: issueArgument,
    outcome: Argument.string('outcome').pipe(
      Argument.withDescription('One observable, user-visible outcome'),
    ),
    evidence: repeatedText(
      'evidence',
      'Evidence it needs, such as FocusedTest,Log (default FocusedTest)',
    ),
    isJson: jsonFlag,
  },
  input => withLiveHost(host => addCriterionCommand(host, input)),
).pipe(Command.withDescription('Add a success criterion'))

const satisfy = Command.make(
  'satisfy',
  {
    issue: issueArgument,
    criteria: Argument.string('criterion').pipe(
      Argument.withDescription('Criterion position (1, 2, ...) or id'),
      Argument.variadic({ min: 1 }),
    ),
    isJson: jsonFlag,
    isUnsatisfied: Flag.boolean('unsatisfied').pipe(
      Flag.withDescription('Mark them not satisfied instead'),
    ),
  },
  input => withLiveHost(host => markCriteriaCommand(host, input)),
).pipe(
  Command.withDescription(
    'Mark success criteria satisfied, with the evidence in issues log',
  ),
)

const mention = Command.make(
  'mention',
  {
    issue: issueArgument,
    isJson: jsonFlag,
    said: repeatedText(
      'said',
      "Michael's recording lines, such as 208:1884-1888 (word for word, with deep links)",
    ),
    typed: optionalText(
      'typed',
      'Words Michael typed in the Claude chat, verbatim',
    ),
    typedAt: optionalText('typed-at', 'When he typed them (ISO time)'),
    typedMessage: optionalText('typed-message', 'The chat message id'),
    typedSession: optionalText('typed-session', 'The Claude Code session id'),
  },
  input => withLiveHost(host => addMentionCommand(host, input)),
).pipe(
  Command.withDescription(
    "Add Michael's later words to an Issue, with their links",
  ),
)

const attach = Command.make(
  'attach',
  {
    issue: issueArgument,
    files: Argument.string('file').pipe(
      Argument.withDescription('Files to attach, such as a screenshot'),
      Argument.variadic({ min: 1 }),
    ),
    capturedAt: optionalText(
      'captured-at',
      'When it was captured (ISO time; default the file time)',
    ),
    contentType: optionalText(
      'content-type',
      'Media type (default from the name)',
    ),
    isJson: jsonFlag,
    kind: optionalText(
      'kind',
      'Screenshot, Audio, Video, or File (default from the type)',
    ),
  },
  input => withLiveHost(host => attachIssueFilesCommand(host, input)),
).pipe(
  Command.withDescription(
    'Upload files to Instant storage, link them to the Issue, and record them on it',
  ),
)

const download = Command.make(
  'download',
  {
    storagePath: Argument.string('path').pipe(
      Argument.withDescription(
        'Storage path, such as issues/662/<id>-shot.png',
      ),
    ),
    directory: Argument.string('directory').pipe(
      Argument.withDescription('Where to write it (default here)'),
      Argument.optional,
    ),
    isForced: Flag.boolean('force').pipe(
      Flag.withDescription('Replace a file already there'),
    ),
  },
  input => withLiveHost(host => downloadIssueFileCommand(host, input)),
).pipe(Command.withDescription('Download one stored Issue file'))

const addProduct = Command.make(
  'add',
  {
    id: optionalText(
      'id',
      'The product id: lowercase words joined by hyphens, such as acaga',
    ),
    isJson: jsonFlag,
    kind: optionalText('kind', 'Application or Library'),
    name: optionalText('name', 'The name Issues show, such as ACAGA'),
  },
  input => withLiveHost(host => addProductCommand(host, input)),
).pipe(
  Command.withDescription(
    'Add a product Issues may be filed under, and read it back. Adding the same product again changes nothing.',
  ),
)

const products = Command.make('products', { isJson: jsonFlag }, input =>
  withLiveHost(host => listProductsCommand(host, input)),
).pipe(
  Command.withDescription(
    'List the products an Issue may be filed under; products add adds one',
  ),
  Command.withSubcommands([addProduct]),
)

const version = Command.make('version', {}, () =>
  Console.log(buildProvenance()),
).pipe(
  Command.withDescription('Print the build this command was installed from'),
)

const run = Command.make(
  'run',
  {
    actions: Argument.string('action').pipe(Argument.variadic({ min: 1 })),
    isVerbose: Flag.boolean('verbose').pipe(
      Flag.withDescription('Print Messages valid in the final state'),
    ),
    uri: optionalText('uri', 'Portable Issue Tracker route to open'),
  },
  ({ actions, isVerbose, uri }) =>
    runIssues(actions, isVerbose, Option.map(uri, pathToNavigation)).pipe(
      Effect.catch(error =>
        report({
          exitCode: 1,
          stderr: [`issues run failed: ${error.message}`],
          stdout: [],
        }),
      ),
    ),
).pipe(
  Command.withDescription(
    'Drive the Issue Tracker screen with its action tokens (the human screen)',
  ),
)

const issues = Command.make('issues').pipe(
  Command.withDescription(
    'issues (issues.pisspoursoftware.xyz): the one way to file, read, and change Issues',
  ),
  Command.withSubcommands([
    file,
    show,
    list,
    log,
    claim,
    status,
    link,
    edit,
    criterion,
    satisfy,
    mention,
    remove,
    attach,
    download,
    products,
    version,
    run,
  ]),
)

Command.run(issues, {
  version: Array.join(['issues', buildProvenance()], ' '),
}).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
