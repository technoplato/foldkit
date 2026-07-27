import { Effect, Option } from 'effect'
import * as Program from 'foldkit/program'
import {
  TappedWalletButton,
  init as initShowcase,
  update as updateShowcase,
} from 'showcase-core-example'
import { describe, expect, it } from 'vitest'
import { WalletProgram as CoreWalletProgram } from 'wallet-core-example'

import { nativeNavigationReconciliation } from '../nativeNavigationComparison/navigationReconciliation'
import { WalletProgram } from './walletProgram'

describe('Expo Wallet Program integration', () => {
  it('routes the exact exported Wallet Program object', async () => {
    expect(WalletProgram).toBe(CoreWalletProgram)

    const router = Program.makeRouter(WalletProgram)
    const [initialModel] = WalletProgram.init()
    const statePath = await Effect.runPromise(
      router.print(Program.state(initialModel)),
    )
    const route = await Effect.runPromise(router.parse(statePath))

    expect(route._tag).toBe('State')
    if (route._tag === 'State') {
      expect(route.model).toStrictEqual(initialModel)
    }
  })

  it('projects the Wallet navigation fact into the native scene stack', () => {
    const [homeModel] = initShowcase()
    const [walletModel] = updateShowcase(homeModel, TappedWalletButton())
    const reconciliation = nativeNavigationReconciliation({
      isProgramHome: walletModel.navigation._tag === 'HomeScene',
      maybePendingTransition: Option.none(),
      nativeRoute: 'Home',
    })

    expect(walletModel.navigation._tag).toBe('WalletScene')
    expect(reconciliation._tag).toBe('PushedNativeScene')
  })
})
