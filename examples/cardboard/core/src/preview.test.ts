import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import { cardboardPreview } from './preview.js'
import { CardboardRouter } from './route.js'

describe('Cardboard preview', () => {
  it('projects exact sequence content and its canonical portable route', async () => {
    const route = await Effect.runPromise(CardboardRouter.parse('/0/69'))

    expect(route._tag).toBe('State')
    if (route._tag === 'State') {
      expect(cardboardPreview(route.model)).toStrictEqual({
        _tag: 'CardboardPreview',
        content: '69',
        description: 'Cardboard 69. Next.',
        portableRoute: '/0/69',
        title: '69 | Project Cardboard',
      })
    }
  })

  it('preserves very large sequence values without numeric coercion', async () => {
    const content =
      '999999999999999999999999999999999999999999999999999999999999'
    const route = await Effect.runPromise(
      CardboardRouter.parse(`/0/${content}`),
    )

    expect(route._tag).toBe('State')
    if (route._tag === 'State') {
      expect(cardboardPreview(route.model).content).toBe(content)
    }
  })

  it('describes supplementary material without a web carrier', async () => {
    const route = await Effect.runPromise(CardboardRouter.parse('/0/extra'))

    expect(route._tag).toBe('State')
    if (route._tag === 'State') {
      expect(cardboardPreview(route.model)).toMatchObject({
        content: 'Conversation Ledger',
        portableRoute: '/0/extra',
        title: 'Conversation Ledger | Project Cardboard',
      })
    }
  })
})
