import { SyncedCounter, type SyncedCounterModel } from 'counter-core-example'
import { Array, Option } from 'effect'
import { Interaction, Scene } from 'foldkit'
import { describe, test } from 'vitest'

import { view } from './view.js'

const interaction = Option.getOrThrowWith(
  Option.fromNullishOr(SyncedCounter.interaction),
  () => new Error('SyncedCounter must carry an interaction'),
)

const update = (
  model: SyncedCounterModel,
  gesture: Interaction.Gesture,
): readonly [SyncedCounterModel, ReadonlyArray<never>] => [
  Array.reduce(
    Interaction.messagesOfGesture(interaction, model, gesture),
    model,
    (current, message) => SyncedCounter.update(current, message)[0],
  ),
  [],
]

const ready = (count: number): SyncedCounterModel =>
  SyncedCounter.update(SyncedCounter.init()[0], {
    _tag: 'SnapshotReceived',
    model: { ...SyncedCounter.of.init()[0], count },
  })[0]

describe('Foldkit Counter view', () => {
  test('paints the count and the Catalog buttons, Reset disabled at 0', () => {
    Scene.scene(
      { update, view },
      Scene.with(ready(0)),
      Scene.expect(Scene.text('0')).toExist(),
      Scene.expect(Scene.role('button', { name: '+' })).toExist(),
      Scene.expect(Scene.role('button', { name: '-' })).toExist(),
      Scene.expect(Scene.role('button', { name: 'Reset' })).toBeDisabled(),
    )
  })

  test('presses + and - through gestures', () => {
    Scene.scene(
      { update, view },
      Scene.with(ready(2)),
      Scene.click(Scene.role('button', { name: '+' })),
      Scene.expect(Scene.text('3')).toExist(),
      Scene.click(Scene.role('button', { name: '-' })),
      Scene.click(Scene.role('button', { name: '-' })),
      Scene.expect(Scene.text('1')).toExist(),
    )
  })

  test('opens the action menu and chooses Reset from it', () => {
    Scene.scene(
      { update, view },
      Scene.with(ready(4)),
      Scene.click(Scene.role('button', { name: 'Actions (⌘K)' })),
      Scene.expect(Scene.text('Actions')).toExist(),
      Scene.click(Scene.role('option', { name: /Sets the count to 0/ })),
      Scene.expect(Scene.text('0')).toExist(),
      Scene.expect(Scene.role('dialog')).not.toExist(),
    )
  })

  test('paints Starting before the first snapshot', () => {
    Scene.scene(
      { update, view },
      Scene.with(SyncedCounter.init()[0]),
      Scene.expect(Scene.text('Starting Instant Counter…')).toExist(),
    )
  })
})
