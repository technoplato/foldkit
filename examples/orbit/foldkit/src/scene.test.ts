import { emptyModel, runIndex, update } from 'orbit-core-example'
import { Scene } from 'foldkit'
import { describe, test } from 'vitest'

import { view } from './index.js'

describe('view', () => {
  test('renders the agent index heading', () => {
    const { model } = runIndex(emptyModel())
    Scene.scene(
      { update, view },
      Scene.with(model),
      Scene.expect(Scene.text('AGENT INDEX · EXECUTED AT PREBUILD')).toExist(),
      Scene.expect(Scene.text('tortoise')).toExist(),
      Scene.expect(Scene.text('achilles')).toExist(),
    )
  })
})
