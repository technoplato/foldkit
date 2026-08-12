import { Array, Match as M, Option, Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

/** Host ingest latency the live-follow contract must beat. */
export const liveIngestDelayMs = 100

/** How a host names this session. */
export const IdentifierCursor = ts('IdentifierCursor', { value: S.String })
export const IdentifierSpecstory = ts('IdentifierSpecstory', {
  value: S.String,
})
export const IdentifierClaudeCode = ts('IdentifierClaudeCode', {
  value: S.String,
})
export const IdentifierCodex = ts('IdentifierCodex', { value: S.String })
export const IdentifierCopilot = ts('IdentifierCopilot', { value: S.String })
export const IdentifierGemini = ts('IdentifierGemini', { value: S.String })
export const IdentifierWindsurf = ts('IdentifierWindsurf', { value: S.String })
export const IdentifierDeepseek = ts('IdentifierDeepseek', { value: S.String })
export const IdentifierFactory = ts('IdentifierFactory', { value: S.String })
export const IdentifierDroid = ts('IdentifierDroid', { value: S.String })
export const IdentifierLocal = ts('IdentifierLocal')
export const Identifier = S.Union([
  IdentifierCursor,
  IdentifierSpecstory,
  IdentifierClaudeCode,
  IdentifierCodex,
  IdentifierCopilot,
  IdentifierGemini,
  IdentifierWindsurf,
  IdentifierDeepseek,
  IdentifierFactory,
  IdentifierDroid,
  IdentifierLocal,
])
export type Identifier = typeof Identifier.Type

/** Who may read this session. */
export const VisibilityPrivate = ts('VisibilityPrivate')
export const VisibilityShared = ts('VisibilityShared')
export const Visibility = S.Union([VisibilityPrivate, VisibilityShared])
export type Visibility = typeof Visibility.Type

/** Who produced a timeline row. */
export const AuthorHuman = ts('AuthorHuman', {
  id: S.String,
  name: S.String,
})
export const AuthorAgent = ts('AuthorAgent', {
  id: S.String,
  name: S.String,
  model: S.String,
})
export const AuthorSystem = ts('AuthorSystem', {
  id: S.String,
  name: S.String,
})
export const Author = S.Union([AuthorHuman, AuthorAgent, AuthorSystem])
export type Author = typeof Author.Type

/** Exclusive result of a tool call nested on a tool body. */
export const ToolPending = ts('ToolPending')
export const ToolResult = ts('ToolResult', { output: S.String })
export const ToolError = ts('ToolError', { message: S.String })
export const ToolOutcome = S.Union([ToolPending, ToolResult, ToolError])
export type ToolOutcome = typeof ToolOutcome.Type

/** Exclusive payload of one timeline row. */
export const BodyText = ts('BodyText', {
  content: S.String,
  isFinal: S.Boolean,
})
export const BodyThought = ts('BodyThought', { content: S.String })
export const BodyTool = ts('BodyTool', {
  name: S.String,
  input: S.String,
  outcome: ToolOutcome,
})
export const BodyEdit = ts('BodyEdit', {
  path: S.String,
  old: S.String,
  next: S.String,
})
export const Body = S.Union([BodyText, BodyThought, BodyTool, BodyEdit])
export type Body = typeof Body.Type

/** Wall and relative times for one row. Epoch ms in this Program. */
export const Times = S.Struct({
  wall: S.Struct({
    start: S.Number,
    end: S.Number,
  }),
  relative: S.Struct({
    start: S.Number,
    end: S.Number,
  }),
})
export type Times = typeof Times.Type

/** One ordered timeline row. Nested here; Instant keeps own types. */
export const TimelineRow = S.Struct({
  id: S.String,
  index: S.Number,
  times: Times,
  author: Author,
  body: Body,
})
export type TimelineRow = typeof TimelineRow.Type

/** One recorded human–agent session. */
export const Conversation = S.Struct({
  id: S.String,
  projectId: S.String,
  identifier: Identifier,
  visibility: Visibility,
  title: S.String,
  createdAt: S.Number,
  updatedAt: S.Number,
  finishedAt: S.Option(S.Number),
  messages: S.Array(TimelineRow),
})
export type Conversation = typeof Conversation.Type

/** A named bag of conversations. */
export const Project = S.Struct({
  id: S.String,
  name: S.String,
  createdAt: S.Number,
  updatedAt: S.Number,
})
export type Project = typeof Project.Type

export const ProjectsEmpty = ts('ProjectsEmpty')
export const ProjectsPopulated = ts('ProjectsPopulated')
export const ChatsEmpty = ts('ChatsEmpty')
export const ChatsPopulated = ts('ChatsPopulated')
export const LibraryEmpty = ts('LibraryEmpty', { projectId: S.String })
export const LibraryPopulated = ts('LibraryPopulated', {
  projectId: S.String,
})
export const Transcript = ts('Transcript', { conversationId: S.String })
export const Settings = ts('Settings')
export const Screen = S.Union([
  ProjectsEmpty,
  ProjectsPopulated,
  ChatsEmpty,
  ChatsPopulated,
  LibraryEmpty,
  LibraryPopulated,
  Transcript,
  Settings,
])
export type Screen = typeof Screen.Type

export const LiveIdle = ts('LiveIdle')
export const LiveFollowing = ts('LiveFollowing', {
  conversationId: S.String,
})
export const Mode = S.Union([LiveIdle, LiveFollowing])
export type Mode = typeof Mode.Type

export const Model = S.Struct({
  screen: Screen,
  mode: Mode,
  history: S.Array(Screen),
  projects: S.Array(Project),
  conversations: S.Array(Conversation),
})
export type Model = typeof Model.Type

const july28 = Date.UTC(2026, 6, 28, 13, 0, 0)
const july29 = Date.UTC(2026, 6, 29, 13, 38, 0)
const june29 = Date.UTC(2026, 5, 29, 9, 38, 0)
const mar18 = Date.UTC(2026, 2, 18, 12, 0, 0)

const timesAt = (origin: number, startOffsetMs: number, endOffsetMs: number) =>
  Times.make({
    wall: { start: origin + startOffsetMs, end: origin + endOffsetMs },
    relative: { start: startOffsetMs, end: endOffsetMs },
  })

export const scribeProject: Project = Project.make({
  id: 'p-scribe',
  name: 'scribe',
  createdAt: Date.UTC(2026, 5, 1),
  updatedAt: july29,
})

export const laptopProject: Project = Project.make({
  id: 'p-laptop',
  name: 'laptop',
  createdAt: Date.UTC(2026, 2, 1),
  updatedAt: mar18,
})

export const cmuxConversation: Conversation = Conversation.make({
  id: 'c-cmux',
  projectId: scribeProject.id,
  identifier: IdentifierCodex({ value: 'cmux-tab-test' }),
  visibility: VisibilityPrivate(),
  title: 'CMUX Tab Test',
  createdAt: july28,
  updatedAt: july29,
  finishedAt: Option.none(),
  messages: [
    TimelineRow.make({
      id: 'm-cmux-1',
      index: 0,
      times: timesAt(july28, 0, 4_000),
      author: AuthorHuman({ id: 'human-michael', name: 'Michael' }),
      body: BodyText({
        content:
          'look in development/tools/zscaler to see if you can resolve that!',
        isFinal: true,
      }),
    }),
    TimelineRow.make({
      id: 'm-cmux-2',
      index: 1,
      times: timesAt(july28, 4_000, 8_000),
      author: AuthorAgent({
        id: 'agent-opus',
        name: 'Agent',
        model: 'claude-opus-4-0',
      }),
      body: BodyThought({
        content: 'DNS resolution looks more likely than an SSL/Zscaler issue.',
      }),
    }),
    TimelineRow.make({
      id: 'm-cmux-3',
      index: 2,
      times: timesAt(july28, 8_000, 12_000),
      author: AuthorAgent({
        id: 'agent-opus',
        name: 'Agent',
        model: 'claude-opus-4-0',
      }),
      body: BodyTool({
        name: 'bash',
        input: 'curl -fsSL https://claude.ai/install.sh | bash',
        outcome: ToolResult({ output: 'sandbox has no outbound network' }),
      }),
    }),
    TimelineRow.make({
      id: 'm-cmux-4',
      index: 3,
      times: timesAt(july28, 12_000, 12_500),
      author: AuthorSystem({ id: 'system-host', name: 'System' }),
      body: BodyText({
        content: '[Request interrupted by user]',
        isFinal: true,
      }),
    }),
    TimelineRow.make({
      id: 'm-cmux-5',
      index: 4,
      times: timesAt(july28, 20_000, 24_000),
      author: AuthorHuman({ id: 'human-michael', name: 'Michael' }),
      body: BodyText({
        content:
          'look in recent cloud sessions i was working on a distraction blocker',
        isFinal: true,
      }),
    }),
  ],
})

export const debugConversation: Conversation = Conversation.make({
  id: 'c-debug',
  projectId: scribeProject.id,
  identifier: IdentifierCursor({
    value: '412852D2-1396-49FB-A5BE-69986474E6AD',
  }),
  visibility: VisibilityPrivate(),
  title: 'Debugging Scribe App on Apple Ecosystem',
  createdAt: june29,
  updatedAt: june29,
  finishedAt: Option.some(june29 + 3_600_000),
  messages: [
    TimelineRow.make({
      id: 'm-debug-1',
      index: 0,
      times: timesAt(june29, 0, 4_000),
      author: AuthorHuman({ id: 'human-michael', name: 'Michael' }),
      body: BodyText({
        content:
          'Good morning, scribe. I just want to check to see if we are working.',
        isFinal: true,
      }),
    }),
    TimelineRow.make({
      id: 'm-debug-2',
      index: 1,
      times: timesAt(june29, 4_000, 20_000),
      author: AuthorAgent({
        id: 'agent-gpt',
        name: 'Agent',
        model: 'gpt-5.2',
      }),
      body: BodyText({
        content:
          'Locate recording 412852D2, install the newest clean revision, add an all-device deploy script.',
        isFinal: true,
      }),
    }),
    TimelineRow.make({
      id: 'm-debug-3',
      index: 2,
      times: timesAt(june29, 20_000, 22_000),
      author: AuthorAgent({
        id: 'agent-gpt',
        name: 'Agent',
        model: 'gpt-5.2',
      }),
      body: BodyEdit({
        path: 'scripts/deploy-all-devices.sh',
        old: '',
        next: '#!/bin/sh\necho deploy',
      }),
    }),
  ],
})

export const notesConversation: Conversation = Conversation.make({
  id: 'c-notes',
  projectId: laptopProject.id,
  identifier: IdentifierLocal(),
  visibility: VisibilityShared(),
  title: 'Notes',
  createdAt: mar18,
  updatedAt: mar18,
  finishedAt: Option.some(mar18 + 60_000),
  messages: [
    TimelineRow.make({
      id: 'm-notes-1',
      index: 0,
      times: timesAt(mar18, 0, 2_000),
      author: AuthorHuman({ id: 'human-michael', name: 'Michael' }),
      body: BodyText({
        content: 'Capture the laptop session list.',
        isFinal: true,
      }),
    }),
  ],
})

export const initialModel: Model = Model.make({
  screen: ProjectsPopulated(),
  mode: LiveIdle(),
  history: [],
  projects: [scribeProject, laptopProject],
  conversations: [cmuxConversation, debugConversation, notesConversation],
})

export const projectById = (
  projects: ReadonlyArray<Project>,
  projectId: string,
): Project | undefined => projects.find(project => project.id === projectId)

export const conversationById = (
  conversations: ReadonlyArray<Conversation>,
  conversationId: string,
): Conversation | undefined =>
  conversations.find(conversation => conversation.id === conversationId)

export const conversationsForProject = (
  conversations: ReadonlyArray<Conversation>,
  projectId: string,
): ReadonlyArray<Conversation> =>
  conversations.filter(conversation => conversation.projectId === projectId)

export const promptCount = (conversation: Conversation): number =>
  conversation.messages.filter(
    row => row.author._tag === 'AuthorHuman' && row.body._tag === 'BodyText',
  ).length

export const snippet = (conversation: Conversation): string => {
  const first = conversation.messages.find(
    row => row.author._tag === 'AuthorHuman' && row.body._tag === 'BodyText',
  )
  if (first === undefined || first.body._tag !== 'BodyText') {
    return ''
  }
  return first.body.content
}

export const outline = (conversation: Conversation): ReadonlyArray<string> =>
  conversation.messages.flatMap(row =>
    row.author._tag === 'AuthorHuman' && row.body._tag === 'BodyText'
      ? [row.body.content]
      : [],
  )

export const sessionCount = (
  conversations: ReadonlyArray<Conversation>,
  projectId: string,
): number => conversationsForProject(conversations, projectId).length

export const lastActivityAt = (
  project: Project,
  conversations: ReadonlyArray<Conversation>,
): number => {
  const times = conversationsForProject(conversations, project.id).map(
    conversation => conversation.updatedAt,
  )
  if (times.length === 0) {
    return project.updatedAt
  }
  return Math.max(...times)
}

export const identifierLabel = (identifier: Identifier): string =>
  M.value(identifier).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      IdentifierCursor: () => 'via Cursor',
      IdentifierSpecstory: () => 'via SpecStory',
      IdentifierClaudeCode: () => 'via Claude Code',
      IdentifierCodex: () => 'via Codex CLI',
      IdentifierCopilot: () => 'via Copilot',
      IdentifierGemini: () => 'via Gemini',
      IdentifierWindsurf: () => 'via Windsurf',
      IdentifierDeepseek: () => 'via DeepSeek',
      IdentifierFactory: () => 'via Factory',
      IdentifierDroid: () => 'via Droid',
      IdentifierLocal: () => 'local',
    }),
  )

