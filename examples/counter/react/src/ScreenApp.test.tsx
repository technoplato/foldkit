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

import { ScreenApp } from './ScreenApp.js'

afterEach(() => {
  resetSyncedCounterHandle()
  resetScreenCounterHandle()
  cleanup()
})

describe('Counter screen window', () => {
  it('paints Open menu as a dialog overlay', async () => {
    const handle = startSyncedCounterHandle(
      memorySyncedEngine(Processor.Host.React()),
    )
    installSyncedCounterHandle(handle)
    installScreenCounterHandle(handle)
    await waitForSyncedHandle(handle)
    render(
      <ProgramKeyBindings path={Path()}>
        <ScreenApp />
      </ProgramKeyBindings>,
    )

    await waitFor(() => {
      expect(screen.getByText('0')).toBeDefined()
    })
    expect(screen.queryByRole('dialog', { name: 'Action menu' })).toBeNull()

    fireEvent.keyDown(document, { key: '?' })
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Action menu' })).toBeDefined()
    })
    expect(screen.getByText('0')).toBeDefined()
    handle.stop()
  })
})
