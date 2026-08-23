import { Processor, Program } from 'foldkit'
import {
  Path,
  demoModel,
  emptyModel,
  memorySyncedEngine,
  startSyncedPuzzleHandle,
  uriOf,
  waitForSyncedHandle,
} from 'puzzle-core-example'
import { afterEach, describe, expect, it } from 'vitest'

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

import { paintReact } from './paintReact.js'
import {
  installScreenPuzzleHandle,
  resetScreenPuzzleHandle,
  sendScreenToken,
  useScreen,
} from './screenHooks.js'

const ScreenWindow = () => paintReact(useScreen(Path()), sendScreenToken)

afterEach(() => {
  resetScreenPuzzleHandle()
  cleanup()
})

describe('useScreen default window', () => {
  it('paints the screen tree with no business decisions in the window', async () => {
    installScreenPuzzleHandle(
      startSyncedPuzzleHandle(memorySyncedEngine(Processor.Host.React())),
    )
    render(<ScreenWindow />)

    await waitFor(() => {
      expect(screen.getByText(uriOf(demoModel()))).toBeDefined()
    })
    expect(
      screen.getAllByRole('link', { name: 'https://puzzle.knophy.com' }).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getByRole('link', { name: 'https://replicate.knophy.com' }),
    ).toBeDefined()
    expect(
      screen.getByRole('link', { name: 'https://grok.knophy.com' }),
    ).toBeDefined()
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
  })

  it('does not append the Open menu as a screen row', async () => {
    const handle = startSyncedPuzzleHandle(
      memorySyncedEngine(Processor.Host.React()),
    )
    installScreenPuzzleHandle(handle)
    await waitForSyncedHandle(handle)
    handle.send(Program.ActionMenuCommandTriggered())
    render(<ScreenWindow />)

    await waitFor(() => {
      expect(screen.getByText(uriOf(demoModel()))).toBeDefined()
    })
    expect(screen.getByRole('button', { name: 'reset' })).toBeDefined()
    expect(screen.queryByRole('button', { name: /yes/ })).toBeNull()
    expect(screen.queryByText('Actions')).toBeNull()
    handle.stop()
  })
})
