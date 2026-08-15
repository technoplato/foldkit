import { createApp } from 'vue'

import App from './App.vue'

const root = document.getElementById('root')
if (root === null) {
  throw new Error('Root element not found')
}

createApp(App).mount(root)
