import { pathToNavigationTarget } from 'counters-core-example'
import { Array, Option, pipe } from 'effect'

import { createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'

import { App } from './host.js'
import { startOpenTuiCountersHost } from './instant.js'

const renderer = await createCliRenderer({
  consoleMode: 'disabled',
  exitOnCtrlC: true,
})

const maybeCarrier = pipe(
  Array.drop(process.argv, 2),
  Array.dropWhile(argument => argument === '--'),
  Array.head,
)
const maybeInitialTarget = Option.map(maybeCarrier, pathToNavigationTarget)

const mode = process.env['COUNTERS_TAPE'] ?? process.env['COUNTER_TAPE']
const maybeHost = mode === 'instant' ? await startOpenTuiCountersHost() : null

createRoot(renderer).render(
  maybeHost === null ? (
    <App maybeInitialTarget={maybeInitialTarget} renderer={renderer} />
  ) : (
    <App
      host={maybeHost}
      maybeInitialTarget={maybeInitialTarget}
      renderer={renderer}
    />
  ),
)
