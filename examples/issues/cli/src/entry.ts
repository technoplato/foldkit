#!/usr/bin/env node
import { Effect, Option } from 'effect'
import { Argument, Command, Flag } from 'effect/unstable/cli'
import { pathToNavigation } from 'issues-core-example'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runIssues } from './host.js'

const verboseFlag = Flag.boolean('verbose').pipe(
  Flag.withDescription('Print Messages valid in the final state'),
)
const uriFlag = Flag.string('uri').pipe(
  Flag.withDescription('Portable Issue Tracker route to open'),
  Flag.optional,
)
const requiredUriFlag = Flag.string('uri').pipe(
  Flag.withDescription('Portable Issue Tracker route to open'),
)
const titleFlag = Flag.string('title').pipe(Flag.withDescription('Issue title'))
const detailsFlag = Flag.string('details').pipe(
  Flag.withDescription('Issue body'),
  Flag.optional,
)
const priorityFlag = Flag.string('priority').pipe(
  Flag.withDescription('Issue priority P0-P4'),
  Flag.optional,
)
const productFlag = Flag.string('product').pipe(
  Flag.withDescription('Application or Library id'),
  Flag.optional,
)
const actionsArgument = Argument.string('action').pipe(
  Argument.variadic({ min: 1 }),
)

const optionalToken = (
  prefix: string,
  value: Option.Option<string>,
): ReadonlyArray<string> =>
  Option.match(value, {
    onNone: () => [],
    onSome: text => [`${prefix}${text}`],
  })

const show = Command.make(
  'show',
  { isVerbose: verboseFlag, product: productFlag, uri: uriFlag },
  ({ isVerbose, product, uri }) =>
    runIssues(
      Option.match(product, {
        onNone: () => [],
        onSome: id => [`product:${id}`],
      }),
      isVerbose,
      Option.map(uri, pathToNavigation),
    ),
)
const run = Command.make(
  'run',
  { actions: actionsArgument, isVerbose: verboseFlag, uri: uriFlag },
  ({ actions, isVerbose, uri }) =>
    runIssues(actions, isVerbose, Option.map(uri, pathToNavigation)),
)
const file = Command.make(
  'file',
  {
    details: detailsFlag,
    isVerbose: verboseFlag,
    priority: priorityFlag,
    product: productFlag,
    title: titleFlag,
  },
  ({ details, isVerbose, priority, product, title }) =>
    runIssues(
      [
        'file',
        `title:${title}`,
        ...optionalToken('details:', details),
        ...optionalToken('priority:', priority),
        ...optionalToken('product:', product),
        'submit',
      ],
      isVerbose,
    ),
)

const issueIdArgument = Argument.string('issueId').pipe(
  Argument.withDescription('Issue id'),
)
const targetIssueArgument = Argument.string('targetIssueId').pipe(
  Argument.withDescription('Catalog Issue id to link'),
)
const leftoverStatusArgument = Argument.string('status').pipe(
  Argument.withDescription('Leftover status Open | Blocked | Closed'),
)
const summaryFlag = Flag.string('summary').pipe(
  Flag.withDescription('Work-log summary shown outside details'),
)
const comment = Command.make(
  'comment',
  { issueId: issueIdArgument, isVerbose: verboseFlag, summary: summaryFlag },
  ({ issueId, isVerbose, summary }) =>
    runIssues(
      [`comment:${summary}`],
      isVerbose,
      Option.some(pathToNavigation(`/issues/${issueId}`)),
    ),
)
const link = Command.make(
  'link',
  {
    issueId: issueIdArgument,
    isVerbose: verboseFlag,
    targetIssueId: targetIssueArgument,
  },
  ({ issueId, isVerbose, targetIssueId }) =>
    runIssues(
      [`link:${targetIssueId}`],
      isVerbose,
      Option.some(pathToNavigation(`/issues/${issueId}`)),
    ),
)
const status = Command.make(
  'status',
  {
    issueId: issueIdArgument,
    isVerbose: verboseFlag,
    leftover: leftoverStatusArgument,
  },
  ({ issueId, isVerbose, leftover }) =>
    runIssues(
      [`status:${leftover}`],
      isVerbose,
      Option.some(pathToNavigation(`/issues/${issueId}`)),
    ),
)
const log = Command.make(
  'log',
  {
    isVerbose: verboseFlag,
    summary: summaryFlag,
    uri: requiredUriFlag,
  },
  ({ isVerbose, summary, uri }) =>
    runIssues(
      [`log:${summary}`],
      isVerbose,
      Option.some(pathToNavigation(uri)),
    ),
)
const retarget = Command.make(
  'retarget',
  {
    issueId: issueIdArgument,
    isVerbose: verboseFlag,
    product: Flag.string('product').pipe(
      Flag.withDescription('Live catalog product id'),
    ),
  },
  ({ issueId, isVerbose, product }) =>
    runIssues(
      [`retarget:${product}`],
      isVerbose,
      Option.some(pathToNavigation(`/issues/${issueId}`)),
    ),
)
const issues = Command.make('foldkit-issues').pipe(
  Command.withSubcommands([
    show,
    run,
    file,
    comment,
    log,
    link,
    status,
    retarget,
  ]),
)

Command.run(issues, { version: '0.0.0' }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
