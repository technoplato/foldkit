import { surfaceFor } from 'puzzle-core-example'
import { mount } from 'svelte'

import App from './App.svelte'
import { startInstantPuzzle } from './instantHost.js'

document.title = surfaceFor('svelte').title
startInstantPuzzle()

const root = document.getElementById('root')
if (root === null) {
  throw new Error('Root element not found')
}

mount(App, { target: root })
