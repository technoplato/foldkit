import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { replayPresentationClients } from './presentationClients.js'

describe('Cardboard replay presentation Clients', () => {
  it('wraps one portable replay path for web, mobile, and terminal hosts', () => {
    const portableReplayPath = '/0/replay?tape=encoded&frame=2'
    const clients = replayPresentationClients(portableReplayPath)

    expect(Array.map(clients, client => client._tag)).toStrictEqual([
      'WebReplayClient',
      'WebReplayClient',
      'MobileReplayClient',
      'TerminalReplayClient',
      'UnavailableReplayClient',
    ])

    const mobileClient = Option.getOrThrow(
      Array.findFirst(clients, client => client._tag === 'MobileReplayClient'),
    )
    if (mobileClient._tag !== 'MobileReplayClient') {
      throw new Error('Expected the Expo mobile replay Client')
    }
    expect(mobileClient.deepLink).toBe(
      `foldkit://showcase${portableReplayPath}`,
    )

    const terminalClient = Option.getOrThrow(
      Array.findFirst(
        clients,
        client => client._tag === 'TerminalReplayClient',
      ),
    )
    if (terminalClient._tag !== 'TerminalReplayClient') {
      throw new Error('Expected the Effect TUI replay Client')
    }
    expect(terminalClient.command).toBe(
      `pnpm demo:cardboard:tui -- '${portableReplayPath}'`,
    )
  })
})
