import {
  SyncedCounter,
  newProcessorInstance,
  startCounter,
} from 'counter-core-example'
import { Interaction, Processor } from 'foldkit'
import { createRoot } from 'react-dom/client'
import { Link, Route, Routes, useLocation } from 'react-router'

import { ProgramProvider, useKeyBindings } from '@foldkit/react/interaction'
import { NavigationFrame, useDocumentTitle } from '@foldkit/react/navigation'
import { FoldkitRouter } from '@foldkit/react/react-router'

const bootedAt = new Date().toISOString()

const handle = startCounter({
  host: Processor.Host.React(),
  instance: newProcessorInstance(),
})

const Chrome = () => {
  useKeyBindings()
  useDocumentTitle()
  const location = useLocation()
  return (
    <nav style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
      <Link to="/counter">Counter</Link>
      <Link to="/about">About</Link>
      <span data-testid="booted">booted {bootedAt}</span>
      <span data-testid="router-location">
        router at {location.pathname}
        {location.search}
      </span>
    </nav>
  )
}

const About = () => (
  <section>
    <h1>About this app</h1>
    <p>This page belongs to the app, not the Counter Program.</p>
    <Link to="/counter">Back to counter</Link>
  </section>
)

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <ProgramProvider bound={Interaction.bind(SyncedCounter, handle)}>
    <FoldkitRouter>
      <Chrome />
      <Routes>
        <Route path="/about" element={<About />} />
        <Route path="*" element={<NavigationFrame />} />
      </Routes>
    </FoldkitRouter>
  </ProgramProvider>,
)
