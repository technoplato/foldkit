<script lang="ts">
  import {
    ClickedGoBack,
    ClickedJumpTo,
    ClickedOpenChats,
    ClickedOpenConversation,
    ClickedOpenProject,
    ClickedOpenProjects,
    ClickedOpenSettings,
    UpdatedFindQuery,
    authorDisplayName,
    conversationById,
    focusedRow,
    identifierLabel,
    initialModel,
    messageBodyText,
    promptCount,
    snippet,
    transcriptBreakdown,
    type Model,
  } from 'conversations-core-example'
  import { Option } from 'effect'
  import { onDestroy, onMount } from 'svelte'

  import {
    startConversationsProcessor,
    type ConversationsProcessor,
  } from '../processor.js'

  let processor: ConversationsProcessor | undefined
  let model: Model = initialModel

  onMount(() => {
    void startConversationsProcessor().then(next => {
      processor = next
      model = next.readModel()
      next.observe(value => {
        model = value
      })
    })
  })

  onDestroy(() => {
    void processor?.shutdown()
  })

  const send = (message: Parameters<ConversationsProcessor['send']>[0]) => {
    void processor?.send(message)
  }
</script>

<main>
  <nav>
    <button onclick={() => send(ClickedOpenProjects())} type="button">Projects</button>
    <button onclick={() => send(ClickedOpenChats())} type="button">Chats</button>
    <button onclick={() => send(ClickedOpenSettings())} type="button">Settings</button>
  </nav>

  {#if model.screen._tag === 'ProjectsPopulated'}
    {#each model.projects as project (project.id)}
      <button onclick={() => send(ClickedOpenProject({ projectId: project.id }))} type="button">
        {project.name}
      </button>
    {/each}
  {:else if model.screen._tag === 'ChatsPopulated'}
    {#each model.conversations as conversation (conversation.id)}
      <button
        onclick={() => send(ClickedOpenConversation({ conversationId: conversation.id }))}
        type="button"
      >
        {conversation.title} · {identifierLabel(conversation.identifier)} ·
        {promptCount(conversation)} prompts
        <small>{snippet(conversation)}</small>
      </button>
    {/each}
  {:else if model.screen._tag === 'Transcript'}
    {@const conversation = conversationById(model.conversations, model.screen.conversationId)}
    {@const focused = Option.getOrUndefined(focusedRow(model))}
    {#if conversation}
      <h1>{conversation.title}</h1>
      <p>{identifierLabel(conversation.identifier)}</p>
      <input
        oninput={event =>
          send(UpdatedFindQuery({ query: event.currentTarget.value }))}
        value={model.findQuery}
      />
      {#each transcriptBreakdown(model) as entry (entry.messageId)}
        <button onclick={() => send(ClickedJumpTo({ messageId: entry.messageId }))} type="button">
          {entry.label}
        </button>
      {/each}
      {#if focused}
        <article>
          <h2>Focused</h2>
          <div>{authorDisplayName(focused.author)}</div>
          <pre>{messageBodyText(focused)}</pre>
        </article>
      {/if}
      {#each conversation.messages as row (row.id)}
        <article id={`message-${row.id}`}>
          <div>{authorDisplayName(row.author)}</div>
          <pre>{messageBodyText(row)}</pre>
        </article>
      {/each}
      <button onclick={() => send(ClickedGoBack())} type="button">Back</button>
    {/if}
  {:else if model.screen._tag === 'Settings'}
    <p>Host chrome. Analytics / Skills / Resume / Billing are other domains.</p>
    <button onclick={() => send(ClickedGoBack())} type="button">Back</button>
  {:else}
    <p>{model.screen._tag}</p>
    <button onclick={() => send(ClickedGoBack())} type="button">Back</button>
  {/if}
</main>
