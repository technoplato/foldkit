import { Array, Option } from 'effect'
import { Story } from 'foldkit'
import { describe, expect, test } from 'vitest'

import { ReadOrigin } from './command.js'
import { init, restore } from './init.js'
import {
  ClickedRefresh,
  FailedReadOrigin,
  SucceededReadOrigin,
} from './message.js'
import {
  BadGateway,
  failedBadGatewayModel,
  readModel,
  readingModel,
  sampleRemainingMessages,
  sampleRemainingRate,
  unreadModel,
} from './model.js'
import { update } from './update.js'

describe('Gate update', () => {
  test('init starts Reading and reads the origin', () => {
    const [model, commands] = init()
    expect(model).toEqual(readingModel)
    const maybeCommand = Array.head(commands)
    expect(Option.isSome(maybeCommand)).toBe(true)
    if (Option.isSome(maybeCommand)) {
      expect(maybeCommand.value.name).toBe('ReadOrigin')
    }
  })

  test('restore keeps Unread without fetching', () => {
    expect(restore(unreadModel)).toEqual([unreadModel, []])
  })

  test('restore keeps Read without fetching', () => {
    expect(restore(readModel)).toEqual([readModel, []])
  })

  test('ClickedRefresh while Reading does not start another read', () => {
    Story.story(
      update,
      Story.with(readingModel),
      Story.message(ClickedRefresh()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model).toEqual(readingModel)
      }),
    )
  })

  test('ClickedRefresh reads the origin again', () => {
    Story.story(
      update,
      Story.with(readModel),
      Story.message(ClickedRefresh()),
      Story.model(model => {
        expect(model).toEqual(readingModel)
      }),
      Story.Command.expectHas(ReadOrigin),
      Story.Command.resolve(
        ReadOrigin,
        SucceededReadOrigin({
          rate: sampleRemainingRate,
          messages: sampleRemainingMessages,
        }),
      ),
      Story.model(model => {
        expect(model).toEqual(readModel)
      }),
    )
  })

  test('FailedReadOrigin becomes Failed', () => {
    Story.story(
      update,
      Story.with(readingModel),
      Story.message(FailedReadOrigin({ reason: BadGateway() })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model).toEqual(failedBadGatewayModel)
      }),
    )
  })
})
