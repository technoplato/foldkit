import {
  GotWalletMessage,
  SyncedBrandon,
  brandonWalletNetworks,
} from 'brandon-core-example'
import { startBrandon } from 'brandon-core-example/live'
import { Effect, Layer, Scope } from 'effect'
import { Processor, Runtime } from 'foldkit'
import 'wallet-foldkit-example/styles.css'
import { makeLiveWalletClientLayer } from 'wallet-live-client-example'
import {
  WalletWebClipboard,
  makeOwnerScopedBrowserWalletResources,
} from 'wallet-web-client-example'

import { liveBrandonServer, loadWalletOwnerKey } from './server.js'
import './styles.css'
import { view } from './view.js'

const instanceLength = 8

const handle = startBrandon({
  appId: import.meta.env['VITE_INSTANT_APP_ID'],
  host: Processor.Host.Foldkit(),
  instance: globalThis.crypto
    .randomUUID()
    .replaceAll('-', '')
    .slice(0, instanceLength),
  resources: Layer.mergeAll(
    liveBrandonServer,
    makeLiveWalletClientLayer(brandonWalletNetworks),
    makeOwnerScopedBrowserWalletResources(loadWalletOwnerKey),
    WalletWebClipboard,
  ),
})

Effect.runFork(
  Runtime.makeAttachedFoldkitApplication({
    ClientInput: GotWalletMessage,
    container: document.getElementById('root'),
    program: SyncedBrandon,
    sendClientInput: message => {
      handle.send(message)
    },
    source: {
      readModel: handle.readModel,
      subscribe: listener =>
        handle.subscribe(() => {
          listener(handle.readModel())
        }),
    },
    view,
  }).pipe(Effect.provideService(Scope.Scope, Effect.runSync(Scope.make()))),
)