export const visibilityLabel = (visibility: Visibility): string =>
  visibility._tag === 'VisibilityPrivate' ? 'Private' : 'Shared'

export const projectsScreen = (projects: ReadonlyArray<Project>): Screen =>
  projects.length === 0 ? ProjectsEmpty() : ProjectsPopulated()

export const chatsScreen = (
  conversations: ReadonlyArray<Conversation>,
): Screen => (conversations.length === 0 ? ChatsEmpty() : ChatsPopulated())

export const libraryScreen = (
  projectId: string,
  conversations: ReadonlyArray<Conversation>,
): Screen =>
  conversationsForProject(conversations, projectId).length === 0
    ? LibraryEmpty({ projectId })
    : LibraryPopulated({ projectId })

export const canonicalize = (
  screen: Screen,
  conversations: ReadonlyArray<Conversation>,
  projects: ReadonlyArray<Project>,
): Screen =>
  M.value(screen).pipe(
    M.withReturnType<Screen>(),
    M.tagsExhaustive({
      ProjectsEmpty: () => projectsScreen(projects),
      ProjectsPopulated: () => projectsScreen(projects),
      ChatsEmpty: () => chatsScreen(conversations),
      ChatsPopulated: () => chatsScreen(conversations),
      LibraryEmpty: ({ projectId }) => libraryScreen(projectId, conversations),
      LibraryPopulated: ({ projectId }) =>
        libraryScreen(projectId, conversations),
      Transcript: transcript => transcript,
      Settings: () => Settings(),
    }),
  )

export const appendIngestedRow = (
  conversation: Conversation,
  now: number,
): Conversation => {
  const last = conversation.messages.at(-1)
  const nextIndex = last === undefined ? 0 : last.index + 1
  const origin = conversation.createdAt
  const row = TimelineRow.make({
    id: `m-ingest-${conversation.id}-${nextIndex}`,
    index: nextIndex,
    times: timesAt(origin, now - origin, now - origin + 1),
    author: AuthorSystem({ id: 'system-host', name: 'System' }),
    body: BodyText({ content: 'live ingest', isFinal: true }),
  })
  return Conversation.make({
    ...conversation,
    updatedAt: now,
    messages: Array.append(conversation.messages, row),
  })
}
