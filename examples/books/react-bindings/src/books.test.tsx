import { ShelfBrowse, screenOf } from 'books-core-example'
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
    expect(screenOf(result.current.model)._tag).toBe('SignedOut')

    act(() => {
      result.current.actions.pressedSignIn()
    })
    expect(screenOf(result.current.model)).toEqual(ShelfBrowse())
    expect(result.current.actions).toBe(actions)
  })
})
