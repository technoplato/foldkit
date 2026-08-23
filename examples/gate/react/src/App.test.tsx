import { GateOriginTest } from 'gate-core-example'
import {
  createGateHandle,
  installGateHandle,
  installScreenGateHandle,
  resetGateHandle,
  resetScreenGateHandle,
} from 'gate-react-bindings-example'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'

import { cleanup, render, screen, waitFor } from '@testing-library/react'

import { App } from './App.js'

const sourceOf = (name: string): string =>
  readFileSync(new URL(name, import.meta.url), 'utf8')

let liveHandle: ReturnType<typeof createGateHandle> | undefined

afterEach(() => {
  void liveHandle?.stop?.()
  liveHandle = undefined
  resetGateHandle()
  resetScreenGateHandle()
  cleanup()
})

describe('Gate React host', () => {
  it('paints gateScreen through useScreen and paintReact', async () => {
    liveHandle = createGateHandle(GateOriginTest)
    installGateHandle(liveHandle)
    installScreenGateHandle(liveHandle)
    render(<App />)

    await waitFor(() => {
      expect(
        screen.getByText('Rate remaining 40 of 60 resets 60000'),
      ).toBeDefined()
    })
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDefined()
    expect(screen.queryByText('gate.grok.me')).toBeNull()
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
