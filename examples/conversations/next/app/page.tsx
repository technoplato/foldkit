'use client'

import {
  type TimelineRow,
  authorDisplayName,
  conversationById,
  conversationsForProject,
  focusedRow,
  identifierLabel,
  messageBodyText,
  promptCount,
  snippet,
  transcriptBreakdown,
} from 'conversations-core-example'
import {
  ConversationsProvider,
  useConversationsActions,
  useConversationsModel,
} from 'conversations-react-bindings-example'
import { Match as M, Option } from 'effect'
import type { ReactNode } from 'react'

const Page = () => (
  <ConversationsProvider>
    <ConversationsApp />
  </ConversationsProvider>
)

const ConversationsApp = () => {
  const actions = useConversationsActions()
  const screenTag = useConversationsModel({
    selector: model => model.screen._tag,
  })
  const model = useConversationsModel()

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <nav className="flex flex-wrap gap-2">
        <button onClick={actions.clickedOpenProjects} type="button">
          Projects
        </button>
        <button onClick={actions.clickedOpenChats} type="button">
          Chats
        </button>
        <button onClick={actions.clickedOpenSettings} type="button">
          Settings
        </button>
      </nav>
      <p className="text-sm text-zinc-500">{screenTag}</p>
      {M.value(model.screen).pipe(
        M.withReturnType<ReactNode>(),
        M.tagsExhaustive({
          ProjectsEmpty: () => <p>No projects.</p>,
          ProjectsPopulated: () => (
            <section className="space-y-2">
              {model.projects.map(project => (
                <button
                  key={project.id}
                  onClick={() => actions.clickedOpenProject(project.id)}
                  type="button"
                >
                  {project.name}
                </button>
              ))}
            </section>
          ),
          ChatsEmpty: () => <p>No sessions.</p>,
          ChatsPopulated: () => (
            <section className="space-y-2">
              {model.conversations.map(conversation => (
                <button
                  key={conversation.id}
                  onClick={() =>
                    actions.clickedOpenConversation(conversation.id)
                  }
                  type="button"
                >
                  {conversation.title} ·{' '}
                  {identifierLabel(conversation.identifier)} ·{' '}
                  {promptCount(conversation)} prompts
                  <span className="block text-sm text-zinc-400">
                    {snippet(conversation)}
                  </span>
                </button>
              ))}
            </section>
          ),
          LibraryEmpty: ({ projectId }) => (
            <section>
              <p>No sessions in {projectId}.</p>
              <button onClick={actions.clickedGoBack} type="button">
                Back
              </button>
            </section>
          ),
          LibraryPopulated: ({ projectId }) => (
            <section className="space-y-2">
              {conversationsForProject(model.conversations, projectId).map(
                conversation => (
                  <button
                    key={conversation.id}
                    onClick={() =>
                      actions.clickedOpenConversation(conversation.id)
                    }
                    type="button"
                  >
                    {conversation.title}
                  </button>
                ),
              )}
              <button onClick={actions.clickedGoBack} type="button">
                Back
              </button>
            </section>
          ),
          Transcript: ({ conversationId }) => {
            const conversation = conversationById(
              model.conversations,
              conversationId,
            )
            if (conversation === undefined) {
              return <p>Missing session</p>
            }
            const maybeFocused = focusedRow(model)
            return (
              <section className="space-y-3">
                <h1>{conversation.title}</h1>
                <p>{identifierLabel(conversation.identifier)}</p>
                <input
                  onChange={event =>
                    actions.updatedFindQuery(event.currentTarget.value)
                  }
                  value={model.findQuery}
                />
                {transcriptBreakdown(model).map(entry => (
                  <button
                    key={entry.messageId}
                    onClick={() => actions.clickedJumpTo(entry.messageId)}
                    type="button"
                  >
                    {entry.label}
                  </button>
                ))}
                {Option.match(maybeFocused, {
                  onNone: () => null,
                  onSome: row => (
                    <article>
                      <h2>Focused</h2>
                      <TimelineRowView row={row} />
                    </article>
                  ),
                })}
                {conversation.messages.map(row => (
                  <TimelineRowView key={row.id} row={row} withAnchor />
                ))}
                <button onClick={actions.clickedGoBack} type="button">
                  Back
                </button>
              </section>
            )
          },
          Settings: () => (
            <section>
              <p>
                Host chrome. Analytics / Skills / Resume / Billing are other
                domains.
              </p>
              <button onClick={actions.clickedGoBack} type="button">
                Back
              </button>
            </section>
          ),
        }),
      )}
    </main>
  )
}

const TimelineRowView = ({
  row,
  withAnchor = false,
}: Readonly<{ row: TimelineRow; withAnchor?: boolean }>) => (
  <article id={withAnchor ? `message-${row.id}` : undefined}>
    <div>{authorDisplayName(row.author)}</div>
    <pre>{messageBodyText(row)}</pre>
  </article>
)

export default Page
