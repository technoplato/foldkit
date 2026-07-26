import { type CounterDetailMode } from 'counters-core-example'
import { useMultipleCountersActions } from 'counters-react-bindings-example'
import { Match as M } from 'effect'
import { type MouseEvent, type ReactNode, useEffect } from 'react'

import { FactStatusView } from './view.js'

/** React-A maps both detail modes into one custom modal shell. */
export const ReactAPresentation = ({
  counterId,
  mode,
}: Readonly<{ counterId: string; mode: CounterDetailMode }>) => {
  const actions = useMultipleCountersActions()
  return M.value(mode).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      CounterFactAlert: ({ status }) => (
        <ModalShell
          dismissed={actions.dismissedCounterFactAlert}
          label="Counter fact"
          tone="Fact"
        >
          <FactStatusView status={status} />
          <button
            className="primary-button mt-6 w-full"
            onClick={actions.dismissedCounterFactAlert}
            type="button"
          >
            Dismiss
          </button>
        </ModalShell>
      ),
      DeleteCounterConfirmation: () => (
        <ModalShell
          dismissed={actions.cancelledDeleteCounter}
          label={`Delete ${counterId}`}
          tone="Destructive"
        >
          <h2 className="text-xl font-semibold">Delete {counterId}?</h2>
          <p className="mt-2 text-stone-400">This cannot be undone.</p>
          <div className="mt-6 flex gap-2">
            <button
              className="secondary-button flex-1"
              onClick={actions.cancelledDeleteCounter}
              type="button"
            >
              Cancel
            </button>
            <button
              className="destructive-button flex-1"
              onClick={actions.confirmedDeleteCounter}
              type="button"
            >
              Delete
            </button>
          </div>
        </ModalShell>
      ),
    }),
  )
}

const ModalShell = ({
  children,
  dismissed,
  label,
  tone,
}: Readonly<{
  children: ReactNode
  dismissed: () => void
  label: string
  tone: 'Fact' | 'Destructive'
}>) => {
  useEffect(() => {
    const pressedKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dismissed()
      }
    }
    window.addEventListener('keydown', pressedKey)
    return () => window.removeEventListener('keydown', pressedKey)
  }, [dismissed])

  const clickedBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      dismissed()
    }
  }
  const toneClassName =
    tone === 'Fact'
      ? 'border-sky-700/60 bg-sky-950'
      : 'border-red-700/60 bg-stone-950'

  return (
    <div
      aria-label={label}
      aria-modal="true"
      className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-5"
      onClick={clickedBackdrop}
      role="dialog"
    >
      <section
        className={`w-full max-w-md rounded-3xl border p-7 shadow-2xl ${toneClassName}`}
      >
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.18em] text-stone-400">
          React-A | unified modal
        </p>
        {children}
      </section>
    </div>
  )
}
