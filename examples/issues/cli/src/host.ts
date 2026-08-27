import { Array, Console, Data, Effect, Match as M, Option } from 'effect'
import { Runtime } from 'foldkit'
import {
  type Destination,
  type Interaction,
  IssueList,
  IssueTrackerProgram,
  type Message,
  type Model,
  type Navigation,
  ObservedProducts,
  StaticIssueTrackerResources,
  catalogIssueRefsOf,
  destinationForModel,
  interactionsForModel,
  issuesScreen,
  leftoverKindOf,
  leftoverStatusOf,
  messageForScreenToken,
  modelForNavigation,
  newestWorkLog,
} from 'issues-core-example'

import {
  ApplicationProduct,
  LibraryProduct,
  ProductCatalogEntry,
} from '@foldkit/instant-tools/issues'

import { paintCli } from './paintCli.js'
import {
  IssuesInstantConfigError,
  liveIssueTrackerResources,
} from './resources.js'

/** A CLI token is not valid in the current Issue Tracker destination. */
export class IssuesCliError extends Data.TaggedError('IssuesCliError')<{
  readonly message: string
}> {}

/** The state transition evidence from one CLI action sequence. */
export type IssuesCliExecution = Readonly<{
  finalModel: Model
  initialModel: Model
  messages: ReadonlyArray<Message>
}>

type IssueTrackerResources = typeof StaticIssueTrackerResources

const fallbackProducts = [
  ProductCatalogEntry.make({
    product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
    updatedAtMs: 1_753_800_000_000,
  }),
  ProductCatalogEntry.make({
    product: LibraryProduct.make({ id: 'foldkit', name: 'Foldkit' }),
    updatedAtMs: 1_753_800_000_000,
  }),
  ProductCatalogEntry.make({
    product: LibraryProduct.make({
      id: 'instant-data-swift',
      name: 'Instant Data Swift',
    }),
    updatedAtMs: 1_753_800_000_000,
  }),
  ProductCatalogEntry.make({
    product: ApplicationProduct.make({ id: 'ayutia', name: 'AYUTIA' }),
    updatedAtMs: 1_753_800_000_000,
  }),
  ProductCatalogEntry.make({
    product: ApplicationProduct.make({
      id: 'universal-software-shop',
      name: 'Universal Software Shop',
    }),
    updatedAtMs: 1_753_800_000_000,
  }),
  ProductCatalogEntry.make({
    product: ApplicationProduct.make({ id: 'casino', name: 'Casino' }),
    updatedAtMs: 1_753_800_000_000,
  }),
]

const ensureFilingCatalog = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
  model: Model,
): Effect.Effect<Model> => {
  if (
    model.products._tag === 'LoadedProducts' &&
    model.products.products.length > 0
  ) {
    return Effect.succeed(model)
  }
  return Effect.gen(function* () {
    yield* runtime.run(ObservedProducts.make({ products: fallbackProducts }))
    return runtime.readModel()
  })
}

const hasSettledObservations = (model: Model): boolean =>
  (model.navigation._tag !== 'FileIssue' ||
    model.draftState._tag !== 'SavingIssueDraft') &&
  model.issueMutation._tag !== 'SavingIssueMutation' &&
  model.issues._tag !== 'LoadingIssues' &&
  model.products._tag !== 'LoadingProducts' &&
  (model.navigation._tag !== 'IssueDetail' ||
    model.issueDetail._tag === 'LoadedIssue' ||
    model.issueDetail._tag === 'FailedIssue')

const awaitObservations = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
  timeout: '2 seconds' | '20 seconds',
): Effect.Effect<Model> =>
  hasSettledObservations(runtime.readModel())
    ? Effect.succeed(runtime.readModel())
    : Effect.callback<Model>(resume => {
        const observedModel = (model: Model) => {
          if (hasSettledObservations(model)) resume(Effect.succeed(model))
        }
        const stop = runtime.observeModel(observedModel)
        observedModel(runtime.readModel())
        return Effect.sync(stop)
      }).pipe(Effect.timeout(timeout), Effect.orDie)

