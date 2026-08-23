// @vitest-environment jsdom
import { Processor } from 'foldkit'
import { readFileSync } from 'node:fs'
import { Path, demoModel, emptyModel, uriOf } from 'puzzle-core-example'
import {
  memorySyncedEngine,
  startSyncedPuzzleHandle,
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

import { ScreenApp } from './ScreenApp.js'

afterEach(() => {
  resetSyncedPuzzleHandle()
  resetScreenPuzzleHandle()
  cleanup()
})

describe('Puzzle screen window', () => {
  it('keeps ReplicateStep and live hosts on the Program screen tree', () => {
    const source = readFileSync('src/ScreenApp.tsx', 'utf8')
    expect(source).toContain('useScreen')
    expect(source).toContain('paintReact')
    expect(source).not.toContain('ReplicateStep')
    expect(source).not.toContain('github.com')
    expect(source).not.toContain('surface.live')
    expect(source).not.toContain('surface.sourceUrl')
  })

  it('paints Open menu as a dialog overlay', async () => {
    const handle = startSyncedPuzzleHandle(
      memorySyncedEngine(Processor.Host.React()),
    )
    installSyncedPuzzleHandle(handle)
    installScreenPuzzleHandle(handle)
    await waitForSyncedHandle(handle)
    render(
      <ProgramKeyBindings path={Path()}>
        <ScreenApp />
      </ProgramKeyBindings>,
    )

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
    expect(screen.queryByRole('dialog', { name: 'Action menu' })).toBeNull()

    fireEvent.keyDown(document, { key: '?' })
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Action menu' })).toBeDefined()
    })
    expect(screen.getByText(uriOf(demoModel()))).toBeDefined()
    handle.stop()
  })

  it('sends reset then yes from painted Buttons', async () => {
    const handle = startSyncedPuzzleHandle(
      memorySyncedEngine(Processor.Host.React()),
    )
    installSyncedPuzzleHandle(handle)
    installScreenPuzzleHandle(handle)
    await waitForSyncedHandle(handle)
    render(
      <ProgramKeyBindings path={Path()}>
        <ScreenApp />
      </ProgramKeyBindings>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'reset' })).toBeDefined()
    })
    fireEvent.click(screen.getByRole('button', { name: 'reset' }))
    await waitFor(() => {
      expect(screen.getByText(uriOf(emptyModel()))).toBeDefined()
    })
    fireEvent.click(screen.getByRole('button', { name: 'y' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'reset' })).toBeDefined()
    })
    handle.stop()
  })
})
