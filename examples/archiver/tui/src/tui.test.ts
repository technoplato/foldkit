import {
  ClickedArchive,
  Model,
  QueuedArchive,
  SubmittedArchiveUrl,
  UpdatedUrlDraft,
} from 'archiver-core-example'
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { messageForInput, renderArchiverScreen } from './host.js'

const sampleUrl = 'https://www.tiktok.com/@x/video/1'

const queuedModel = Model.make({
  urlDraft: '',
  archives: [
    {
      id: sampleUrl,
      url: sampleUrl,
      title: sampleUrl,
      status: QueuedArchive(),
    },
  ],
})

describe('Archiver TUI', () => {
  it('renders the URL field and archive list', () => {
    const empty = renderArchiverScreen(Model.make({ urlDraft: '', archives: [] }))
    expect(empty).toContain('Archiver')
    expect(empty).toContain('URL:')
    expect(empty).toContain('No archives yet.')
    expect(empty).toContain('[Enter] archive')
    expect(empty).toContain('[1-9] open')
    expect(empty).toContain('[Q] quit')

    const listed = renderArchiverScreen(queuedModel)
    expect(listed).toContain(sampleUrl)
    expect(listed).toContain('Queued')
  })

  it('maps URL input, submit, and open to imported Message constructors', () => {
    const empty = Model.make({ urlDraft: '', archives: [] })
    expect(messageForInput(empty, 'h')).toEqual(
      Option.some(UpdatedUrlDraft({ value: 'h' })),
    )
    expect(
      messageForInput(Model.make({ urlDraft: 'h', archives: [] }), 't'),
    ).toEqual(Option.some(UpdatedUrlDraft({ value: 'ht' })))
    expect(messageForInput(empty, 'enter')).toEqual(
      Option.some(SubmittedArchiveUrl()),
    )
    expect(messageForInput(queuedModel, '1')).toEqual(
      Option.some(ClickedArchive({ id: sampleUrl })),
    )
    expect(messageForInput(queuedModel, 'q')).toEqual(Option.none())
  })
})
