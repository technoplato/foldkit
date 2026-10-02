import { Option } from 'effect'
import { Link, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import { ProgramProvider } from '../interaction/interaction.js'
import { bindRouted } from '../test/routedCounter.js'
import { FoldkitRouter } from './reactRouter.js'

const Where = () => <p>at {useLocation().pathname}</p>

const renderRouted = () => {
  const bound = bindRouted()
  render(
    <ProgramProvider bound={bound}>
      <FoldkitRouter>
        <Where />
        <Routes>
          <Route
            path="/counter"
            element={<Link to="/counter/session">Session</Link>}
          />
          <Route path="/counter/session" element={<p>Session page</p>} />
        </Routes>
      </FoldkitRouter>
    </ProgramProvider>,
  )
  return bound
}

afterEach(() => {
  cleanup()
})

describe('FoldkitRouter', () => {
  it('routes on the Program plan, not on browser history', () => {
    renderRouted()
    expect(screen.getByText('at /counter')).toBeDefined()
  })

  it('sends a Link click to the Program, which moves the location', () => {
    const bound = renderRouted()
    act(() => {
      fireEvent.click(screen.getByText('Session'))
    })
    expect(Option.map(bound.navigation(), plan => plan.uri)).toEqual(
      Option.some('/counter/session'),
    )
    expect(screen.getByText('Session page')).toBeDefined()
    expect(screen.getByText('at /counter/session')).toBeDefined()
  })

  it('follows a move the Program makes on its own', () => {
    const bound = renderRouted()
    act(() => {
      bound.press('OpenSessionSettings')
    })
    expect(screen.getByText('Session page')).toBeDefined()
  })
})
