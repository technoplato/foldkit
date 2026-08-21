import { Option } from 'effect'
import { Story } from 'foldkit'
import { describe, expect, test } from 'vitest'

import {
  BodyKindText,
  BodyKindThought,
  BodyKindTool,
  ChatsPopulated,
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
  IdentifierCursor,
  IdentifierGrok,
  IngestLive,
  Ingested,
  LibraryPopulated,
  LiveFollowing,
  LiveIdle,
  ProjectsPopulated,
  Settings,
  Transcript,
  UpdatedFindQuery,
  breakdown,
  cmuxConversation,
  conversationById,
  conversationByIdentifier,
  debugConversation,
  filterBreakdown,
  focusedRow,
  grokConversation,
  identifierFromKindValue,
  identifierLabel,
  init,
  initialModel,
  messageBodyText,
  nextBreakdownMessageId,
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
        expect(model.conversations).toHaveLength(4)
        expect(
          conversationByIdentifier(
            model.conversations,
            IdentifierGrok({ value: 'bot:distraction-blocker' }),
          )?.title,
        ).toBe(grokConversation.title)
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

  test('breakdown is a host-agnostic TOC of every body case', () => {
    const entries = breakdown(cmuxConversation)
    expect(entries.map(entry => entry.bodyKind)).toEqual([
      BodyKindText(),
      BodyKindThought(),
      BodyKindTool(),
      BodyKindText(),
      BodyKindText(),
    ])
    expect(entries[2]?.label).toContain('bash')
    expect(filterBreakdown(entries, 'zscaler')[0]?.messageId).toBe('m-cmux-1')
  })

  test('identifier lookup does not prefer Cursor over Grok', () => {
    expect(identifierLabel(grokConversation.identifier)).toBe('via Grok')
    expect(identifierLabel(debugConversation.identifier)).toBe('via Cursor')
    expect(identifierFromKindValue('grok', 'bot:distraction-blocker')).toEqual(
      IdentifierGrok({ value: 'bot:distraction-blocker' }),
    )
    expect(
      identifierFromKindValue('cursor', '412852D2-1396-49FB-A5BE-69986474E6AD'),
    ).toEqual(
      IdentifierCursor({ value: '412852D2-1396-49FB-A5BE-69986474E6AD' }),
    )
  })

  test('open by identifier reaches the Grok transcript', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(
        ClickedOpenIdentifier({
          identifier: IdentifierGrok({ value: 'bot:distraction-blocker' }),
        }),
      ),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.screen).toEqual(
          Transcript({ conversationId: grokConversation.id }),
        )
      }),
    )
  })

  test('find and jump are session handles on the transcript', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(
        ClickedOpenConversation({ conversationId: cmuxConversation.id }),
      ),
      Story.Command.expectNone(),
      Story.message(UpdatedFindQuery({ query: 'bash' })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.findQuery).toBe('bash')
        expect(
          filterBreakdown(breakdown(cmuxConversation), model.findQuery),
        ).toHaveLength(1)
      }),
      Story.message(ClickedJumpTo({ messageId: 'm-cmux-3' })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.maybeFocusMessageId).toEqual(Option.some('m-cmux-3'))
        const row = Option.getOrThrow(focusedRow(model))
        expect(row.id).toBe('m-cmux-3')
        expect(messageBodyText(row)).toContain(
          'sandbox has no outbound network',
        )
      }),
      Story.message(ClickedGoBack()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.findQuery).toBe('')
        expect(model.maybeFocusMessageId).toEqual(Option.none())
      }),
    )
  })

  test('next breakdown step starts at the first filtered row', () => {
    const entries = filterBreakdown(breakdown(cmuxConversation), 'look in')
    expect(entries).toHaveLength(2)
    expect(nextBreakdownMessageId(entries, Option.none())).toEqual(
      Option.some('m-cmux-1'),
    )
    expect(nextBreakdownMessageId(entries, Option.some('m-cmux-1'))).toEqual(
      Option.some('m-cmux-5'),
    )
  })
})
