import { Duration, Effect, Match as M, Schema as S } from 'effect'
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
  libraryScreen,
  liveIngestDelayMs,
  projectById,
  projectsScreen,
} from './model.js'

type Result = readonly [Model, ReadonlyArray<CommandModule.Command<Message>>]

const none = (model: Model): Result => [model, []]

export const IngestLive = Command.define(
  'IngestLive',
  { conversationId: S.String },
  Ingested,
)(({ conversationId }) =>
  Effect.sleep(Duration.millis(liveIngestDelayMs)).pipe(
    Effect.map(() => Ingested({ conversationId, now: Date.now() })),
  ),
)

const navigate = (model: Model, screen: Screen): Model =>
  evo(model, {
    history: () => [...model.history, model.screen],
    screen: () => screen,
  })

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
      ClickedGoBack: () => {
        const [screen, history] = previousScreen(model, model.conversations)
        return [
          evo(model, {
            screen: () => screen,
            history: () => history,
          }),
          [],
        ]
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
          evo(model, {
            conversations: () => remaining,
            screen: () => screen,
            history: () => history,
            mode: () => modeAfterDelete(model.mode, conversationId),
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
