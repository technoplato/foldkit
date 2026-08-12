import { LibraryPopulated, scribeProject } from 'conversations-core-example'
import { type ReactNode, StrictMode } from 'react'
import { describe, expect, it } from 'vitest'

import { act, renderHook } from '@testing-library/react'

import {
  ConversationsProvider,
  useConversationsActions,
  useConversationsModel,
} from './index.js'

const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
  <StrictMode>
    <ConversationsProvider>{children}</ConversationsProvider>
  </StrictMode>
)

describe('Conversations React bindings', () => {
  it('observes the shared Model and opens a project', () => {
    const { result } = renderHook(
      () => ({
        actions: useConversationsActions(),
        model: useConversationsModel(),
      }),
      { wrapper },
    )

    const actions = result.current.actions
    expect(result.current.model.screen._tag).toBe('ProjectsPopulated')

    act(() => {
      result.current.actions.clickedOpenProject(scribeProject.id)
    })
    expect(result.current.model.screen).toEqual(
      LibraryPopulated({ projectId: scribeProject.id }),
    )
    expect(result.current.actions).toBe(actions)
  })
})
