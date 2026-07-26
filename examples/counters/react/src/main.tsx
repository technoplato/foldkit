import { CounterList, urlToNavigation } from 'counters-core-example'
import { Option } from 'effect'
import { fromString } from 'foldkit/url'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App, type Presenter } from './App.js'
import './styles.css'

const maybeUrl = fromString(window.location.href)
const initialNavigation = Option.isSome(maybeUrl)
  ? urlToNavigation(maybeUrl.value)
  : CounterList.make({})
const presenter: Presenter =
  new URL(window.location.href).searchParams.get('presenter') === 'b'
    ? 'ReactB'
    : 'ReactA'

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <App initialNavigation={initialNavigation} presenter={presenter} />
  </StrictMode>,
)
