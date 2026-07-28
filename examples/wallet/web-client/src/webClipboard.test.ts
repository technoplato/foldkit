import { Effect } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WalletClipboard } from 'wallet-core-example'

import { WalletWebClipboard } from './webClipboard.js'

const writeText = (value: string) =>
  WalletClipboard.pipe(
    Effect.flatMap(clipboard => clipboard.writeText(value)),
    Effect.provide(WalletWebClipboard),
  )

describe('WalletWebClipboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('writes public text through the browser clipboard', async () => {
    const clipboardWriteText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('isSecureContext', true)
    vi.stubGlobal('navigator', { clipboard: { writeText: clipboardWriteText } })

    await Effect.runPromise(writeText('wallet-address'))

    expect(clipboardWriteText).toHaveBeenCalledWith('wallet-address')
  })

  it('normalizes a browser denial', async () => {
    vi.stubGlobal('isSecureContext', true)
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: () =>
          Promise.reject(new DOMException('Denied', 'NotAllowedError')),
      },
    })

    const error = await Effect.runPromise(Effect.flip(writeText('address')))

    expect(error.code).toBe('Denied')
  })

  it('reports an unavailable clipboard', async () => {
    vi.stubGlobal('isSecureContext', false)
    vi.stubGlobal('navigator', {})

    const error = await Effect.runPromise(Effect.flip(writeText('address')))

    expect(error.code).toBe('Unavailable')
  })

  it('normalizes a non-permission browser failure', async () => {
    vi.stubGlobal('isSecureContext', true)
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: () => Promise.reject(new Error('Clipboard device failed')),
      },
    })

    const error = await Effect.runPromise(Effect.flip(writeText('address')))

    expect(error.code).toBe('Failed')
  })
})
