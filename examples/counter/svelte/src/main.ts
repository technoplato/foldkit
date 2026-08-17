import { mount } from 'svelte'

import App from './App.svelte'
import { startInstantCounter } from './instantHost.js'

startInstantCounter()

const root = document.getElementById('root')
if (root === null) {
  throw new Error('Root element not found')
}

mount(App, { target: root })
