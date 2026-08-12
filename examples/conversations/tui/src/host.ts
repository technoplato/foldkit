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
  projectById,
  promptCount,
} from 'conversations-core-example'
import {
  Cause,
  Effect,
  Layer,
  Match as M,
  Option,
  PlatformError,
  Queue,
  Terminal,
} from 'effect'
import { Runtime } from 'foldkit'

const CLEAR_SCREEN = '\u001b[2J\u001b[H'
const SCREEN_INNER_WIDTH = 62

const framed = (content: string): string => {
  const clipped = content.slice(0, SCREEN_INNER_WIDTH - 1)
  const remainingWidth = Math.max(0, SCREEN_INNER_WIDTH - clipped.length)
  return `| ${clipped}${' '.repeat(Math.max(0, remainingWidth - 1))}|`
}

const visibleIds = (model: Model): ReadonlyArray<string> =>
  M.value(model.screen).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      ProjectsEmpty: () => [],
      ProjectsPopulated: () => model.projects.map(project => project.id),
      ChatsEmpty: () => [],
      ChatsPopulated: () =>
        model.conversations.map(conversation => conversation.id),
      LibraryEmpty: () => [],
      LibraryPopulated: ({ projectId }) =>
        conversationsForProject(model.conversations, projectId).map(
          conversation => conversation.id,
        ),
      Transcript: () => [],
      Settings: () => [],
    }),
  )

const listLines = (model: Model): ReadonlyArray<string> =>
  M.value(model.screen).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      ProjectsEmpty: () => ['No projects.'],
      ProjectsPopulated: () =>
        model.projects.map(
          (project, index) => `[${index + 1}] ${project.name}`,
        ),
      ChatsEmpty: () => ['No sessions.'],
      ChatsPopulated: () =>
        model.conversations.map(
          (conversation, index) =>
            `[${index + 1}] ${conversation.title} ${identifierLabel(conversation.identifier)} ${promptCount(conversation)}p`,
        ),
      LibraryEmpty: ({ projectId }) => [
        `${projectById(model.projects, projectId)?.name ?? projectId} empty`,
      ],
      LibraryPopulated: ({ projectId }) =>
        conversationsForProject(model.conversations, projectId).map(
          (conversation, index) => `[${index + 1}] ${conversation.title}`,
        ),
      Transcript: ({ conversationId }) => {
        const conversation = conversationById(
          model.conversations,
          conversationId,
        )
        if (conversation === undefined) {
          return ['Missing session']
        }
        const follow =
          model.mode._tag === 'LiveFollowing' ? 'following' : 'liveIdle'
        return [
          conversation.title,
          follow,
          ...conversation.messages.slice(-6).map(row => {
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
        ]
      },
      Settings: () => [
        'Analytics, Skills, Resume, Billing are other domains',
        'Follow latency <= 100 ms',
      ],
    }),
  )

const titleForScreen = (model: Model): string =>
  M.value(model.screen).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      ProjectsEmpty: () => 'Projects',
      ProjectsPopulated: () => 'Projects',
      ChatsEmpty: () => 'Chats',
      ChatsPopulated: () => 'Chats',
      LibraryEmpty: ({ projectId }) =>
        projectById(model.projects, projectId)?.name ?? projectId,
      LibraryPopulated: ({ projectId }) =>
        projectById(model.projects, projectId)?.name ?? projectId,
      Transcript: () => 'Transcript',
      Settings: () => 'Settings',
    }),
  )

export const renderConversationsScreen = (model: Model): string => {
  const border = `+${'-'.repeat(SCREEN_INNER_WIDTH)}+`
  const lines = [
    border,
    framed(titleForScreen(model)),
    framed(''),
    ...listLines(model).map(framed),
    framed(''),
    framed('[1-9] open  [P] projects  [C] chats  [S] settings'),
    framed('[B] back  [F] follow  [I] ingest  [D] delete  [Q] quit'),
    border,
  ]
  return `${CLEAR_SCREEN}${lines.join('\n')}\n`
}

export const messageForInput = (
  model: Model,
  input: string,
): Option.Option<Message> => {
  const key = input.toLowerCase()
  const index = Number.parseInt(key, 10)
  if (index >= 1 && index <= 9) {
    const id = visibleIds(model)[index - 1]
    if (id === undefined) {
      return Option.none()
    }
    if (
      model.screen._tag === 'ProjectsPopulated' ||
      model.screen._tag === 'ProjectsEmpty'
    ) {
      return Option.some(ClickedOpenProject({ projectId: id }))
    }
    return Option.some(ClickedOpenConversation({ conversationId: id }))
  }
  if (key === 'p') {
    return Option.some(ClickedOpenProjects())
  }
  if (key === 'c') {
    return Option.some(ClickedOpenChats())
  }
  if (key === 's') {
    return Option.some(ClickedOpenSettings())
  }
  if (key === 'b') {
    return Option.some(ClickedGoBack())
  }
  if (key === 'i') {
    return Option.some(ClickedIngest())
  }
  if (key === 'f') {
    if (model.screen._tag === 'Transcript') {
      if (model.mode._tag === 'LiveFollowing') {
        return Option.some(ClickedStopFollow())
      }
      return Option.some(
        ClickedFollow({ conversationId: model.screen.conversationId }),
      )
    }
    return Option.none()
  }
  if (key === 'd') {
    if (model.screen._tag === 'Transcript') {
      return Option.some(
        ClickedDeleteConversation({
          conversationId: model.screen.conversationId,
        }),
      )
    }
    return Option.none()
  }
  return Option.none()
}

const runInputLoop = (
  inputQueue: Queue.Dequeue<Terminal.UserInput, Cause.Done>,
  runtime: Runtime.ProgramRuntime<Model, Message>,
  terminal: Terminal.Terminal,
): Effect.Effect<void, Cause.Done | PlatformError.PlatformError> =>
  Queue.take(inputQueue).pipe(
    Effect.flatMap(input => {
      const key = Option.getOrElse(
        input.input,
        () => input.key.name,
      ).toLowerCase()
      if (key === 'q') {
        return Effect.void
      }

      const maybeMessage = messageForInput(runtime.readModel(), key)
      if (Option.isSome(maybeMessage)) {
        return runtime.run(maybeMessage.value).pipe(
          Effect.flatMap(model =>
            terminal.display(renderConversationsScreen(model)),
          ),
          Effect.flatMap(() => runInputLoop(inputQueue, runtime, terminal)),
        )
      } else {
        return runInputLoop(inputQueue, runtime, terminal)
      }
    }),
  )

export const runConversationsTui = (): Effect.Effect<
  void,
  Cause.Done | PlatformError.PlatformError,
  Terminal.Terminal
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: ConversationsProgram,
          resources: Layer.empty,
        }),
      )

      yield* runtime.initialization
      yield* terminal.display(renderConversationsScreen(runtime.readModel()))

      const inputQueue = yield* terminal.readInput
      yield* runInputLoop(inputQueue, runtime, terminal)
      yield* runtime.shutdown
    }),
  )
