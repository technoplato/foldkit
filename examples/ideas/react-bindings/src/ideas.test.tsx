import { type ReactNode, StrictMode } from 'react'
import { describe, expect, it } from 'vitest'

import { act, renderHook } from '@testing-library/react'

import { IdeasProvider, useIdeasActions, useIdeasModel } from './index.js'

const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
  <StrictMode>
    <IdeasProvider>{children}</IdeasProvider>
  </StrictMode>
)

describe('Ideas React bindings', () => {
  it('observes the shared Ideas Model and exposes stable actions', () => {
    const { result } = renderHook(
      () => ({
        actions: useIdeasActions(),
        model: useIdeasModel(),
      }),
      { wrapper },
    )

    const actions = result.current.actions
    expect(
      result.current.model.catalog._tag === 'LoadingCatalog' ||
        result.current.model.catalog._tag === 'LoadedCatalog',
    ).toBe(true)

    act(() => {
      result.current.actions.updatedQuery('Gemma')
    })
    expect(result.current.model.query).toBe('Gemma')
    expect(result.current.actions).toBe(actions)
  })
})
