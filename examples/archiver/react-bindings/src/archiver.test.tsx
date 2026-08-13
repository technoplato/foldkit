import { QueuedArchive } from 'archiver-core-example'
import { type ReactNode, StrictMode } from 'react'
import { describe, expect, it } from 'vitest'

import { act, renderHook } from '@testing-library/react'

import {
  ArchiverProvider,
  useArchiverActions,
  useArchiverModel,
} from './index.js'

const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
  <StrictMode>
    <ArchiverProvider>{children}</ArchiverProvider>
  </StrictMode>
)

const sampleUrl = 'https://www.tiktok.com/@x/video/1'

describe('Archiver React bindings', () => {
  it('observes the shared Archiver Model and exposes stable actions', () => {
    const { result } = renderHook(
      () => ({
        actions: useArchiverActions(),
        model: useArchiverModel(),
      }),
      { wrapper },
    )

    const actions = result.current.actions
    expect(result.current.model).toEqual({ urlDraft: '', archives: [] })

    act(() => {
      result.current.actions.updatedUrlDraft(sampleUrl)
    })
    expect(result.current.model.urlDraft).toBe(sampleUrl)
    expect(result.current.actions).toBe(actions)

    act(() => {
      result.current.actions.submittedArchiveUrl()
    })
    expect(result.current.model).toEqual({
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

    act(() => {
      result.current.actions.clickedArchive(sampleUrl)
    })
    expect(result.current.model.archives).toHaveLength(1)
    expect(result.current.actions).toBe(actions)
  })
})