const runTokens = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
  initialModel: Model,
  tokens: ReadonlyArray<string>,
  timeout: '2 seconds' | '20 seconds',
): Effect.Effect<
  Readonly<{ finalModel: Model; messages: ReadonlyArray<Message> }>,
  IssuesCliError
> =>
  Effect.gen(function* () {
    let nextModel = initialModel
    let messages: ReadonlyArray<Message> = []
    for (const token of tokens) {
      const maybeMessage = messageForScreenToken(nextModel, token)
      if (Option.isNone(maybeMessage)) {
        const validTokens = Array.join(
          Array.map(
            interactionsForModel(nextModel),
            interaction => interaction.token,
          ),
          ', ',
        )
        const draftHint = M.value(nextModel.navigation).pipe(
          M.withReturnType<string>(),
          M.tagsExhaustive({
            FileIssue: () =>
              ', title:<text>, details:<text>, priority:P0-P4, product:<id>',
            IssueDetail: () =>
              ', log:<text>, comment:<text>, link:<id>, status:Open|Blocked|Closed',
            IssueList: () => '',
            TriageInbox: () => '',
          }),
        )
        return yield* Effect.fail(
          new IssuesCliError({
            message: `Action "${token}" is not valid here. Valid actions: ${validTokens}${draftHint}`,
          }),
        )
      }
      messages = Array.append(messages, maybeMessage.value)
      yield* runtime.run(maybeMessage.value)
      nextModel = yield* awaitObservations(runtime, timeout)
    }
    return { finalModel: nextModel, messages }
  })

/** Runs Issue Tracker tokens through the renderer-free Program runtime. */
export const executeIssues = (
  tokens: ReadonlyArray<string>,
  maybeInitialNavigation = Option.none<Navigation>(),
  resources: IssueTrackerResources = StaticIssueTrackerResources,
  timeout: '2 seconds' | '20 seconds' = '2 seconds',
): Effect.Effect<IssuesCliExecution, IssuesCliError> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: IssueTrackerProgram,
          resources,
          start: Runtime.fromModel(
            modelForNavigation(
              Option.getOrElse(maybeInitialNavigation, () =>
                IssueList.make({}),
              ),
            ),
          ),
        }),
      )
      yield* runtime.initialization
      const observedModel = yield* awaitObservations(runtime, timeout)
      const initialModel = yield* ensureFilingCatalog(runtime, observedModel)
      const execution = yield* runTokens(runtime, initialModel, tokens, timeout)
      yield* runtime.shutdown
      return { initialModel, ...execution }
    }),
  )

const viewerUrlLine = (url: Option.Option<string>): ReadonlyArray<string> =>
  Option.match(url, {
    onNone: () => [],
    onSome: value => (value === '' ? [] : [value]),
  })

