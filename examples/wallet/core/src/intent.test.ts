import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import { SendAssetIntent, walletIntentRouter } from './intent.js'

describe('walletIntentRouter', () => {
  it('round-trips one generic asset transfer intent', async () => {
    const intent = SendAssetIntent.make({
      accountId: 'account-1',
      assetId: 'ethereum:sepolia:eth',
      atomicUnits: '1000',
      destinationAddress: '0x1234',
    })
    const route = await Effect.runPromise(walletIntentRouter.print(intent))
    const parsed = await Effect.runPromise(walletIntentRouter.parse(route))

    expect(route).toBe(
      '/wallet/intent/send?account=account-1&asset=ethereum%3Asepolia%3Aeth&amount=1000&to=0x1234',
    )
    expect(parsed).toEqual(intent)
  })

  it('rejects a non-atomic amount', async () => {
    const result = await Effect.runPromiseExit(
      walletIntentRouter.parse(
        'wallet/intent/send?account=a&asset=b&amount=1.5&to=c',
      ),
    )

    expect(result._tag).toBe('Failure')
  })
})
