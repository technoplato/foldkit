import {
  Path,
  memorySyncedEngine,
  startSyncedCounterHandle,
  waitForSyncedHandle,
} from 'counter-core-example'
import { Processor, Program } from 'foldkit'
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
  installScreenCounterHandle,
  resetScreenCounterHandle,
  sendScreenToken,
  useScreen,
} from './screenHooks.js'

const ScreenWindow = () => paintReact(useScreen(Path()), sendScreenToken)

afterEach(() => {
  resetScreenCounterHandle()
  cleanup()
})

describe('useScreen default window', () => {
  it('paints the screen tree with no business decisions in the window', async () => {
    installScreenCounterHandle(
      startSyncedCounterHandle(memorySyncedEngine(Processor.Host.React())),
    )
    render(<ScreenWindow />)

    await waitFor(() => {
      expect(screen.getByText('0')).toBeDefined()
    })
    expect(screen.queryByRole('button', { name: 'reset' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '+' }))
    await waitFor(() => {
      expect(screen.getByText('1')).toBeDefined()
    })
    expect(screen.getByRole('button', { name: 'reset' })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'reset' }))
    await waitFor(() => {
      expect(screen.getByText('0')).toBeDefined()
    })
    expect(screen.queryByRole('button', { name: 'reset' })).toBeNull()
  })

  it('does not append the Open menu as a screen row', async () => {
    const handle = startSyncedCounterHandle(
      memorySyncedEngine(Processor.Host.React()),
    )
    installScreenCounterHandle(handle)
    await waitForSyncedHandle(handle)
    handle.send(Program.ActionMenuCommandTriggered())
    render(<ScreenWindow />)

    await waitFor(() => {
      expect(screen.getByText('0')).toBeDefined()
    })
    expect(screen.getByRole('button', { name: '+' })).toBeDefined()
    expect(screen.queryByRole('button', { name: /increment/ })).toBeNull()
    expect(screen.queryByText('Actions')).toBeNull()
    handle.stop()
  })
})
