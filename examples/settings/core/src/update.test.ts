import { Array, Option } from 'effect'
import { NonEmptyString } from 'foldkit/adt'
import { describe, expect, test } from 'vitest'

import { init, restore } from './init.js'
import { ClickedPublic, ClickedRefresh } from './message.js'
import {
  ApplyFailed,
  emptyModel,
  loadedModel,
  loadingModel,
  settingsHostName,
} from './model.js'
import { update } from './update.js'

describe('Settings update', () => {
  test('init starts Applying and reads the origin', () => {
    const [model, commands] = init()
    expect(model.apply._tag).toBe('Applying')
    const maybeCommand = Array.head(commands)
    expect(Option.isSome(maybeCommand)).toBe(true)
    if (Option.isSome(maybeCommand)) {
      expect(maybeCommand.value.name).toBe('ReadOrigin')
    }
  })

  test('restore keeps a loaded model without fetching', () => {
    const loaded = loadedModel()
    expect(restore(loaded)).toEqual([loaded, []])
    expect(restore(emptyModel())).toEqual([emptyModel(), []])
  })

  test('ClickedRefresh while Applying does not start another read', () => {
    const [next, commands] = update(loadingModel(), ClickedRefresh())
    expect(next.apply._tag).toBe('Applying')
    expect(commands).toEqual([])
  })

  test('ClickedRefresh reads the origin again', () => {
    const [next, commands] = update(loadedModel(), ClickedRefresh())
    expect(next.apply._tag).toBe('Applying')
    expect(commands[0]?.name).toBe('ReadOrigin')
  })

  test('ClickedPublic on settings is refused', () => {
    const [next, commands] = update(
      loadedModel(),
      ClickedPublic({ host: NonEmptyString.make(settingsHostName) }),
    )
    expect(commands).toEqual([])
    expect(next.apply._tag).toBe('Failed')
    if (next.apply._tag === 'Failed') {
      expect(next.apply.reason).toBe('settings stays Restricted')
    }
    expect(
      ApplyFailed.make({
        reason: next.apply._tag === 'Failed' ? next.apply.reason : 'x',
      })._tag,
    ).toBe('Failed')
  })
})
