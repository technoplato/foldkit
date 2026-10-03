import { mount } from 'svelte'

import App from './App.svelte'

const root = document.getElementById('root')
if (root === null) {
  throw new Error('Root element not found')
}

mount(App, { target: root })
