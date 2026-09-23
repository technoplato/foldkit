import { ProgramProvider } from '@foldkit/react/interaction'

import { App } from './src/App'
import './src/polyfill'
import { startExpoCounter } from './src/startExpoCounter'

const bound = startExpoCounter()

/** Expo root: one running Counter, provided to the generic adapter. */
export default function Root() {
  return (
    <ProgramProvider bound={bound}>
      <App />
    </ProgramProvider>
  )
}
