import { Runtime } from 'foldkit'
import {
  OrbitProgram,
  StaticOrbitResources,
  makeLiveOrbitResources,
} from 'orbit-core-example'

import { overlay } from '@foldkit/devtools'
import { withHostedIdentity } from '@foldkit/instant'

import { orbitDatabase } from './database.js'
import { view } from './view.js'

const database = orbitDatabase()
const resources =
  database === undefined
    ? StaticOrbitResources
    : withHostedIdentity(makeLiveOrbitResources(database), database)

const application = Runtime.makeFoldkitApplication({
  container: document.getElementById('root'),
  devTools: {
    overlay,
  },
  program: OrbitProgram,
  resources,
  view,
})

Runtime.run(application)
