import { CounterList, pathToNavigation } from 'counters-core-example'
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
const initialNavigation = Option.isSome(maybeCarrier)
  ? pathToNavigation(maybeCarrier.value)
  : CounterList.make({})

createRoot(renderer).render(
  <App initialNavigation={initialNavigation} renderer={renderer} />,
)
