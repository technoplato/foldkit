// @vitest-environment jsdom
import { Processor } from 'foldkit'
import {
  Path,
  demoModel,
  emptyModel,
  hangingSyncedEngine,
  memorySyncedEngine,
  startSyncedPuzzleHandle,
  uriOf,
  waitForSyncedHandle,
} from 'puzzle-core-example'
import {
  installScreenPuzzleHandle,
  installSyncedPuzzleHandle,
  resetScreenPuzzleHandle,
  resetSyncedPuzzleHandle,
} from 'puzzle-react-bindings-example'
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
  resetSyncedPuzzleHandle()
  resetScreenPuzzleHandle()
  cleanup()
})

const mountApp = async () => {
  const handle = startSyncedPuzzleHandle(
    memorySyncedEngine(Processor.Host.React()),
  )
  installSyncedPuzzleHandle(handle)
  installScreenPuzzleHandle(handle)
  await waitForSyncedHandle(handle)
  render(
    <ProgramKeyBindings path={Path()}>
      <App />
    </ProgramKeyBindings>,
  )
  return handle
}

const expectLiveHosts = (): void => {
  expect(
    screen.getAllByRole('link', { name: 'https://puzzle.knophy.com' }).length,
  ).toBeGreaterThan(0)
  expect(
    screen.getByRole('link', { name: 'https://replicate.knophy.com' }),
  ).toBeDefined()
  expect(
    screen.getByRole('link', { name: 'https://grok.knophy.com' }),
  ).toBeDefined()
}

describe('Puzzle bespoke window', () => {
  it('paints Failed when Instant subscribe never settles', async () => {
    const handle = startSyncedPuzzleHandle(
      hangingSyncedEngine(Processor.Host.React()),
      { settleMs: 50 },
    )
    installSyncedPuzzleHandle(handle)
    installScreenPuzzleHandle(handle)
    render(
      <ProgramKeyBindings path={Path()}>
        <App />
      </ProgramKeyBindings>,
    )
    await waitFor(() => {
      expect(
        screen.getByText(/This Processor never became Ready/),
      ).toBeDefined()
    })
    expect(screen.getByText(/start did not settle/)).toBeDefined()
    expect(screen.queryByText('TransportFailed')).toBeNull()
    await handle.stop()
  })

  it('drops the ResetTape button on an empty tape and shows it after yes', async () => {
    const handle = await mountApp()
    await waitFor(() => {
      expect(screen.getByText(uriOf(demoModel()))).toBeDefined()
    })
    expectLiveHosts()
    expect(screen.getByRole('button', { name: 'reset' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'y' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'reset' }))
    await waitFor(() => {
      expect(screen.getByText(uriOf(emptyModel()))).toBeDefined()
    })
    expect(screen.getByRole('button', { name: 'y' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'reset' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'y' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'reset' })).toBeDefined()
    })
    handle.stop()
  })

  it('sends GuessedYes from the + key after reset', async () => {
    const handle = await mountApp()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'reset' })).toBeDefined()
    })
    fireEvent.keyDown(document, { key: 'r' })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'y' })).toBeDefined()
    })
    fireEvent.keyDown(document, { key: '+' })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'reset' })).toBeDefined()
    })
    handle.stop()
  })

  it('fires + while Open, flashes the row, and dismisses', async () => {
    const handle = await mountApp()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'reset' })).toBeDefined()
    })
    fireEvent.keyDown(document, { key: 'r' })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'y' })).toBeDefined()
    })
    fireEvent.keyDown(document, { key: '?' })
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Action menu' })).toBeDefined()
    })
    expect(screen.getByRole('button', { name: '[ y ] yes' })).toBeDefined()
    fireEvent.keyDown(document, { key: '+' })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'reset' })).toBeDefined()
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Action menu' })).toBeNull()
    })
    handle.stop()
  })

  it('keeps the menu Open when hidden r is a no-op', async () => {
    const handle = await mountApp()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'reset' })).toBeDefined()
    })
    fireEvent.keyDown(document, { key: 'r' })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'y' })).toBeDefined()
    })
    fireEvent.keyDown(document, { key: '?' })
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Action menu' })).toBeDefined()
    })
    fireEvent.keyDown(document, { key: 'r' })
    expect(screen.getByText(uriOf(emptyModel()))).toBeDefined()
    expect(screen.getByRole('dialog', { name: 'Action menu' })).toBeDefined()
    handle.stop()
  })

  it('records no through the derived fact handle', async () => {
    const handle = await mountApp()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'reset' })).toBeDefined()
    })
    fireEvent.click(screen.getByRole('button', { name: 'reset' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'n' })).toBeDefined()
    })
    fireEvent.click(screen.getByRole('button', { name: 'n' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'reset' })).toBeDefined()
    })
    handle.stop()
  })
})
