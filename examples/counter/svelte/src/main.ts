import { surfaceFor } from 'counter-core-example'
import { mount } from 'svelte'

import App from './App.svelte'
import { startInstantCounter } from './instantHost.js'

document.title = surfaceFor('svelte').title
startInstantCounter()

const root = document.getElementById('root')
if (root === null) {
  throw new Error('Root element not found')
}

mount(App, { target: root })
