import { describe, expect, it } from 'vitest'

import { SubmittedArchiveUrl, UpdatedUrlDraft } from './message.js'
import { QueuedArchive } from './model.js'
import { init } from './init.js'
import { update } from './update.js'

describe('archiver update', () => {
  it('queues a trimmed URL and clears the draft', () => {
    const [model] = init()
    const [withDraft] = update(
      model,
      UpdatedUrlDraft({ value: ' https://www.tiktok.com/@x/video/1 ' }),
    )
    const [next] = update(withDraft, SubmittedArchiveUrl())
    expect(next.urlDraft).toBe('')
    expect(next.archives).toEqual([
      {
        id: 'https://www.tiktok.com/@x/video/1',
        url: 'https://www.tiktok.com/@x/video/1',
        title: 'https://www.tiktok.com/@x/video/1',
        status: QueuedArchive(),
      },
    ])
  })

  it('ignores an empty submit', () => {
    const [model] = init()
    const [next] = update(model, SubmittedArchiveUrl())
    expect(next.archives).toEqual([])
  })
})
