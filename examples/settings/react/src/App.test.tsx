import { readFileSync } from 'node:fs'
import { SettingsOriginTest } from 'settings-core-example'
import {
  createSettingsHandle,
  installScreenSettingsHandle,
  installSettingsHandle,
  resetScreenSettingsHandle,
  resetSettingsHandle,
} from 'settings-react-bindings-example'
import { afterEach, describe, expect, it } from 'vitest'

import { cleanup, render, screen, waitFor } from '@testing-library/react'

import { App } from './App.js'

const sourceOf = (name: string): string =>
  readFileSync(new URL(name, import.meta.url), 'utf8')

let liveHandle: ReturnType<typeof createSettingsHandle> | undefined

afterEach(() => {
  void liveHandle?.stop?.()
  liveHandle = undefined
  resetSettingsHandle()
  resetScreenSettingsHandle()
  cleanup()
})

describe('Settings React host', () => {
  it('paints settingsScreen through useScreen and paintReact', async () => {
    liveHandle = createSettingsHandle(SettingsOriginTest)
    installSettingsHandle(liveHandle)
    installScreenSettingsHandle(liveHandle)
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('ingest.knophy.com')).toBeDefined()
    })
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDefined()
    expect(screen.getByText('ingest.knophy.com')).toBeDefined()
  })

  it('does not invent GitHub chrome or host URL lists', () => {
    const sources = [
      sourceOf('./App.tsx'),
      sourceOf('./ScreenApp.tsx'),
      sourceOf('./main.tsx'),
    ]
    for (const source of sources) {
      expect(source).not.toMatch(/github\.com/i)
      expect(source).not.toContain('HostHeader')
      expect(source).not.toContain('formatHostChrome')
    }
    expect(sourceOf('./ScreenApp.tsx')).toContain('useScreen(Path())')
    expect(sourceOf('./ScreenApp.tsx')).toContain('paintReact(')
  })
})
