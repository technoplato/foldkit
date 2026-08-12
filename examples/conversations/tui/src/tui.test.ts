import {
  ClickedOpenChats,
  ClickedOpenProject,
  ClickedOpenSettings,
  initialModel,
  scribeProject,
} from 'conversations-core-example'
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { messageForInput, renderConversationsScreen } from './host.js'

describe('Conversations TUI', () => {
  it('renders the imported projects list and every interactive control', () => {
    const screen = renderConversationsScreen(initialModel)

    expect(screen).toContain('scribe')
    expect(screen).toContain('laptop')
    expect(screen).toContain('[P] projects')
    expect(screen).toContain('[Q] quit')
  })

  it('maps controls to the imported Message constructors', () => {
    expect(messageForInput(initialModel, '1')).toEqual(
      Option.some(ClickedOpenProject({ projectId: scribeProject.id })),
    )
    expect(messageForInput(initialModel, 'c')).toEqual(
      Option.some(ClickedOpenChats()),
    )
    expect(messageForInput(initialModel, 's')).toEqual(
      Option.some(ClickedOpenSettings()),
    )
    expect(messageForInput(initialModel, 'q')).toEqual(Option.none())
  })
})
