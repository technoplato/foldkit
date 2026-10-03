// @vitest-environment jsdom
import { Array, Option } from 'effect'
import { Processor, Runtime } from 'foldkit'
import { bindCounters, startCountersOn } from 'multiple-counters-core-example'
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
  const handle = startCountersOn(
    Runtime.Memory({ processor: 'react-test' }),
    undefined,
    Processor.Host.React(),
  )
  handles.push(handle)
  render(
    <ProgramProvider bound={bindCounters(handle)}>
      <App />
    </ProgramProvider>,
  )
  await waitFor(() => {
    expect(screen.getByText('Counter 1')).toBeDefined()
  })
}

const buttonsNamed = (name: string) => screen.getAllByRole('button', { name })

describe('React Multiple Counters', () => {
  it('adds a counter and counts each one on its own', async () => {
    await renderApp()
    fireEvent.click(screen.getByRole('button', { name: 'Add counter' }))
    await waitFor(() => {
      expect(screen.getByText('Counter 2')).toBeDefined()
    })
    fireEvent.click(Option.getOrThrow(Array.get(buttonsNamed('+'), 1)))
    await waitFor(() => {
      expect(screen.getByLabelText('Counter 2 count 1')).toBeDefined()
    })
    expect(screen.getByLabelText('Counter 1 count 0')).toBeDefined()
  })

  it('opens a counter page in the address bar and counts with its keys', async () => {
    await renderApp()
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    await waitFor(() => {
      expect(window.location.pathname).toBe('/counters/1')
    })
    fireEvent.keyDown(document, { key: '+' })
    await waitFor(() => {
      expect(screen.getByLabelText('count 1')).toBeDefined()
    })
    expect(document.title).toBe('Counter 1 | React')
  })

  it('asks in a dialog before deleting, and deletes on Delete', async () => {
    await renderApp()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.getAttribute('data-style')).toBe('Dialog')
    expect(screen.getByText('Delete Counter 1?')).toBeDefined()
    expect(window.location.pathname).toBe('/counters/delete/1')
    fireEvent.keyDown(document, { key: 'y' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(
      screen.getByText('No counters yet. Add one to start counting.'),
    ).toBeDefined()
  })

  it('keeps the counter when the question is cancelled', async () => {
    await renderApp()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(screen.getByText('Counter 1')).toBeDefined()
  })

  it('gives the delete question the keyboard, on Delete first', async () => {
    await renderApp()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe('Delete')
    })
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement?.textContent).toBe('Cancel')
    fireEvent.keyDown(dialog, { key: 'ArrowRight' })
    expect(document.activeElement?.textContent).toBe('Delete')
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement?.textContent).toBe('Cancel')
    expect(
      screen.getByRole('button', { name: 'Cancel' }).getAttribute('data-keys'),
    ).toBe('n')
  })
})

