import {
  ClickedDeleteConversation,
  ClickedFollow,
  ClickedGoBack,
  ClickedIngest,
  ClickedJumpTo,
  ClickedOpenChats,
  ClickedOpenConversation,
  ClickedOpenProject,
  ClickedOpenProjects,
  ClickedOpenSettings,
  ClickedStopFollow,
  type Conversation,
  type Message,
  type Model,
  type Project,
  type TimelineRow,
  UpdatedFindQuery,
  authorDisplayName,
  bodyKindName,
  conversationById,
  conversationsForProject,
  focusedRow,
  identifierLabel,
  lastActivityAt,
  outline,
  projectById,
  promptCount,
  sessionCount,
  snippet,
  transcriptBreakdown,
  visibilityLabel,
} from 'conversations-core-example'
import { Match as M, Option } from 'effect'
import { Document, html } from 'foldkit/html'

import { Button } from '@foldkit/ui'

const h = html<Message>()

const buttonStyle =
  'bg-zinc-800 text-zinc-100 hover:bg-zinc-700 px-3 py-2 rounded border border-zinc-600'
const primaryStyle =
  'bg-emerald-500 text-zinc-950 hover:bg-emerald-400 px-3 py-2 rounded'

const action = (label: string, message: Message, primary = false) =>
  Button.view<Message>({
    onClick: message,
    toView: attributes =>
      h.button(
        [...attributes.button, h.Class(primary ? primaryStyle : buttonStyle)],
        [label],
      ),
  })

const chrome = (body: ReadonlyArray<ReturnType<typeof h.div>>) =>
  h.div(
    [h.Class('min-h-screen bg-zinc-950 text-zinc-100 p-6 max-w-3xl mx-auto')],
    body,
  )

const nav = () =>
  h.div(
    [h.Class('flex flex-wrap gap-2 mb-6')],
    [
      action('Projects', ClickedOpenProjects()),
      action('Chats', ClickedOpenChats()),
      action('Settings', ClickedOpenSettings()),
    ],
  )

const dayLabel = (epochMs: number): string =>
  new Date(epochMs).toISOString().slice(0, 10)

const projectCard = (project: Project, conversations: Model['conversations']) =>
  h.keyed('button')(
    project.id,
    [
      h.Class(
        'w-full text-left border border-zinc-700 rounded p-3 hover:border-emerald-500',
      ),
      h.OnClick(ClickedOpenProject({ projectId: project.id })),
    ],
    [
      h.div([h.Class('font-semibold')], [project.name]),
      h.div(
        [h.Class('text-zinc-400 text-sm')],
        [
          `${sessionCount(conversations, project.id)} sessions · ${dayLabel(lastActivityAt(project, conversations))}`,
        ],
      ),
    ],
  )

const conversationCard = (conversation: Conversation) =>
  h.keyed('article')(
    conversation.id,
    [h.Class('border border-zinc-700 rounded p-3 space-y-2')],
    [
      h.button(
        [
          h.Class('w-full text-left'),
          h.OnClick(
            ClickedOpenConversation({ conversationId: conversation.id }),
          ),
        ],
        [
          h.div([h.Class('font-semibold')], [conversation.title]),
          h.div([h.Class('text-zinc-400 text-sm')], [snippet(conversation)]),
          h.div(
            [h.Class('text-zinc-500 text-sm')],
            [
              `${identifierLabel(conversation.identifier)} · ${promptCount(conversation)} prompts · ${visibilityLabel(conversation.visibility)} · ${dayLabel(conversation.updatedAt)}`,
            ],
          ),
        ],
      ),
      h.div(
        [h.Class('flex flex-wrap gap-2')],
        [
          action('Follow', ClickedFollow({ conversationId: conversation.id })),
          action(
            'Delete',
            ClickedDeleteConversation({ conversationId: conversation.id }),
          ),
        ],
      ),
    ],
  )

