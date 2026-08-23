import { Path, describeCounterSyncError } from 'counter-core-example'
import {
  ActionMenuOverlay,
  useActionMenu,
} from 'counter-react-bindings-example'
import { Match as M } from 'effect'
import type { ReactNode } from 'react'

import {
  type PaintClassNames,
  paintReact,
  sendScreenToken,
  useModel,
  useScreen,
} from '@foldkit/react'

const classNames: PaintClassNames = {
  Button:
    'h-12 bg-black px-4 text-sm font-medium text-white transition hover:bg-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900',
  Column: 'flex flex-col items-center justify-center gap-6',
  Row: 'grid grid-cols-3 gap-3',
  Text: 'text-7xl font-semibold tabular-nums',
}

/** Paints counterScreen through useScreen. Host chrome lives in the Program if at all. */
export const App = () => {
  const view = useModel(Path())
  const screen = useScreen(Path())
  const { menu, rows, empty, maybeChosen, dismiss, select } = useActionMenu()
  return M.value(view).pipe(
    M.tagsExhaustive({
      Starting: () => <Status>Starting Instant Counter…</Status>,
      Failed: ({ error }) => (
        <Status>
          <p>{describeCounterSyncError(error)}</p>
        </Status>
      ),
      Ready: () => (
        <main className="min-h-screen bg-white text-gray-900 flex items-center justify-center p-6">
          <section className="w-full max-w-sm text-center space-y-6">
            {paintReact(screen, sendScreenToken, classNames)}
          </section>
          <ActionMenuOverlay
            empty={empty}
            maybeChosen={maybeChosen}
            menu={menu}
            rows={rows}
            onDismiss={dismiss}
            onSelect={select}
          />
        </main>
      ),
    }),
  )
}

const Status = ({ children }: Readonly<{ children: ReactNode }>) => (
  <main className="min-h-screen bg-white text-gray-900 flex items-center justify-center p-6">
    <section className="w-full max-w-sm text-center space-y-4">
      {children}
    </section>
  </main>
)
