import {
  ClickedDeleteConversation,
  ClickedFollow,
  ClickedGoBack,
  ClickedIngest,
  ClickedOpenChats,
  ClickedOpenConversation,
  ClickedOpenProject,
  ClickedOpenProjects,
  ClickedOpenSettings,
  ClickedStopFollow,
  ConversationsProgram,
  type Message,
  type Model,
  conversationById,
  conversationsForProject,
  identifierLabel,
  lastActivityAt,
  projectById,
  promptCount,
  sessionCount,
  snippet,
  visibilityLabel,
} from 'conversations-core-example'
import { Console, Data, Effect, Layer, Match as M } from 'effect'
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
  return Effect.fail(
    new ConversationsCliError({
      reason: `Unknown conversations token "${token}"`,
    }),
  )
}

const runMessages = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
  initialModel: Model,
  messages: ReadonlyArray<Message>,
): Effect.Effect<Model> =>
  Effect.gen(function* () {
    let nextModel = initialModel
    for (const message of messages) {
      nextModel = yield* runtime.run(message)
    }
    return nextModel
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
      const messages = yield* Effect.forEach(tokens, messageForToken)
      const finalModel = yield* runMessages(runtime, initialModel, messages)
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
        return [
          `${conversation.title} · ${visibilityLabel(conversation.visibility)} · ${follow}`,
          ...conversation.messages.map(row => {
            if (row.body._tag === 'BodyText') {
              return row.body.content
            }
            if (row.body._tag === 'BodyThought') {
              return `thinking: ${row.body.content}`
            }
            if (row.body._tag === 'BodyTool') {
              return `tool ${row.body.name}`
            }
            return `edit ${row.body.path}`
          }),
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
      ClickedGoBack: () => 'ClickedGoBack()',
      ClickedOpenSettings: () => 'ClickedOpenSettings()',
      ClickedFollow: ({ conversationId }) => `ClickedFollow(${conversationId})`,
      ClickedStopFollow: () => 'ClickedStopFollow()',
      ClickedDeleteConversation: ({ conversationId }) =>
        `ClickedDeleteConversation(${conversationId})`,
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
