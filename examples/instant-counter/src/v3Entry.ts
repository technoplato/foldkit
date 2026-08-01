import { makeBrowserDatabase } from './client/database.js'
import './styles.css'
import { MultipleCountersV3BrowserApp } from './v3Demo/browser/app.js'
import { stopMultipleCountersV3BrowserAppOnPageHide } from './v3Demo/browser/pageLifecycle.js'

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
const instantAppId = import.meta.env['VITE_INSTANT_APP_ID']

if (root === null || instantAppId === undefined || instantAppId.length === 0) {
  throw new Error(
    'The v3 Instant Multiple Counters Client requires a root and VITE_INSTANT_APP_ID.',
  )
}

const app = new MultipleCountersV3BrowserApp(
  root,
  makeBrowserDatabase(),
  instantAppId,
)

void app.start().catch(async () => {
  await app.stop().catch(() => undefined)
  root.innerHTML =
    '<main class="auth-shell"><section class="auth-card"><p class="eyebrow">Foldkit Program | InstantDB</p><h1>Client startup failed</h1><p class="error">Confirm the v3 schema, permissions, and headless authority are running.</p></section></main>'
})

window.addEventListener('pagehide', event => {
  stopMultipleCountersV3BrowserAppOnPageHide(app, event)
})
