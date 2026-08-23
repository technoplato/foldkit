import { Path } from 'settings-core-example'

import {
  type PaintClassNames,
  paintReact,
  sendScreenToken,
  useScreen,
} from '@foldkit/react'

const classNames: PaintClassNames = {
  Button:
    'rounded-xl border border-neutral-300 px-6 py-3 text-2xl hover:bg-neutral-100 active:scale-95 transition',
  Column: 'flex flex-col items-center justify-center gap-6',
  Row: 'flex flex-row gap-4',
  Text: 'text-sm font-mono break-all',
}

/** Default window. Paints the host-neutral screen tree with zero business decisions. */
export const ScreenApp = () => {
  const screen = useScreen(Path())
  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-center gap-6 p-6">
      {paintReact(screen, sendScreenToken, classNames)}
    </main>
  )
}
