import { Path, surfaceFor } from 'counter-core-example'
import {
  ActionMenuOverlay,
  useActionMenu,
} from 'counter-react-bindings-example'

import {
  type PaintClassNames,
  paintReact,
  sendScreenToken,
  useScreen,
} from '@foldkit/react'

import { HostHeader } from './hostHeader.js'

const classNames: PaintClassNames = {
  Button:
    'rounded-xl border border-neutral-300 px-6 py-3 text-2xl hover:bg-neutral-100 active:scale-95 transition',
  Column: 'flex flex-col items-center justify-center gap-6',
  Row: 'flex flex-row gap-4',
  Text: 'text-6xl font-semibold tabular-nums',
}

/** Default window. Paints the host-neutral screen tree with zero business decisions. */
export const ScreenApp = () => {
  const screen = useScreen(Path())
  const { menu, rows, empty, maybeChosen, dismiss, select } = useActionMenu()
  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-center gap-6 p-6">
      <HostHeader {...surfaceFor('react-screen')} />
      {paintReact(screen, sendScreenToken, classNames)}
      <ActionMenuOverlay
        empty={empty}
        maybeChosen={maybeChosen}
        menu={menu}
        rows={rows}
        onDismiss={dismiss}
        onSelect={select}
      />
    </main>
  )
}
