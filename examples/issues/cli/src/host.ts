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
  StaticIssueTrackerResources,
  destinationForModel,
  interactionsForModel,
  messageForInteractionToken,
  modelForNavigation,
} from 'issues-core-example'

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

const hasSettledObservations = (model: Model): boolean =>
  model.issues._tag !== 'LoadingIssues' &&
  model.products._tag !== 'LoadingProducts' &&
  (model.navigation._tag !== 'IssueDetail' ||
    model.issueDetail._tag === 'LoadedIssue' ||
    model.issueDetail._tag === 'FailedIssue')

const awaitObservations = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
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
      }).pipe(Effect.timeout('2 seconds'), Effect.orDie)

const runTokens = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
  initialModel: Model,
  tokens: ReadonlyArray<string>,
): Effect.Effect<
  Readonly<{ finalModel: Model; messages: ReadonlyArray<Message> }>,
  IssuesCliError
> =>
  Effect.gen(function* () {
    let nextModel = initialModel
    let messages: ReadonlyArray<Message> = []
    for (const token of tokens) {
      const maybeMessage = messageForInteractionToken(nextModel, token)
      if (Option.isNone(maybeMessage)) {
        const validTokens = Array.join(
          Array.map(
            interactionsForModel(nextModel),
            interaction => interaction.token,
          ),
          ', ',
        )
        return yield* Effect.fail(
          new IssuesCliError({
            message: `Action "${token}" is not valid here. Valid actions: ${validTokens}`,
          }),
        )
      }
      messages = Array.append(messages, maybeMessage.value)
      yield* runtime.run(maybeMessage.value)
      nextModel = yield* awaitObservations(runtime)
    }
    return { finalModel: nextModel, messages }
  })

/** Runs Issue Tracker tokens through the renderer-free Program runtime. */
export const executeIssues = (
  tokens: ReadonlyArray<string>,
  maybeInitialNavigation = Option.none<Navigation>(),
): Effect.Effect<IssuesCliExecution, IssuesCliError> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: IssueTrackerProgram,
          resources: StaticIssueTrackerResources,
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
      const initialModel = yield* awaitObservations(runtime)
      const execution = yield* runTokens(runtime, initialModel, tokens)
      yield* runtime.shutdown
      return { initialModel, ...execution }
    }),
  )

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
                onSome: observed => [
                  `${observed.id}  ${observed.priority}  ${observed.status}`,
                  observed.title,
                  observed.details,
                  `${observed.product._tag}: ${observed.product.name}`,
                ],
              }),
          }),
        ),
      FileIssueDestination: ({ draft, draftState, products }) => [
        'File issue',
        `Title: ${draft.title}`,
        `Product: ${draft.productId}`,
        `Priority: ${draft.priority}`,
        `State: ${draftState._tag}`,
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

/** Prints the final screen and optionally the Messages valid in that state. */
export const runIssues = (
  tokens: ReadonlyArray<string>,
  isVerbose: boolean,
  maybeInitialNavigation = Option.none<Navigation>(),
): Effect.Effect<void, IssuesCliError> =>
  Effect.gen(function* () {
    const execution = yield* executeIssues(tokens, maybeInitialNavigation)
    yield* Console.log(
      Array.join(
        formatDestination(destinationForModel(execution.finalModel)),
        '\n',
      ),
    )
    if (isVerbose) {
      yield* Console.log(
        Array.join(
          formatInteractions(interactionsForModel(execution.finalModel)),
          '\n',
        ),
      )
    }
  })
