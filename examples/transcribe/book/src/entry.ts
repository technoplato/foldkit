import { Runtime } from 'foldkit'
import {
  StaticTranscribeResources,
  TranscribeProgram,
  makeLiveTranscribeResources,
} from 'transcribe-core-example'

import { overlay } from '@foldkit/devtools'
import { withHostedIdentity } from '@foldkit/instant'

import { transcribeDatabase } from './database.js'
import { view } from './view.js'

const database = transcribeDatabase()
const resources =
  database === undefined
    ? StaticTranscribeResources
    : withHostedIdentity(
        makeLiveTranscribeResources(database as never),
        database,
      )

const application = Runtime.makeFoldkitApplication({
  container: document.getElementById('root'),
  devTools: { overlay },
  program: TranscribeProgram,
  resources,
  view,
})

Runtime.run(application)
