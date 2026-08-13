import { init, update } from 'deposit-core-example'
import { Scene } from 'foldkit'
import { describe, test } from 'vitest'
import { freshWalletHostOrigin } from 'wallet-qr-example'

import { makeView } from './index.js'

describe('view', () => {
  test('renders the deposit heading', () => {
    const [model] = init()
    Scene.scene(
      { update, view: makeView(freshWalletHostOrigin) },
      Scene.with(model),
      Scene.expect(Scene.text('DEPOSIT · SOL DEVNET FIRST')).toExist(),
      Scene.expect(Scene.text('Stripe (unconfigured)')).toExist(),
    )
  })
})
