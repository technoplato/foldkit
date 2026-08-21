import {
  Clock,
  Duration,
  Effect,
  Match as M,
  Option,
  Schema as S,
} from 'effect'
import { Command } from 'foldkit'
import type * as CommandModule from 'foldkit/command'
import { evo } from 'foldkit/struct'

import { Ingested, type Message } from './message.js'
import {
  type Conversation,
  LiveFollowing,
  LiveIdle,
  type Mode,
  type Model,
  type Screen,
  Settings,
  Transcript,
  appendIngestedRow,
  canonicalize,
  chatsScreen,
  conversationById,
  conversationByIdentifier,
  libraryScreen,
  liveIngestDelayMs,
  projectById,
  projectsScreen,
} from './model.js'

type Result = readonly [Model, ReadonlyArray<CommandModule.Command<Message>>]

const none = (model: Model): Result => [model, []]

const keepTranscriptHandles = (model: Model, screen: Screen): boolean =>
  model.screen._tag === 'Transcript' &&
  screen._tag === 'Transcript' &&
  model.screen.conversationId === screen.conversationId

const applyScreen = (
  model: Model,
  screen: Screen,
  history: ReadonlyArray<Screen>,
): Model =>
  evo(model, {
    screen: () => screen,
    history: () => history,
    findQuery: keepTranscriptHandles(model, screen)
      ? () => model.findQuery
      : () => '',
    maybeFocusMessageId: keepTranscriptHandles(model, screen)
      ? () => model.maybeFocusMessageId
      : () => Option.none(),
  })

const navigate = (model: Model, screen: Screen): Model =>
  applyScreen(model, screen, [...model.history, model.screen])

export const IngestLive = Command.define(
  'IngestLive',
  { conversationId: S.String },
  Ingested,
)(({ conversationId }) =>
  Effect.gen(function* () {
    yield* Effect.sleep(Duration.millis(liveIngestDelayMs))
    const now = yield* Clock.currentTimeMillis
    return Ingested({ conversationId, now })
  }),
)

const previousScreen = (
  model: Model,
  conversations: ReadonlyArray<Conversation>,
): readonly [Screen, ReadonlyArray<Screen>] => {
  const last = model.history.at(-1)
  if (last === undefined) {
    return [chatsScreen(conversations), []]
  }
  return [
    canonicalize(last, conversations, model.projects),
    model.history.slice(0, -1),
  ]
}

const modeAfterDelete = (mode: Mode, conversationId: string): Mode => {
  if (mode._tag === 'LiveFollowing' && mode.conversationId === conversationId) {
    return LiveIdle()
  }
  return mode
}

const screenAfterDelete = (
  model: Model,
  remaining: ReadonlyArray<Conversation>,
  conversationId: string,
): readonly [Screen, ReadonlyArray<Screen>] => {
  if (
    model.screen._tag === 'Transcript' &&
    model.screen.conversationId === conversationId
  ) {
    return previousScreen(model, remaining)
  }
  return [canonicalize(model.screen, remaining, model.projects), model.history]
}

export const update = (model: Model, message: Message): Result =>
  M.value(message).pipe(
    M.withReturnType<Result>(),
    M.tagsExhaustive({
      ClickedOpenProjects: () => [
        navigate(model, projectsScreen(model.projects)),
        [],
      ],
      ClickedOpenChats: () => [
        navigate(model, chatsScreen(model.conversations)),
        [],
      ],
      ClickedOpenProject: ({ projectId }) => {
        if (projectById(model.projects, projectId) === undefined) {
          return none(model)
        }
        return [
          navigate(model, libraryScreen(projectId, model.conversations)),
          [],
        ]
      },
      ClickedOpenConversation: ({ conversationId }) => {
        if (
          conversationById(model.conversations, conversationId) === undefined
        ) {
          return none(model)
        }
        return [navigate(model, Transcript({ conversationId })), []]
      },
      ClickedOpenIdentifier: ({ identifier }) => {
        const conversation = conversationByIdentifier(
          model.conversations,
          identifier,
        )
        if (conversation === undefined) {
          return none(model)
        }
        return [
          navigate(model, Transcript({ conversationId: conversation.id })),
          [],
        ]
      },
      ClickedGoBack: () => {
        const [screen, history] = previousScreen(model, model.conversations)
        return [applyScreen(model, screen, history), []]
      },
      ClickedOpenSettings: () => [navigate(model, Settings()), []],
      ClickedFollow: ({ conversationId }) => {
        if (
          conversationById(model.conversations, conversationId) === undefined
        ) {
          return none(model)
        }
        const onTranscript =
          model.screen._tag === 'Transcript' &&
          model.screen.conversationId === conversationId
        const next = onTranscript
          ? model
          : navigate(model, Transcript({ conversationId }))
        return [
          evo(next, {
            mode: () => LiveFollowing({ conversationId }),
          }),
          [],
        ]
      },
      ClickedStopFollow: () => [
        evo(model, {
          mode: () => LiveIdle(),
        }),
        [],
      ],
      ClickedDeleteConversation: ({ conversationId }) => {
        if (
          conversationById(model.conversations, conversationId) === undefined
        ) {
          return none(model)
        }
        const remaining = model.conversations.filter(
          conversation => conversation.id !== conversationId,
        )
        const [screen, history] = screenAfterDelete(
          model,
          remaining,
          conversationId,
        )
        return [
          evo(applyScreen(model, screen, history), {
            conversations: () => remaining,
            mode: () => modeAfterDelete(model.mode, conversationId),
          }),
          [],
        ]
      },
      UpdatedFindQuery: ({ query }) => {
        if (model.screen._tag !== 'Transcript') {
          return none(model)
        }
        return [
          evo(model, {
            findQuery: () => query,
          }),
          [],
        ]
      },
      ClickedJumpTo: ({ messageId }) => {
        if (model.screen._tag !== 'Transcript') {
          return none(model)
        }
        const conversation = conversationById(
          model.conversations,
          model.screen.conversationId,
        )
        if (conversation === undefined) {
          return none(model)
        }
        if (!conversation.messages.some(row => row.id === messageId)) {
          return none(model)
        }
        return [
          evo(model, {
            maybeFocusMessageId: () => Option.some(messageId),
          }),
          [],
        ]
      },
      ClickedIngest: () => {
        if (model.screen._tag !== 'Transcript') {
          return none(model)
        }
        return [
          model,
          [IngestLive({ conversationId: model.screen.conversationId })],
        ]
      },
      Ingested: ({ conversationId, now }) => {
        const conversation = conversationById(
          model.conversations,
          conversationId,
        )
        if (conversation === undefined) {
          return none(model)
        }
        return [
          evo(model, {
            conversations: conversations =>
              conversations.map(row =>
                row.id === conversationId ? appendIngestedRow(row, now) : row,
              ),
          }),
          [],
        ]
      },
    }),
  )
