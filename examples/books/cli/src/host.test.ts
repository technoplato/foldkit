import {
  PressedOpenBook,
  PressedSignIn,
  SignedOut,
  dune,
} from 'books-core-example'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import { describeScreen, executeBooksInput } from './host.js'

describe('Books CLI host', () => {
  it('shows signed out without a Message', async () => {
    const execution = await Effect.runPromise(executeBooksInput([]))

    expect(execution.messages).toEqual([])
    expect(execution.finalModel.screen).toEqual(SignedOut())
    expect(describeScreen(execution.finalModel)).toContain('signed out')
  })

  it('signs in through the imported Message constructor', async () => {
    const execution = await Effect.runPromise(executeBooksInput(['signin']))

    expect(execution.messages).toEqual([PressedSignIn()])
    expect(describeScreen(execution.finalModel)).toContain('Dune')
    expect(describeScreen(execution.finalModel)).toContain('Kindred')
    expect(describeScreen(execution.finalModel)).toContain(
      'A New Earth · Eckhart Tolle · Both · cover',
    )
  })

  it('opens Dune', async () => {
    const execution = await Effect.runPromise(
      executeBooksInput(['signin', `open:${dune.id}`]),
    )

    expect(execution.messages).toEqual([
      PressedSignIn(),
      PressedOpenBook({ itemId: dune.id }),
    ])
    expect(describeScreen(execution.finalModel)).toContain('Dune')
    expect(describeScreen(execution.finalModel)).toContain('delicate care')
  })
})
