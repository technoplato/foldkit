import {
  AdvocacyProgram,
  DelayedAdvocacyResources,
  coreAdvocacyClient,
  liveAdvocacyResources,
} from 'advocacy-core-example'
import { Runtime } from 'foldkit'

import { overlay } from '@foldkit/devtools'
import { withHostedIdentity } from '@foldkit/instant'

import { advocacyDatabase } from './database.js'
import { view } from './index.js'

const database = advocacyDatabase()
const resources =
  database === undefined
    ? DelayedAdvocacyResources
    : withHostedIdentity(
        liveAdvocacyResources(coreAdvocacyClient(database)),
        database,
      )

const application = Runtime.makeFoldkitApplication({
  container: document.getElementById('root'),
  devTools: {
    overlay,
  },
  program: AdvocacyProgram,
  resources,
  view,
})

Runtime.run(application)
