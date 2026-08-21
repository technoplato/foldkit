import {
  ClickedDeleteConversation,
  ClickedFollow,
  ClickedGoBack,
  ClickedIngest,
  ClickedJumpTo,
  ClickedOpenChats,
  ClickedOpenConversation,
  ClickedOpenIdentifier,
  ClickedOpenProject,
  ClickedOpenProjects,
  ClickedOpenSettings,
  ClickedStopFollow,
  ConversationsProgram,
  type Message,
  type Model,
  UpdatedFindQuery,
  authorDisplayName,
  bodyKindName,
  conversationById,
  conversationsForProject,
  focusedRow,
  identifierFromKindValue,
  identifierLabel,
  lastActivityAt,
  messageBodyText,
  nextBreakdownMessageId,
  previousBreakdownMessageId,
  projectById,
  promptCount,
  sessionCount,
  snippet,
  transcriptBreakdown,
  visibilityLabel,
} from 'conversations-core-example'
import { Console, Data, Effect, Layer, Match as M, Option } from 'effect'
import { Runtime } from 'foldkit'

export class ConversationsCliError extends Data.TaggedError(
  'ConversationsCliError',
)<{
  readonly reason: string
}> {}

export type ConversationsCliExecution = Readonly<{
  initialModel: Model
  messages: ReadonlyArray<Message>
  finalModel: Model
}>

export const messageForToken = (
  token: string,
  model: Model,
): Effect.Effect<Message, ConversationsCliError> => {
  const normalized = token.trim()
  if (normalized === 'projects') {
    return Effect.succeed(ClickedOpenProjects())
  }
  if (normalized === 'chats') {
    return Effect.succeed(ClickedOpenChats())
  }
  if (normalized === 'settings') {
    return Effect.succeed(ClickedOpenSettings())
  }
  if (normalized === 'back') {
    return Effect.succeed(ClickedGoBack())
  }
  if (normalized === 'ingest') {
    return Effect.succeed(ClickedIngest())
  }
  if (normalized === 'stop') {
    return Effect.succeed(ClickedStopFollow())
  }
  if (normalized === 'next') {
    return jumpToken(
      nextBreakdownMessageId(
        transcriptBreakdown(model),
        model.maybeFocusMessageId,
      ),
      'next',
    )
  }
  if (normalized === 'prev') {
    return jumpToken(
      previousBreakdownMessageId(
        transcriptBreakdown(model),
        model.maybeFocusMessageId,
      ),
      'prev',
    )
  }
  if (normalized.startsWith('project:')) {
    return Effect.succeed(
      ClickedOpenProject({ projectId: normalized.slice('project:'.length) }),
    )
  }
  if (normalized.startsWith('open:')) {
    return Effect.succeed(
      ClickedOpenConversation({
        conversationId: normalized.slice('open:'.length),
      }),
    )
  }
  if (normalized.startsWith('identifier:')) {
    return identifierToken(normalized.slice('identifier:'.length))
  }
  if (normalized.startsWith('follow:')) {
    return Effect.succeed(
      ClickedFollow({ conversationId: normalized.slice('follow:'.length) }),
    )
  }
  if (normalized.startsWith('delete:')) {
    return Effect.succeed(
      ClickedDeleteConversation({
        conversationId: normalized.slice('delete:'.length),
      }),
    )
  }
  if (normalized.startsWith('find:')) {
    return Effect.succeed(
      UpdatedFindQuery({ query: normalized.slice('find:'.length) }),
    )
  }
  if (normalized.startsWith('jump:')) {
    return Effect.succeed(
      ClickedJumpTo({ messageId: normalized.slice('jump:'.length) }),
    )
  }
  return Effect.fail(
    new ConversationsCliError({
      reason: `Unknown conversations token "${token}"`,
    }),
  )
}

const jumpToken = (
  maybeMessageId: Option.Option<string>,
  token: string,
): Effect.Effect<Message, ConversationsCliError> =>
  Option.match(maybeMessageId, {
    onNone: () =>
      Effect.fail(
        new ConversationsCliError({
          reason: `No ${token} breakdown row on this screen`,
        }),
      ),
    onSome: messageId => Effect.succeed(ClickedJumpTo({ messageId })),
  })

const identifierToken = (
  rest: string,
): Effect.Effect<Message, ConversationsCliError> => {
  const colon = rest.indexOf(':')
  const kind = colon === -1 ? rest : rest.slice(0, colon)
  const value = colon === -1 ? '' : rest.slice(colon + 1)
  const identifier = identifierFromKindValue(kind, value)
  if (identifier === undefined) {
    return Effect.fail(
      new ConversationsCliError({
        reason: `Unknown identifier "${rest}"`,
      }),
    )
  }
  return Effect.succeed(ClickedOpenIdentifier({ identifier }))
}

const runMessages = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
  initialModel: Model,
  tokens: ReadonlyArray<string>,
): Effect.Effect<
  { messages: ReadonlyArray<Message>; finalModel: Model },
  ConversationsCliError
