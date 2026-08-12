import { createRoot } from 'react-dom/client'

import { MultipleCountersV3ReactApp } from './app.js'
import '../../styles.css'

const root = document.querySelector('#root')
if (root === null) {
  throw new Error('The React Instant Client root is missing.')
}

createRoot(root).render(<MultipleCountersV3ReactApp />)
