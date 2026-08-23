import { GateOriginTest, Path } from 'gate-core-example'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { paintReact } from '@foldkit/react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

import {
  createGateHandle,
  installGateHandle,
  installScreenGateHandle,
  resetGateHandle,
  resetScreenGateHandle,
  sendScreenToken,
  useScreen,
} from './index.js'

const ScreenWindow = () => paintReact(useScreen(Path()), sendScreenToken)

let liveHandle: ReturnType<typeof createGateHandle> | undefined

afterEach(() => {
  void liveHandle?.stop?.()
  liveHandle = undefined
  resetGateHandle()
  resetScreenGateHandle()
  cleanup()
})

describe('Gate React bindings', () => {
  it('paints sample Read through one Processor', async () => {
    liveHandle = createGateHandle(GateOriginTest)
    installGateHandle(liveHandle)
    installScreenGateHandle(liveHandle)

    render(
      <StrictMode>
        <ScreenWindow />
      </StrictMode>,
    )

    await waitFor(() => {
      expect(
        screen.getByText('Rate remaining 40 of 60 resets 60000'),
      ).toBeDefined()
    })
    expect(
      screen.getByText('Messages remaining 10 of 20 resets 86400000'),
    ).toBeDefined()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDefined()
    expect(screen.queryByText('gate.grok.me')).toBeNull()
  })
})
