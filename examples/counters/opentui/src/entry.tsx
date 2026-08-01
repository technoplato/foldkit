import { pathToNavigationTarget } from 'counters-core-example'
import { Array, Option, pipe } from 'effect'

import { createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'

import { App } from './host.js'

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

createRoot(renderer).render(
  <App maybeInitialTarget={maybeInitialTarget} renderer={renderer} />,
)
