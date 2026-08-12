import { initialModel, update } from 'conversations-core-example'
import { Scene } from 'foldkit'
import { describe, test } from 'vitest'

import { view } from './index.js'

describe('view', () => {
  test('renders the projects list', () => {
    Scene.scene(
      { update, view },
      Scene.with(initialModel),
      Scene.expect(Scene.text('Projects')).toExist(),
      Scene.expect(Scene.role('button', { name: /scribe/ })).toExist(),
      Scene.expect(Scene.role('button', { name: /laptop/ })).toExist(),
    )
  })

  test('opening scribe shows its sessions', () => {
    Scene.scene(
      { update, view },
      Scene.with(initialModel),
      Scene.click(Scene.role('button', { name: /scribe/ })),
      Scene.expect(Scene.text('CMUX Tab Test')).toExist(),
      Scene.expect(
        Scene.text('Debugging Scribe App on Apple Ecosystem'),
      ).toExist(),
    )
  })

  test('opening a session shows the outline and interrupt', () => {
    Scene.scene(
      { update, view },
      Scene.with(initialModel),
      Scene.click(Scene.role('button', { name: /scribe/ })),
      Scene.click(Scene.role('button', { name: /CMUX Tab Test/ })),
      Scene.expect(Scene.text('On this page')).toExist(),
      Scene.expect(Scene.text('[Request interrupted by user]')).toExist(),
      Scene.expect(Scene.role('button', { name: 'Follow' })).toExist(),
      Scene.expect(Scene.role('button', { name: 'Ingest' })).toExist(),
    )
  })

  test('settings names the other domains', () => {
    Scene.scene(
      { update, view },
      Scene.with(initialModel),
      Scene.click(Scene.role('button', { name: 'Settings' })),
      Scene.expect(
        Scene.text(
          'Analytics, Skills, Resume, and Billing are other domains. Follow latency ≤ 100 ms.',
        ),
      ).toExist(),
    )
  })
})
