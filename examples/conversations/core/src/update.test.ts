import { Story } from 'foldkit'
import { describe, expect, test } from 'vitest'

import {
  ChatsPopulated,
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
  IngestLive,
  Ingested,
  LibraryPopulated,
  LiveFollowing,
  LiveIdle,
  ProjectsPopulated,
  Settings,
  Transcript,
  cmuxConversation,
  conversationById,
  debugConversation,
  identifierLabel,
  init,
  initialModel,
  outline,
  promptCount,
  restore,
  scribeProject,
  snippet,
  update,
} from './index.js'

describe('conversations update', () => {
  test('init opens the populated projects list', () => {
    const [model, commands] = init()
    expect(model.screen).toEqual(ProjectsPopulated())
    expect(model.mode).toEqual(LiveIdle())
    expect(commands).toEqual([])
  })

  test('restore preserves the Model', () => {
    expect(restore(initialModel)).toStrictEqual([initialModel, []])
  })

  test('derived list fields match SpecStory row facts', () => {
    expect(promptCount(cmuxConversation)).toBe(2)
    expect(snippet(cmuxConversation)).toContain('zscaler')
    expect(outline(cmuxConversation)).toHaveLength(2)
    expect(identifierLabel(cmuxConversation.identifier)).toBe('via Codex CLI')
  })

  test('open project then conversation reaches the transcript', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(ClickedOpenProject({ projectId: scribeProject.id })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.screen).toEqual(
          LibraryPopulated({ projectId: scribeProject.id }),
        )
      }),
      Story.message(
        ClickedOpenConversation({ conversationId: cmuxConversation.id }),
      ),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.screen).toEqual(
          Transcript({ conversationId: cmuxConversation.id }),
        )
      }),
    )
  })

  test('open chats lists every conversation', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(ClickedOpenChats()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.screen).toEqual(ChatsPopulated())
        expect(model.conversations).toHaveLength(3)
      }),
    )
  })

  test('follow from the library opens the transcript and follows', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(ClickedOpenProject({ projectId: scribeProject.id })),
      Story.Command.expectNone(),
      Story.message(ClickedFollow({ conversationId: cmuxConversation.id })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.screen).toEqual(
          Transcript({ conversationId: cmuxConversation.id }),
        )
        expect(model.mode).toEqual(
          LiveFollowing({ conversationId: cmuxConversation.id }),
        )
      }),
    )
  })

  test('ingest while following appends a visible row', () => {
    Story.story(
      update,
      Story.with({
        ...initialModel,
        screen: Transcript({ conversationId: cmuxConversation.id }),
        mode: LiveFollowing({ conversationId: cmuxConversation.id }),
      }),
      Story.message(ClickedIngest()),
      Story.Command.resolve(
        IngestLive,
        Ingested({ conversationId: cmuxConversation.id, now: 1_000 }),
      ),
      Story.model(model => {
        const conversation = conversationById(
          model.conversations,
          cmuxConversation.id,
        )
        expect(conversation?.messages.at(-1)?.body).toEqual(
          expect.objectContaining({
            _tag: 'BodyText',
            content: 'live ingest',
          }),
        )
      }),
    )
  })

  test('go back returns to the previous screen', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(ClickedOpenSettings()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.screen).toEqual(Settings())
      }),
      Story.message(ClickedGoBack()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.screen).toEqual(ProjectsPopulated())
      }),
    )
  })

  test('delete the open conversation leaves the library', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(ClickedOpenProject({ projectId: scribeProject.id })),
      Story.Command.expectNone(),
      Story.message(
        ClickedOpenConversation({ conversationId: debugConversation.id }),
      ),
      Story.Command.expectNone(),
      Story.message(
        ClickedDeleteConversation({ conversationId: debugConversation.id }),
      ),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(
          conversationById(model.conversations, debugConversation.id),
        ).toBeUndefined()
        expect(model.screen).toEqual(
          LibraryPopulated({ projectId: scribeProject.id }),
        )
        expect(model.mode).toEqual(LiveIdle())
      }),
    )
  })

  test('stop follow returns to liveIdle without leaving the transcript', () => {
    Story.story(
      update,
      Story.with({
        ...initialModel,
        screen: Transcript({ conversationId: cmuxConversation.id }),
        mode: LiveFollowing({ conversationId: cmuxConversation.id }),
      }),
      Story.message(ClickedStopFollow()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.screen).toEqual(
          Transcript({ conversationId: cmuxConversation.id }),
        )
        expect(model.mode).toEqual(LiveIdle())
      }),
    )
  })

  test('open projects from chats pushes history', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(ClickedOpenChats()),
      Story.Command.expectNone(),
      Story.message(ClickedOpenProjects()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.screen).toEqual(ProjectsPopulated())
      }),
      Story.message(ClickedGoBack()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.screen).toEqual(ChatsPopulated())
      }),
    )
  })
})