const bodyView = (row: TimelineRow) =>
  M.value(row.body).pipe(
    M.withReturnType<ReturnType<typeof h.div>>(),
    M.tagsExhaustive({
      BodyText: ({ content }) =>
        h.div([h.Class('whitespace-pre-wrap')], [content]),
      BodyThought: ({ content }) =>
        h.div([h.Class('text-zinc-400 italic')], [`Thinking: ${content}`]),
      BodyTool: ({ name, input, outcome }) =>
        h.div(
          [h.Class('font-mono text-sm space-y-1')],
          [
            h.div([], [`${name} ${input}`]),
            M.value(outcome).pipe(
              M.withReturnType<ReturnType<typeof h.div>>(),
              M.tagsExhaustive({
                ToolPending: () => h.div([], ['pending']),
                ToolResult: ({ output }) => h.div([], [output]),
                ToolError: ({ message }) => h.div([], [message]),
              }),
            ),
          ],
        ),
      BodyEdit: ({ path, old, next }) =>
        h.div(
          [h.Class('font-mono text-sm')],
          [`edit ${path}`, h.div([], [`- ${old}`]), h.div([], [`+ ${next}`])],
        ),
    }),
  )

const rowView = (row: TimelineRow, isFocused: boolean) =>
  h.keyed('article')(
    row.id,
    [
      h.Id(`message-${row.id}`),
      h.Class(
        isFocused
          ? 'border-l-2 border-emerald-400 bg-emerald-950/40 pl-3 space-y-1'
          : 'border-l-2 border-zinc-700 pl-3 space-y-1',
      ),
    ],
    [
      h.div(
        [h.Class('text-xs text-zinc-500')],
        [authorDisplayName(row.author)],
      ),
      bodyView(row),
    ],
  )

const followBar = (model: Model, conversationId: string) =>
  M.value(model.mode).pipe(
    M.withReturnType<ReturnType<typeof h.div>>(),
    M.tagsExhaustive({
      LiveIdle: () =>
        h.div(
          [h.Class('flex flex-wrap gap-2')],
          [action('Follow', ClickedFollow({ conversationId }), true)],
        ),
      LiveFollowing: follow =>
        h.div(
          [h.Class('flex flex-wrap gap-2 items-center')],
          [
            h.div(
              [h.Class('text-sm text-emerald-400')],
              [
                follow.conversationId === conversationId
                  ? 'following · visible within 100 ms'
                  : `following ${follow.conversationId}`,
              ],
            ),
            action('Stop follow', ClickedStopFollow()),
          ],
        ),
    }),
  )

const transcriptView = (model: Model, conversationId: string) => {
  const conversation = conversationById(model.conversations, conversationId)
  if (conversation === undefined) {
    return chrome([
      nav(),
      h.h1([h.Class('text-2xl font-semibold mb-2')], ['Missing session']),
      action('Back', ClickedGoBack()),
    ])
  }
  const project = projectById(model.projects, conversation.projectId)
  return chrome([
    nav(),
    h.h1([h.Class('text-2xl font-semibold mb-1')], [conversation.title]),
    h.p(
      [h.Class('text-zinc-400 text-sm mb-4')],
      [
        `${project?.name ?? conversation.projectId} · ${identifierLabel(conversation.identifier)} · ${visibilityLabel(conversation.visibility)}`,
      ],
    ),
    h.label(
      [h.Class('block text-sm text-zinc-400 mb-4'), h.For('find-query')],
      [
        'Find',
        h.input([
          h.Id('find-query'),
          h.Class(
            'mt-1 w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-zinc-100',
          ),
          h.Value(model.findQuery),
          h.OnInput(query => UpdatedFindQuery({ query })),
        ]),
      ],
    ),
    h.div(
      [h.Class('mb-4')],
      [
        h.h2([h.Class('text-sm uppercase text-zinc-500 mb-2')], ['Jump']),
        ...transcriptBreakdown(model).map(entry =>
          h.keyed('button')(
            entry.messageId,
            [
              h.Class(
                'block w-full text-left text-sm py-1 hover:text-emerald-400',
              ),
              h.OnClick(ClickedJumpTo({ messageId: entry.messageId })),
            ],
            [
              `${entry.index + 1}. ${bodyKindName(entry.bodyKind)} ${entry.label}`,
            ],
          ),
        ),
      ],
    ),
    ...Option.match(focusedRow(model), {
      onNone: () => [],
      onSome: row => [
        h.div(
          [h.Class('border border-emerald-500 rounded p-3 space-y-2 mb-4')],
          [
            h.h2([h.Class('text-sm uppercase text-emerald-400')], ['Focused']),
            h.div(
              [h.Class('text-xs text-zinc-500')],
              [authorDisplayName(row.author)],
            ),
            bodyView(row),
          ],
        ),
      ],
    }),
    h.div(
      [h.Class('mb-4')],
      [
        h.h2(
          [h.Class('text-sm uppercase text-zinc-500 mb-2')],
          ['On this page'],
        ),
        ...outline(conversation).map((item, index) =>
          h.div([h.Class('text-sm')], [`${index + 1}. ${item}`]),
        ),
      ],
    ),
    h.div(
      [h.Class('space-y-4 mb-6')],
      conversation.messages.map(row =>
        rowView(
          row,
          Option.getOrUndefined(model.maybeFocusMessageId) === row.id,
        ),
      ),
    ),
    followBar(model, conversationId),
    h.div(
      [h.Class('flex flex-wrap gap-2 mt-4')],
      [
        action('Ingest', ClickedIngest()),
        action('Delete', ClickedDeleteConversation({ conversationId })),
        action('Back', ClickedGoBack()),
      ],
    ),
  ])
}

