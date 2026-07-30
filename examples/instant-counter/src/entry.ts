import { BrowserApp } from './client/browserApp.js'
import { makeBrowserDatabase } from './client/database.js'
import './styles.css'

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener(
    'load',
    () => {
      void navigator.serviceWorker.register('/instant-counter-sw.js')
    },
    { once: true },
  )
}

const root = document.getElementById('root')
if (root === null) {
  throw new Error('Instant counter root element was not found.')
}

try {
  const app = new BrowserApp(root, makeBrowserDatabase())
  app.start()
  window.addEventListener('pagehide', () => app.stop(), { once: true })
} catch {
  root.innerHTML = `
    <main class="auth-shell">
      <section class="auth-card">
        <p class="eyebrow">Foldkit Program | InstantDB</p>
        <h1>Configuration required</h1>
        <p class="error">Start this Client through the foldkit-instant-demo credential wrapper so VITE_INSTANT_APP_ID is available.</p>
      </section>
    </main>
  `
}
