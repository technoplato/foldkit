import { QueuedArchive, type Model, update } from 'archiver-core-example'
import { Scene } from 'foldkit'
import { describe, test } from 'vitest'

import { view } from './index.js'

const initialModel: Model = { urlDraft: '', archives: [] }

const sampleUrl = 'https://www.tiktok.com/@x/video/1'

describe('view', () => {
  test('renders the URL form and empty shelf', () => {
    Scene.scene(
      { update, view },
      Scene.with(initialModel),
      Scene.expect(Scene.text('Archiver')).toExist(),
      Scene.expect(Scene.label('Source URL')).toExist(),
      Scene.expect(Scene.role('button', { name: 'Archive' })).toExist(),
      Scene.expect(Scene.text('No archives yet.')).toExist(),
    )
  })

  test('submitting a URL queues it on the shelf', () => {
    Scene.scene(
      { update, view },
      Scene.with(initialModel),
      Scene.type(Scene.label('Source URL'), sampleUrl),
      Scene.click(Scene.role('button', { name: 'Archive' })),
      Scene.expect(Scene.role('button', { name: sampleUrl })).toExist(),
      Scene.expect(Scene.text('Queued')).toExist(),
    )
  })

  test('clicking an archive keeps it listed', () => {
    Scene.scene(
      { update, view },
      Scene.with({
        urlDraft: '',
        archives: [
          {
            id: sampleUrl,
            url: sampleUrl,
            title: sampleUrl,
            status: QueuedArchive(),
          },
        ],
      }),
      Scene.click(Scene.role('button', { name: sampleUrl })),
      Scene.expect(Scene.role('button', { name: sampleUrl })).toExist(),
    )
  })
})
