// @vitest-environment jsdom
import { Path } from 'counter-core-example'
import {
  memorySyncedEngine,
  startSyncedCounterHandle,
  waitForSyncedHandle,
} from 'counter-core-example'
import {
  installScreenCounterHandle,
  installSyncedCounterHandle,
  resetScreenCounterHandle,
  resetSyncedCounterHandle,
} from 'counter-react-bindings-example'
import { Processor } from 'foldkit'
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
  resetScreenCounterHandle()
  cleanup()
})

const renderReadyApp = async () => {
  const handle = startSyncedCounterHandle(
    memorySyncedEngine(Processor.Host.React()),
  )
  installSyncedCounterHandle(handle)
  installScreenCounterHandle(handle)
  await waitForSyncedHandle(handle)
  return handle
}

describe('Counter window', () => {
  it('drops the reset button at 0 and shows it after one tap', async () => {
    const handle = await renderReadyApp()
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('0')).toBeDefined()
    })
    expect(screen.queryByRole('button', { name: 'reset' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '+' }))
    await waitFor(() => {
      expect(screen.getByText('1')).toBeDefined()
    })
    const reset = screen.getByRole('button', { name: 'reset' })

    fireEvent.click(reset)
    await waitFor(() => {
      expect(screen.getByText('0')).toBeDefined()
    })
    expect(screen.queryByRole('button', { name: 'reset' })).toBeNull()
    handle.stop()
  })

  it('sends Increment from the + key while the menu is Closed', async () => {
    const handle = await renderReadyApp()
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
    handle.stop()
  })

  it('fires + while Open, flashes the row, and dismisses', async () => {
    const handle = await renderReadyApp()
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
    handle.stop()
  })

  it('keeps the menu Open when hidden r is a no-op', async () => {
    const handle = await renderReadyApp()
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
    handle.stop()
  })

  it('decrements through the painted screen Button', async () => {
    const handle = await renderReadyApp()
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('0')).toBeDefined()
    })
    fireEvent.click(screen.getByRole('button', { name: '-' }))
    await waitFor(() => {
      expect(screen.getByText('-1')).toBeDefined()
    })
    handle.stop()
  })
})
