import {
  ClickedOpenChats,
  ClickedOpenProject,
  ProjectsPopulated,
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
  })
})
