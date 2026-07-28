import { Runtime } from 'foldkit'

import { makeConstructiveDataModelingApplication } from './application.js'
import { startForSearch } from './route.js'

const root = document.getElementById('root')
if (root === null) {
  throw new Error('Root element not found')
}

Runtime.run(
  makeConstructiveDataModelingApplication(
    root,
    startForSearch(globalThis.location.search),
  ),
)
