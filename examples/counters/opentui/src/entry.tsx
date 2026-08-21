import { pathToNavigationTarget } from 'counters-core-example'
import { Array, Match as M, Option, pipe } from 'effect'

import { type CliRenderer, createCliRenderer } from '@opentui/core'
import { createRoot, useKeyboard } from '@opentui/react'

import { App } from './host.js'
import { startOpenTuiCountersHost } from './instant.js'

const FailedInstantScreen = ({
  error,
  renderer,
}: Readonly<{
  error: string
  renderer: CliRenderer
}>) => {
  useKeyboard(key => {
    if (key.name.toLowerCase() === 'q') {
      renderer.destroy()
    }
  })
  return (
    <box border borderColor="#fca5a5" flexDirection="column" padding={1}>
      <text content="Failed Instant" fg="#fca5a5" />
      <text content={error} />
      <text content="q quit" fg="#78716c" />
    </box>
  )
}

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
const root = createRoot(renderer)

if (mode === 'instant') {
  root.render(<text fg="#a8a29e">Starting Instant Multiple Counters…</text>)
  const started = await startOpenTuiCountersHost()
  M.value(started).pipe(
    M.tagsExhaustive({
      Failed: ({ error }) => {
        root.render(<FailedInstantScreen error={error} renderer={renderer} />)
      },
      Ready: ({ host }) => {
        root.render(
          <App
            host={host}
            maybeInitialTarget={maybeInitialTarget}
            renderer={renderer}
          />,
        )
      },
    }),
  )
} else {
  root.render(
    <App maybeInitialTarget={maybeInitialTarget} renderer={renderer} />,
  )
}
