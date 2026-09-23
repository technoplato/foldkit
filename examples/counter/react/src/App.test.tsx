// @vitest-environment jsdom
import { SyncedCounter, startCounterOn } from 'counter-core-example'
import { Interaction, Runtime } from 'foldkit'
import { afterEach, describe, expect, it } from 'vitest'

import { ProgramProvider } from '@foldkit/react/interaction'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

import { App } from './App.js'

const handles: Array<{ stop: () => Promise<void> }> = []

afterEach(async () => {
  cleanup()
  await Promise.all(handles.splice(0).map(handle => handle.stop()))
})

const renderApp = async () => {
  const handle = startCounterOn(Runtime.Memory({ processor: 'react-test' }))
  handles.push(handle)
  render(
    <ProgramProvider bound={Interaction.bind(SyncedCounter, handle)}>
      <App />
    </ProgramProvider>,
  )
  await waitFor(() => {
    expect(screen.getByText('0')).toBeDefined()
  })
  return handle
}

describe('React Counter', () => {
  it('shows Starting until the first snapshot', () => {
    const handle = startCounterOn(Runtime.Memory({ processor: 'react-slow' }))
    handles.push(handle)
    render(
      <ProgramProvider bound={Interaction.bind(SyncedCounter, handle)}>
        <App />
      </ProgramProvider>,
    )
    expect(screen.getByText('Starting Instant Counter…')).toBeDefined()
  })

  it('presses the Program buttons and disables Reset at zero', async () => {
    await renderApp()
    const reset = screen.getByRole('button', { name: 'Reset' })
    expect(reset.hasAttribute('disabled')).toBe(true)
    expect(reset.getAttribute('title')).toBe('count is already 0')
    fireEvent.click(screen.getByRole('button', { name: '+' }))
    await waitFor(() => {
      expect(screen.getByText('1')).toBeDefined()
    })
    expect(
      screen.getByRole('button', { name: 'Reset' }).hasAttribute('disabled'),
    ).toBe(false)
  })

  it('routes declared keys to the Program', async () => {
    await renderApp()
    fireEvent.keyDown(document, { key: '=' })
    await waitFor(() => {
      expect(screen.getByText('1')).toBeDefined()
    })
  })

  it('opens the action menu and chooses Reset by name', async () => {
    await renderApp()
    fireEvent.keyDown(document, { key: '+' })
    fireEvent.keyDown(document, { key: '+' })
    fireEvent.click(screen.getByRole('button', { name: 'Actions (⌘K)' }))
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'reset' },
    })
    expect(screen.getAllByRole('option')).toHaveLength(1)
    fireEvent.keyDown(document, { key: 'Enter' })
    await waitFor(() => {
      expect(screen.getByText('0')).toBeDefined()
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
