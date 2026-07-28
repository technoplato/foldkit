import { Effect } from 'effect'
import * as Program from 'foldkit/program'

import { modelForWalletIntent } from './init.js'
import { WalletIntentRouteError, walletIntentRouter } from './intent.js'
import type { Message } from './message.js'
import type { Model } from './model.js'
import { WalletProgram } from './program.js'

const walletProgramRouter = Program.makeRouter(WalletProgram)

/** Parses every global relative URI accepted by the Wallet Program. */
export const parseWalletProgramRoute = (
  relativePath: string,
): Effect.Effect<
  Program.ProgramRoute<Model, Message>,
  Program.ProgramRouteError | WalletIntentRouteError
> => {
  if (relativePath.startsWith('/wallet/intent/')) {
    return walletIntentRouter
      .parse(relativePath)
      .pipe(Effect.map(intent => Program.state(modelForWalletIntent(intent))))
  } else {
    return walletProgramRouter.parse(relativePath)
  }
}
