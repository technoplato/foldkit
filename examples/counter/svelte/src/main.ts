import { mount } from 'svelte'

import App from './App.svelte'
import { startInstantCounterWindow } from './instantHost.js'

const instantAppId = import.meta.env.VITE_INSTANT_APP_ID
if (typeof instantAppId === 'string' && instantAppId !== '') {
  startInstantCounterWindow(instantAppId)
}

const root = document.getElementById('root')
if (root === null) {
  throw new Error('Root element not found')
}

mount(App, { target: root })
