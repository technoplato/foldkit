import { Scene } from 'foldkit'
import { init, update } from 'vending-core-example'
import { describe, test } from 'vitest'
import { freshWalletHostOrigin } from 'wallet-qr-example'

import { makeView } from './index.js'

describe('view', () => {
  test('renders the clip and listed price', () => {
    const [model] = init()
    Scene.scene(
      { update, view: makeView(freshWalletHostOrigin) },
      Scene.with(model),
      Scene.expect(Scene.text('the clip')).toExist(),
      Scene.expect(Scene.text('14.28')).toExist(),
      Scene.expect(Scene.text('VENDING · KNOPHY')).toExist(),
    )
  })
})
