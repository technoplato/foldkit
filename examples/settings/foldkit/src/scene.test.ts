import { Scene } from 'foldkit'
import {
  ReadOrigin,
  SucceededReadOrigin,
  readModel,
  readingModel,
  sampleSnapshot,
  unreadModel,
  update,
} from 'settings-core-example'
import { describe, test } from 'vitest'

import { view } from './index.js'

describe('Settings Foldkit view', () => {
  test('empty offers Refresh, which reads the origin', () => {
    Scene.scene(
      { update, view },
      Scene.with(unreadModel),
      Scene.expect(Scene.text('Settings')).toExist(),
      Scene.expect(Scene.text('Empty')).toExist(),
      Scene.expect(Scene.role('button', { name: 'Refresh' })).toExist(),
      Scene.click(Scene.role('button', { name: 'Refresh' })),
      Scene.Command.expectHas(ReadOrigin),
      Scene.Command.resolve(
        ReadOrigin,
        SucceededReadOrigin({
          token: sampleSnapshot.token,
          hosts: sampleSnapshot.hosts,
        }),
      ),
      Scene.expect(Scene.text('ingest.knophy.com')).toExist(),
      Scene.expect(Scene.text('Public')).toExist(),
      Scene.expect(Scene.role('button', { name: 'Refresh' })).toExist(),
    )
  })

  test('hides Refresh while Applying', () => {
    Scene.scene(
      { update, view },
      Scene.with(readingModel),
      Scene.expect(Scene.text('Applying')).toExist(),
      Scene.expect(Scene.role('button', { name: 'Refresh' })).toBeAbsent(),
    )
  })

  test('paints loaded hosts', () => {
    Scene.scene(
      { update, view },
      Scene.with(readModel),
      Scene.expect(Scene.text('Settings')).toExist(),
      Scene.expect(Scene.text('ingest.knophy.com')).toExist(),
      Scene.expect(Scene.text('Public')).toExist(),
    )
  })
})
