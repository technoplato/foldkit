import {
  PressedOpenBook,
  PressedOpenChapter,
  PressedSignIn,
  SignedOut,
  dune,
  newEarth,
  playOf,
  screenOf,
} from 'books-core-example'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import { describeScreen, executeBooksInput } from './host.js'

describe('Books CLI host', () => {
  it('shows signed out without a Message', async () => {
    const execution = await Effect.runPromise(executeBooksInput([]))

    expect(execution.messages).toEqual([])
    expect(screenOf(execution.finalModel)).toEqual(SignedOut())
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

  it('opens Dune on the title page', async () => {
    const execution = await Effect.runPromise(
      executeBooksInput(['signin', `open:${dune.id}`]),
    )

    expect(execution.messages).toEqual([
      PressedSignIn(),
      PressedOpenBook({ itemId: dune.id }),
    ])
    expect(screenOf(execution.finalModel)._tag).toBe('TitlePage')
    expect(describeScreen(execution.finalModel)).toContain('Dune')
    expect(describeScreen(execution.finalModel)).toContain('Frank Herbert')
    expect(describeScreen(execution.finalModel)).not.toContain('delicate care')
  })

  it('lists New Earth chapters on the title page', async () => {
    const execution = await Effect.runPromise(
      executeBooksInput(['signin', `open:${newEarth.id}`]),
    )

    expect(describeScreen(execution.finalModel)).toContain('A New Earth')
    expect(describeScreen(execution.finalModel)).toContain('0  Opening Credits')
    expect(describeScreen(execution.finalModel)).toContain(
      '113  THE NEW EARTH IS NO UTOPIA',
    )
  })

  it('opens a New Earth chapter in the reader', async () => {
    const execution = await Effect.runPromise(
      executeBooksInput([
        'signin',
        `open:${newEarth.id}`,
        `chapter:${newEarth.id}:ch-001`,
      ]),
    )

    expect(execution.messages).toEqual([
      PressedSignIn(),
      PressedOpenBook({ itemId: newEarth.id }),
      PressedOpenChapter({ itemId: newEarth.id, chapterId: 'ch-001' }),
    ])
    expect(screenOf(execution.finalModel)._tag).toBe('ReaderBoth')
    expect(describeScreen(execution.finalModel)).toContain('A New Earth')
  })

  it('sorts title-page chapters and highlights the spoken tail', async () => {
    const execution = await Effect.runPromise(
      executeBooksInput([
        'signin',
        `open:${newEarth.id}`,
        'sort:index',
        `play:${newEarth.id}`,
        'seek:19.309',
      ]),
    )

    const screen = describeScreen(execution.finalModel)
    expect(screen).toContain('*Evocation*')
    expect(playOf(execution.finalModel)._tag).toBe('PlayPlaying')
  })
})
