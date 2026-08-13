import {
  ClickedArchive,
  Model,
  QueuedArchive,
  SubmittedArchiveUrl,
  UpdatedUrlDraft,
} from 'archiver-core-example'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import { describeArchives, executeArchiverInput } from './host.js'

const sampleUrl = 'https://www.tiktok.com/@x/video/1'

describe('Archiver CLI host', () => {
  it('lists the imported initial Model without a Message', async () => {
    const execution = await Effect.runPromise(executeArchiverInput([]))

    expect(execution.initialModel).toEqual(
      Model.make({ urlDraft: '', archives: [] }),
    )
    expect(execution.messages).toEqual([])
    expect(execution.finalModel).toBe(execution.initialModel)
    expect(describeArchives(execution.finalModel)).toBe('No archives.')
  })

  it('submits a pasted URL through the imported update', async () => {
    const execution = await Effect.runPromise(
      executeArchiverInput([`url:${sampleUrl}`, 'submit']),
    )

    expect(execution.messages).toEqual([
      UpdatedUrlDraft({ value: sampleUrl }),
      SubmittedArchiveUrl(),
    ])
    expect(execution.finalModel).toEqual(
      Model.make({
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
    )
    expect(describeArchives(execution.finalModel)).toBe(`Queued  ${sampleUrl}`)
  })

  it('opens a queued archive by id', async () => {
    const execution = await Effect.runPromise(
      executeArchiverInput([`url:${sampleUrl}`, 'submit', `open:${sampleUrl}`]),
    )

    expect(execution.messages).toEqual([
      UpdatedUrlDraft({ value: sampleUrl }),
      SubmittedArchiveUrl(),
      ClickedArchive({ id: sampleUrl }),
    ])
    expect(execution.finalModel.archives).toHaveLength(1)
  })
})
