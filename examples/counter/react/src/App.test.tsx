// @vitest-environment jsdom
import { Path } from 'counter-core-example'
import { resetSyncedCounterHandle } from 'counter-react-bindings-example'
import { afterEach, describe, expect, it } from 'vitest'

import { ProgramKeyBindings } from '@foldkit/react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

import { App } from './App.js'

afterEach(() => {
  resetSyncedCounterHandle()
  cleanup()
})

describe('Counter bespoke window', () => {
  it('drops the Reset button at 0 and shows it after one tap', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('0')).toBeDefined()
    })
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '+' }))
    await waitFor(() => {
      expect(screen.getByText('1')).toBeDefined()
    })
    const reset = screen.getByRole('button', { name: 'Reset' })

    fireEvent.click(reset)
    await waitFor(() => {
      expect(screen.getByText('0')).toBeDefined()
    })
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull()
  })

  it('sends Increment from the + key while the menu is Closed', async () => {
    render(
      <ProgramKeyBindings path={Path()}>
        <App />
      </ProgramKeyBindings>,
    )
    await waitFor(() => {
      expect(screen.getByText('0')).toBeDefined()
    })
    fireEvent.keyDown(document, { key: '+' })
    await waitFor(() => {
      expect(screen.getByText('1')).toBeDefined()
    })
  })

  it('fires + while Open, flashes the row, and dismisses', async () => {
    render(
      <ProgramKeyBindings path={Path()}>
        <App />
      </ProgramKeyBindings>,
    )
    await waitFor(() => {
      expect(screen.getByText('0')).toBeDefined()
    })
    fireEvent.keyDown(document, { key: '?' })
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Action menu' })).toBeDefined()
    })
    expect(
      screen.getByRole('button', { name: '[ + ] increment' }),
    ).toBeDefined()
    fireEvent.keyDown(document, { key: '+' })
    await waitFor(() => {
      expect(screen.getByText('1')).toBeDefined()
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Action menu' })).toBeNull()
    })
  })

  it('keeps the menu Open when hidden r is a no-op', async () => {
    render(
      <ProgramKeyBindings path={Path()}>
        <App />
      </ProgramKeyBindings>,
    )
    await waitFor(() => {
      expect(screen.getByText('0')).toBeDefined()
    })
    fireEvent.keyDown(document, { key: '?' })
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Action menu' })).toBeDefined()
    })
    fireEvent.keyDown(document, { key: 'r' })
    expect(screen.getByText('0')).toBeDefined()
    expect(screen.getByRole('dialog', { name: 'Action menu' })).toBeDefined()
  })

  it('decrements through the derived fact handle', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('0')).toBeDefined()
    })
    fireEvent.click(screen.getByRole('button', { name: '-' }))
    await waitFor(() => {
      expect(screen.getByText('-1')).toBeDefined()
    })
  })
})
