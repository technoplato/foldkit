import { CounterList } from 'counters-core-example'

import { createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'

import { App } from './host.js'

const renderer = await createCliRenderer({
  consoleMode: 'disabled',
  exitOnCtrlC: true,
})

createRoot(renderer).render(
  <App initialNavigation={CounterList.make({})} renderer={renderer} />,
)