export const view = (model: Model): Document => {
  const body = M.value(model.screen).pipe(
    M.withReturnType<ReturnType<typeof h.div>>(),
    M.tagsExhaustive({
      ProjectsEmpty: () =>
        chrome([
          nav(),
          h.h1([h.Class('text-2xl font-semibold mb-2')], ['Projects']),
          h.p([h.Class('text-zinc-400')], ['No projects.']),
        ]),
      ProjectsPopulated: () =>
        chrome([
          nav(),
          h.h1([h.Class('text-2xl font-semibold mb-4')], ['Projects']),
          h.div(
            [h.Class('grid gap-3')],
            model.projects.map(project =>
              projectCard(project, model.conversations),
            ),
          ),
        ]),
      ChatsEmpty: () =>
        chrome([
          nav(),
          h.h1([h.Class('text-2xl font-semibold mb-2')], ['Chats']),
          h.p([h.Class('text-zinc-400')], ['No sessions.']),
        ]),
      ChatsPopulated: () =>
        chrome([
          nav(),
          h.h1([h.Class('text-2xl font-semibold mb-4')], ['Chats']),
          h.div(
            [h.Class('grid gap-3')],
            model.conversations.map(conversation =>
              conversationCard(conversation),
            ),
          ),
        ]),
      LibraryEmpty: ({ projectId }) => {
        const project = projectById(model.projects, projectId)
        return chrome([
          nav(),
          h.h1(
            [h.Class('text-2xl font-semibold mb-2')],
            [project?.name ?? projectId],
          ),
          h.p(
            [h.Class('text-zinc-400 mb-4')],
            ['No sessions in this project.'],
          ),
          action('Back', ClickedGoBack()),
        ])
      },
      LibraryPopulated: ({ projectId }) => {
        const project = projectById(model.projects, projectId)
        return chrome([
          nav(),
          h.h1(
            [h.Class('text-2xl font-semibold mb-4')],
            [project?.name ?? projectId],
          ),
          h.div(
            [h.Class('grid gap-3')],
            conversationsForProject(model.conversations, projectId).map(
              conversation => conversationCard(conversation),
            ),
          ),
          h.div([h.Class('mt-4')], [action('Back', ClickedGoBack())]),
        ])
      },
      Transcript: ({ conversationId }) => transcriptView(model, conversationId),
      Settings: () =>
        chrome([
          nav(),
          h.h1([h.Class('text-2xl font-semibold mb-2')], ['Settings']),
          h.p(
            [h.Class('text-zinc-400 mb-4')],
            [
              'Analytics, Skills, Resume, and Billing are other domains. Follow latency ≤ 100 ms.',
            ],
          ),
          action('Back', ClickedGoBack()),
        ]),
    }),
  )

  return { title: 'Conversations', body }
}
