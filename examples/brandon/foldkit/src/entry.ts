import { SyncedBrandon } from 'brandon-core-example'
import { startBrandon } from 'brandon-core-example/live'
import { Effect, Schema as S, Scope } from 'effect'
import { Processor, Runtime } from 'foldkit'

import { liveBrandonServer } from './server.js'
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
  server: liveBrandonServer,
})

Effect.runFork(
  Runtime.makeAttachedFoldkitApplication({
    ClientInput: S.Never,
    container: document.getElementById('root'),
    program: SyncedBrandon,
    sendClientInput: () => {},
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
