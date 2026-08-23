import { Program, Scene } from 'foldkit'
import {
  App,
  type AppModel,
  demoModel,
  emptyModel,
  grokLiveUrl,
  puzzlePage,
  puzzleReplicateScript,
  replicateLiveUrl,
  uriOf,
} from 'puzzle-core-example'
import { describe, test } from 'vitest'

import { view } from './index.js'

const closedAt = (product: AppModel['product']): AppModel => ({
  product,
  actionMenu: Program.Closed(),
})

const initialModel = closedAt(demoModel())

describe('view', () => {
  test('renders ReplicateStep page and script on the demo tape', () => {
    Scene.scene(
      { update: App.update, view },
      Scene.with(initialModel),
      Scene.expect(Scene.text(uriOf(demoModel()))).toExist(),
      Scene.expect(Scene.text(puzzlePage)).toExist(),
      Scene.expect(Scene.text(replicateLiveUrl)).toExist(),
      Scene.expect(Scene.text(grokLiveUrl)).toExist(),
      Scene.expect(Scene.text(puzzleReplicateScript)).toExist(),
      Scene.expect(Scene.role('button', { name: 'reset' })).toExist(),
    )
  })

  test('renders #replicate from an empty tape that opened ReplicateStep', () => {
    const replicate = closedAt({
      tape: [],
      prompt: demoModel().prompt,
    })
    Scene.scene(
      { update: App.update, view },
      Scene.with(replicate),
      Scene.expect(Scene.text('/puzzle#replicate')).toExist(),
      Scene.expect(Scene.text(puzzlePage)).toExist(),
      Scene.expect(Scene.text(puzzleReplicateScript)).toExist(),
    )
  })

  test('keeps live host chrome and hides replicate.sh on a label prompt', () => {
    Scene.scene(
      { update: App.update, view },
      Scene.with(closedAt(emptyModel())),
      Scene.expect(Scene.text('/puzzle#next')).toExist(),
      Scene.expect(Scene.text(puzzlePage)).toExist(),
      Scene.expect(Scene.text(replicateLiveUrl)).toExist(),
      Scene.expect(Scene.text(grokLiveUrl)).toExist(),
      Scene.expect(Scene.text(puzzleReplicateScript)).not.toExist(),
      Scene.expect(Scene.role('button', { name: 'replicate' })).toExist(),
    )
  })
})
