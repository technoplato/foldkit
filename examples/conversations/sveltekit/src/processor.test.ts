import {
  ClickedOpenIdentifier,
  IdentifierGrok,
  Transcript,
  grokConversation,
} from 'conversations-core-example'
import { describe, expect, it } from 'vitest'

import { startConversationsProcessor } from './processor.js'

describe('Conversations SvelteKit processor', () => {
  it('opens a Grok session through the shared Program', async () => {
    const processor = await startConversationsProcessor()
    const model = await processor.send(
      ClickedOpenIdentifier({
        identifier: IdentifierGrok({ value: 'bot:distraction-blocker' }),
      }),
    )
    expect(model.screen).toEqual(
      Transcript({ conversationId: grokConversation.id }),
    )
    await processor.shutdown()
  })
})