/** Formats one host-neutral destination as plain terminal lines. */
export const formatDestination = (
  destination: Destination,
): ReadonlyArray<string> =>
  M.value(destination).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      IssueListDestination: ({ state }) =>
        M.value(state).pipe(
          M.withReturnType<ReadonlyArray<string>>(),
          M.tagsExhaustive({
            LoadingIssues: () => ['Issues', 'Observing…'],
            FailedIssues: ({ reason }) => ['Issues unavailable', reason],
            LoadedIssues: ({ issues }) => [
              'Issues',
              ...Array.map(
                issues,
                issue =>
                  `${issue.id}  ${issue.priority}  ${issue.title}  [${issue.product.name}]`,
              ),
            ],
          }),
        ),
      IssueDetailDestination: ({ issueId, state }) =>
        M.value(state).pipe(
          M.withReturnType<ReadonlyArray<string>>(),
          M.tagsExhaustive({
            NotObservingIssue: () => [issueId, 'Not observing'],
            LoadingIssue: () => [issueId, 'Observing…'],
            FailedIssue: ({ reason }) => [issueId, reason],
            LoadedIssue: ({ issue }) =>
              Option.match(issue, {
                onNone: () => [issueId, 'Issue not found'],
                onSome: observed => {
                  const leftover = leftoverStatusOf(observed.status)
                  const kind = Option.getOrElse(
                    leftoverKindOf(observed),
                    () => '',
                  )
                  const progress = newestWorkLog(observed.workLog)
                  const links = catalogIssueRefsOf(observed)
                  return [
                    kind === ''
                      ? `${observed.id}  ${observed.priority}  ${leftover}`
                      : `${observed.id}  ${observed.priority}  ${leftover}  ${kind}`,
                    observed.title,
                    observed.details,
                    'Work log',
                    ...(Array.isReadonlyArrayEmpty(progress)
                      ? ['No work log yet.']
                      : Array.map(
                          progress,
                          entry =>
                            `${new Date(entry.occurredAtMs).toISOString()}  ${entry.summary}`,
                        )),
                    'Linked issues',
                    ...(Array.isReadonlyArrayEmpty(links)
                      ? ['No linked issues.']
                      : Array.map(links, ref => ref.id)),
                    `${observed.product._tag}: ${observed.product.name}`,
                    ...viewerUrlLine(observed.viewerURL),
                  ]
                },
              }),
          }),
        ),
      FileIssueDestination: ({ draft, draftState, products }) => [
        'File issue',
        `Title: ${draft.title}`,
        `Product: ${draft.productId}`,
        `Priority: ${draft.priority}`,
        `State: ${draftState._tag}`,
        ...(draftState._tag === 'FailedIssueDraft' ? [draftState.reason] : []),
        `Catalog: ${products._tag}`,
      ],
      TriageInboxDestination: ({ state }) =>
        state._tag === 'LoadedTriageCandidates'
          ? [
              'Triage inbox',
              ...Array.map(
                state.candidates,
                candidate =>
                  `${candidate.id}  ${candidate.status}  ${candidate.suggestedTitle}  [${candidate.segment.startMilliseconds.toString()}-${candidate.segment.endMilliseconds.toString()}ms]`,
              ),
            ]
          : ['Triage inbox', state._tag],
    }),
  )

const formatInteractions = (
  interactions: ReadonlyArray<Interaction>,
): ReadonlyArray<string> => [
  'Available commands:',
  ...Array.map(
    interactions,
    interaction => `  ${interaction.token}  ${interaction.label}`,
  ),
]

/** Paints the shared leftover board, including the Program product filter. */
export const formatModel = (model: Model): ReadonlyArray<string> => {
  const destination = destinationForModel(model)
  if (
    destination._tag !== 'IssueListDestination' ||
    destination.state._tag !== 'LoadedIssues'
  ) {
    return formatDestination(destination)
  }
  const selected =
    model.productFilter._tag === 'OneProduct'
      ? model.productFilter.productId
      : 'all'
  const chips = Array.filter(interactionsForModel(model), interaction =>
    interaction.token.startsWith('product:'),
  )
  return [
    'Issues',
    'Product filter',
    ...Array.map(chips, interaction => {
      const id = interaction.token.slice('product:'.length)
      return id === selected
        ? `${interaction.label} (selected)`
        : interaction.label
    }),
    'Current issues',
    ...Array.map(
      destination.state.issues,
      issue =>
        `${issue.id}  ${issue.priority}  ${issue.title}  [${issue.product.name}]`,
    ),
  ]
}

const resolveLiveResources = (): Effect.Effect<
  IssueTrackerResources,
  IssuesInstantConfigError
> => {
  const resources = liveIssueTrackerResources()
  if (resources instanceof IssuesInstantConfigError) {
    return Effect.fail(resources)
  }
  return Effect.succeed(resources as IssueTrackerResources)
}

/** Prints the final screen and optionally the Messages valid in that state. */
export const runIssues = (
  tokens: ReadonlyArray<string>,
  isVerbose: boolean,
  maybeInitialNavigation = Option.none<Navigation>(),
): Effect.Effect<void, IssuesCliError | IssuesInstantConfigError> =>
  Effect.gen(function* () {
    const resources = yield* resolveLiveResources()
    const execution = yield* executeIssues(
      tokens,
      maybeInitialNavigation,
      resources,
      '20 seconds',
    )
    const painting = paintCli(issuesScreen(execution.finalModel), {
      binaryName: 'foldkit-issues',
      whatFor: token => token,
    })
    yield* Console.log(painting.screen)
    if (isVerbose) {
      yield* Console.log(
        Array.join(
          formatInteractions(interactionsForModel(execution.finalModel)),
          '\n',
        ),
      )
    }
  })
