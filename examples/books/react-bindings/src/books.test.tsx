import { ShelfBrowse } from 'books-core-example'
import { type ReactNode, StrictMode } from 'react'
import { describe, expect, it } from 'vitest'

import { act, renderHook } from '@testing-library/react'

import { BooksProvider, useBooksActions, useBooksModel } from './index.js'

const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
  <StrictMode>
    <BooksProvider>{children}</BooksProvider>
  </StrictMode>
)

describe('Books React bindings', () => {
  it('observes the shared Model and signs in', () => {
    const { result } = renderHook(
      () => ({
        actions: useBooksActions(),
        model: useBooksModel(),
      }),
      { wrapper },
    )

    const actions = result.current.actions
    expect(result.current.model.screen._tag).toBe('SignedOut')

    act(() => {
      result.current.actions.pressedSignIn()
    })
    expect(result.current.model.screen).toEqual(ShelfBrowse())
    expect(result.current.actions).toBe(actions)
  })
})