> =>
  Effect.gen(function* () {
    const messages: Array<Message> = []
    let nextModel = initialModel
    for (const token of tokens) {
      const message = yield* messageForToken(token, nextModel)
      messages.push(message)
      nextModel = yield* runtime.run(message)
    }
    return { messages, finalModel: nextModel }
  })

export const executeConversationsInput = (
  tokens: ReadonlyArray<string>,
): Effect.Effect<ConversationsCliExecution, ConversationsCliError> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: ConversationsProgram,
          resources: Layer.empty,
        }),
      )
      const initialModel = yield* runtime.initialization
      const { messages, finalModel } = yield* runMessages(
        runtime,
        initialModel,
        tokens,
      )
      yield* runtime.shutdown
      return { initialModel, messages, finalModel }
    }),
  )

export const describeScreen = (model: Model): string =>
  M.value(model.screen).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      ProjectsEmpty: () => 'projects empty',
      ProjectsPopulated: () =>
        model.projects
          .map(
            project =>
              `${project.name} (${sessionCount(model.conversations, project.id)} sessions, ${new Date(lastActivityAt(project, model.conversations)).toISOString().slice(0, 10)})`,
          )
          .join('\n'),
      ChatsEmpty: () => 'chats empty',
      ChatsPopulated: () =>
        model.conversations
          .map(
            conversation =>
              `${conversation.title} · ${identifierLabel(conversation.identifier)} · ${promptCount(conversation)} prompts`,
          )
          .join('\n'),
      LibraryEmpty: ({ projectId }) =>
        `${projectById(model.projects, projectId)?.name ?? projectId} empty`,
      LibraryPopulated: ({ projectId }) =>
        conversationsForProject(model.conversations, projectId)
          .map(
            conversation => `${conversation.title} · ${snippet(conversation)}`,
          )
          .join('\n'),
      Transcript: ({ conversationId }) => {
        const conversation = conversationById(
          model.conversations,
          conversationId,
        )
        if (conversation === undefined) {
          return `missing ${conversationId}`
        }
        const follow =
          model.mode._tag === 'LiveFollowing'
            ? `following ${model.mode.conversationId}`
            : 'liveIdle'
        const focus = Option.match(focusedRow(model), {
          onNone: () => 'focus none',
          onSome: row =>
            `focus ${row.id}\n${authorDisplayName(row.author)}\n${messageBodyText(row)}`,
        })
        const find =
          model.findQuery.trim() === '' ? 'find off' : `find ${model.findQuery}`
        return [
          `${conversation.title} · ${visibilityLabel(conversation.visibility)} · ${follow} · ${find} · ${focus}`,
          ...transcriptBreakdown(model).map(
            entry =>
              `${entry.messageId} ${bodyKindName(entry.bodyKind)} ${entry.label}`,
          ),
        ].join('\n')
      },
      Settings: () =>
        'settings · Analytics, Skills, Resume, and Billing are other domains',
    }),
  )

const formatMessage = (message: Message): string =>
  M.value(message).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      ClickedOpenProjects: () => 'ClickedOpenProjects()',
      ClickedOpenChats: () => 'ClickedOpenChats()',
      ClickedOpenProject: ({ projectId }) => `ClickedOpenProject(${projectId})`,
      ClickedOpenConversation: ({ conversationId }) =>
        `ClickedOpenConversation(${conversationId})`,
      ClickedOpenIdentifier: ({ identifier }) =>
        `ClickedOpenIdentifier(${identifier._tag})`,
      ClickedGoBack: () => 'ClickedGoBack()',
      ClickedOpenSettings: () => 'ClickedOpenSettings()',
      ClickedFollow: ({ conversationId }) => `ClickedFollow(${conversationId})`,
      ClickedStopFollow: () => 'ClickedStopFollow()',
      ClickedDeleteConversation: ({ conversationId }) =>
        `ClickedDeleteConversation(${conversationId})`,
      UpdatedFindQuery: ({ query }) => `UpdatedFindQuery(${query})`,
      ClickedJumpTo: ({ messageId }) => `ClickedJumpTo(${messageId})`,
      ClickedIngest: () => 'ClickedIngest()',
      Ingested: ({ conversationId }) => `Ingested(${conversationId})`,
    }),
  )

export const runConversationsShow = (
  isVerbose: boolean,
): Effect.Effect<void, ConversationsCliError> =>
  Effect.gen(function* () {
    const execution = yield* executeConversationsInput([])
    if (isVerbose) {
      yield* Console.log(`Screen: ${execution.finalModel.screen._tag}`)
    }
    yield* Console.log(describeScreen(execution.finalModel))
  })

export const runConversationsInput = (
  tokens: ReadonlyArray<string>,
  isVerbose: boolean,
): Effect.Effect<void, ConversationsCliError> =>
  Effect.gen(function* () {
    const execution = yield* executeConversationsInput(tokens)
    if (isVerbose) {
      for (const message of execution.messages) {
        yield* Console.log(`Message: ${formatMessage(message)}`)
      }
      yield* Console.log(`Screen: ${execution.finalModel.screen._tag}`)
    }
    yield* Console.log(describeScreen(execution.finalModel))
  })
