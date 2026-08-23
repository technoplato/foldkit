import { Runtime } from 'foldkit'
import { SettingsOriginHttpLive, SettingsProgram } from 'settings-core-example'

import { overlay } from '@foldkit/devtools'

import { view } from './mobile.js'

const application = Runtime.makeFoldkitApplication({
  container: document.getElementById('root'),
  devTools: {
    overlay,
  },
  program: SettingsProgram,
  resources: SettingsOriginHttpLive,
  view,
})

Runtime.run(application)
