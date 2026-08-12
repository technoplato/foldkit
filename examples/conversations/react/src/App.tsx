import {
  type Conversation,
  type Model,
  conversationById,
  conversationsForProject,
  identifierLabel,
  lastActivityAt,
  outline,
  projectById,
  promptCount,
  sessionCount,
  snippet,
  visibilityLabel,
} from 'conversations-core-example'
import {
  ConversationsProvider,
  useConversationsActions,
  useConversationsModel,
  useConversationsReplay,
} from 'conversations-react-bindings-example'
import { Match as M } from 'effect'
import type { ReactNode } from 'react'

export const App = () => (
  <ConversationsProvider>
    <ConversationsScreen />
  </ConversationsProvider>
)

const ConversationsScreen = () => {
  const model = useConversationsModel()
  const actions = useConversationsActions()
  const replay = useConversationsReplay()

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <nav className="flex flex-wrap gap-2">
          <button
            className={buttonClassName}
            onClick={actions.clickedOpenProjects}
            type="button"
          >
            Projects
          </button>
          <button
            className={buttonClassName}
            onClick={actions.clickedOpenChats}
            type="button"
          >
            Chats
          </button>
          <button
            className={buttonClassName}
            onClick={actions.clickedOpenSettings}
            type="button"
          >
            Settings
          </button>
        </nav>
        {screenView(model, actions)}
        <section className="space-y-3 border border-zinc-800 p-4 text-left">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{replay.mode}</span>
            <span className="tabular-nums text-zinc-500">
              Frame {replay.frame} of {replay.finalFrame}
            </span>
          </div>
          <input
            aria-label="Replay frame"
            className="w-full accent-emerald-500"
            max={replay.finalFrame}
            min={0}
            onChange={event => replay.seek(Number(event.currentTarget.value))}
            type="range"
            value={replay.frame}
          />
        </section>
      </div>
    </main>
  )
}

type Actions = ReturnType<typeof useConversationsActions>

const screenView = (model: Model, actions: Actions) =>
  M.value(model.screen).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      ProjectsEmpty: () => <p>No projects.</p>,
      ProjectsPopulated: () => (
        <section className="space-y-3">
          <h1 className="text-2xl font-semibold">Projects</h1>
          {model.projects.map(project => (
            <button
              className={cardClassName}
              key={project.id}
              onClick={() => actions.clickedOpenProject(project.id)}
              type="button"
            >
              <div className="font-semibold">{project.name}</div>
              <div className="text-sm text-zinc-400">
                {sessionCount(model.conversations, project.id)} sessions ·{' '}
                {new Date(lastActivityAt(project, model.conversations))
                  .toISOString()
                  .slice(0, 10)}
              </div>
            </button>
          ))}
        </section>
      ),
      ChatsEmpty: () => <p>No sessions.</p>,
      ChatsPopulated: () => (
        <section className="space-y-3">
          <h1 className="text-2xl font-semibold">Chats</h1>
          {model.conversations.map(conversation =>
            conversationCard(conversation, actions),
          )}
        </section>
      ),
      LibraryEmpty: ({ projectId }) => (
        <section className="space-y-3">
          <h1 className="text-2xl font-semibold">
            {projectById(model.projects, projectId)?.name ?? projectId}
          </h1>
          <p>No sessions in this project.</p>
          <button
            className={buttonClassName}
            onClick={actions.clickedGoBack}
            type="button"
          >
            Back
          </button>
        </section>
      ),
      LibraryPopulated: ({ projectId }) => (
        <section className="space-y-3">
          <h1 className="text-2xl font-semibold">
            {projectById(model.projects, projectId)?.name ?? projectId}
          </h1>
          {conversationsForProject(model.conversations, projectId).map(
            conversation => conversationCard(conversation, actions),
          )}
          <button
            className={buttonClassName}
            onClick={actions.clickedGoBack}
            type="button"
          >
            Back
          </button>
        </section>
      ),
      Transcript: ({ conversationId }) =>
        transcriptView(model, conversationId, actions),
      Settings: () => (
        <section className="space-y-3">
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-zinc-400">
            Analytics, Skills, Resume, and Billing are other domains. Follow
            latency ≤ 100 ms.
          </p>
          <button
            className={buttonClassName}
            onClick={actions.clickedGoBack}
            type="button"
          >
            Back
          </button>
        </section>
      ),
    }),
  )

const conversationCard = (conversation: Conversation, actions: Actions) => (
  <article
    className="space-y-2 border border-zinc-700 rounded p-3"
    key={conversation.id}
  >
    <button
      className="w-full text-left"
      onClick={() => actions.clickedOpenConversation(conversation.id)}
      type="button"
    >
      <div className="font-semibold">{conversation.title}</div>
      <div className="text-sm text-zinc-400">{snippet(conversation)}</div>
      <div className="text-sm text-zinc-500">
        {identifierLabel(conversation.identifier)} · {promptCount(conversation)}{' '}
        prompts · {visibilityLabel(conversation.visibility)}
      </div>
    </button>
    <div className="flex gap-2">
      <button
        className={buttonClassName}
        onClick={() => actions.clickedFollow(conversation.id)}
        type="button"
      >
        Follow
      </button>
      <button
        className={buttonClassName}
        onClick={() => actions.clickedDeleteConversation(conversation.id)}
        type="button"
      >
        Delete
      </button>
    </div>
  </article>
)

const transcriptView = (
  model: Model,
  conversationId: string,
  actions: Actions,
) => {
  const conversation = conversationById(model.conversations, conversationId)
  if (conversation === undefined) {
    return <p>Missing session</p>
  }
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">{conversation.title}</h1>
      <p className="text-sm text-zinc-400">
        {identifierLabel(conversation.identifier)} ·{' '}
        {visibilityLabel(conversation.visibility)}
      </p>
      <div>
        <h2 className="text-sm uppercase text-zinc-500 mb-2">On this page</h2>
        {outline(conversation).map((item, index) => (
          <div className="text-sm" key={item}>
            {index + 1}. {item}
          </div>
        ))}
      </div>
      {conversation.messages.map(row => (
        <article className="border-l-2 border-zinc-700 pl-3" key={row.id}>
          {row.body._tag === 'BodyText' ? row.body.content : row.body._tag}
        </article>
      ))}
      <div className="flex flex-wrap gap-2">
        {model.mode._tag === 'LiveFollowing' ? (
          <button
            className={buttonClassName}
            onClick={actions.clickedStopFollow}
            type="button"
          >
            Stop follow
          </button>
        ) : (
          <button
            className={buttonClassName}
            onClick={() => actions.clickedFollow(conversationId)}
            type="button"
          >
            Follow
          </button>
        )}
        <button
          className={buttonClassName}
          onClick={actions.clickedIngest}
          type="button"
        >
          Ingest
        </button>
        <button
          className={buttonClassName}
          onClick={actions.clickedGoBack}
          type="button"
        >
          Back
        </button>
      </div>
    </section>
  )
}

const buttonClassName =
  'bg-zinc-800 text-zinc-100 hover:bg-zinc-700 px-3 py-2 rounded border border-zinc-600'
const cardClassName =
  'w-full text-left border border-zinc-700 rounded p-3 hover:border-emerald-500'
