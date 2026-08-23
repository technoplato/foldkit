import { StrictMode } from 'react'
import { Path, SettingsOriginTest } from 'settings-core-example'
import { afterEach, describe, expect, it } from 'vitest'

import { paintReact } from '@foldkit/react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

import {
  createSettingsHandle,
  installScreenSettingsHandle,
  installSettingsHandle,
  resetScreenSettingsHandle,
  resetSettingsHandle,
  sendScreenToken,
  useScreen,
} from './index.js'

const ScreenWindow = () => paintReact(useScreen(Path()), sendScreenToken)

let liveHandle: ReturnType<typeof createSettingsHandle> | undefined

afterEach(() => {
  void liveHandle?.stop?.()
  liveHandle = undefined
  resetSettingsHandle()
  resetScreenSettingsHandle()
  cleanup()
})

describe('Settings React bindings', () => {
  it('paints Settings and Public ingest through one Processor', async () => {
    liveHandle = createSettingsHandle(SettingsOriginTest)
    installSettingsHandle(liveHandle)
    installScreenSettingsHandle(liveHandle)

    render(
      <StrictMode>
        <ScreenWindow />
      </StrictMode>,
    )

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeDefined()
    })
    expect(screen.getByText('ingest.knophy.com')).toBeDefined()
    expect(screen.getAllByText('Public').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'r' })).toBeDefined()
  })
})
