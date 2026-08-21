import {
  ClickedJumpTo,
  ClickedOpenChats,
  ClickedOpenIdentifier,
  ClickedOpenProject,
  IdentifierGrok,
  ProjectsPopulated,
  Transcript,
  UpdatedFindQuery,
  grokConversation,
  scribeProject,
} from 'conversations-core-example'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import { describeScreen, executeConversationsInput } from './host.js'

describe('Conversations CLI host', () => {
  it('shows the imported projects list without a Message', async () => {
    const execution = await Effect.runPromise(executeConversationsInput([]))

    expect(execution.messages).toEqual([])
    expect(execution.finalModel.screen).toEqual(ProjectsPopulated())
    expect(describeScreen(execution.finalModel)).toContain('scribe')
  })

  it('opens a project through the imported Message constructor', async () => {
    const execution = await Effect.runPromise(
      executeConversationsInput([`project:${scribeProject.id}`]),
    )

    expect(execution.messages).toEqual([
      ClickedOpenProject({ projectId: scribeProject.id }),
    ])
    expect(describeScreen(execution.finalModel)).toContain('CMUX Tab Test')
  })

  it('opens chats', async () => {
    const execution = await Effect.runPromise(
      executeConversationsInput(['chats']),
    )

    expect(execution.messages).toEqual([ClickedOpenChats()])
    expect(describeScreen(execution.finalModel)).toContain('Notes')
    expect(describeScreen(execution.finalModel)).toContain('via Grok')
  })

  it('opens a Grok session by identifier, not by Cursor id', async () => {
    const execution = await Effect.runPromise(
      executeConversationsInput(['identifier:grok:bot:distraction-blocker']),
    )

    expect(execution.messages).toEqual([
      ClickedOpenIdentifier({
        identifier: IdentifierGrok({ value: 'bot:distraction-blocker' }),
      }),
    ])
    expect(execution.finalModel.screen).toEqual(
      Transcript({ conversationId: grokConversation.id }),
    )
    expect(describeScreen(execution.finalModel)).toContain(
      'Distraction blocker',
    )
  })

  it('finds and jumps on the transcript through Program Messages', async () => {
    const execution = await Effect.runPromise(
      executeConversationsInput(['open:c-cmux', 'find:bash', 'next']),
    )

    expect(execution.messages).toEqual([
      expect.objectContaining({ _tag: 'ClickedOpenConversation' }),
      UpdatedFindQuery({ query: 'bash' }),
      ClickedJumpTo({ messageId: 'm-cmux-3' }),
    ])
    expect(describeScreen(execution.finalModel)).toContain('find bash')
    expect(describeScreen(execution.finalModel)).toContain('focus m-cmux-3')
    expect(describeScreen(execution.finalModel)).toContain(
      'sandbox has no outbound network',
    )
  })
})
