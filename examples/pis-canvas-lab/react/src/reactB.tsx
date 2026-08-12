import { type CounterDetailMode } from 'counters-core-example'
import { useMultipleCountersActions } from 'pis-canvas-lab-react-bindings-example'
import { Match as M } from 'effect'
import { type MouseEvent, type ReactNode, useEffect, useRef } from 'react'

import { FactStatusView, ReplayControls } from './view.js'

/** React-B maps each detail mode to the platform surface that fits its meaning. */
export const ReactBPresentation = ({
  counterId,
  mode,
}: Readonly<{ counterId: string; mode: CounterDetailMode }>) =>
  M.value(mode).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      CounterFactAlert: ({ status }) => <FactSheet status={status} />,
      DeleteCounterConfirmation: () => (
        <DeleteCounterConfirmationDialog counterId={counterId} />
      ),
    }),
  )

const FactSheet = ({
  status,
}: Readonly<{
  status: import('counters-core-example').CounterFactStatus
}>) => {
  const actions = useMultipleCountersActions()
  useEffect(() => {
    const pressedKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        actions.dismissedCounterFactAlert()
      }
    }
    window.addEventListener('keydown', pressedKey)
    return () => window.removeEventListener('keydown', pressedKey)
  }, [actions])

  const clickedBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      actions.dismissedCounterFactAlert()
    }
  }
  return (
    <div
      className="fixed inset-0 z-40 flex bg-black/60"
      onClick={clickedBackdrop}
      role="presentation"
    >
      <aside
        aria-label="Counter fact"
        aria-modal="true"
        className="mt-auto w-full rounded-t-3xl border border-sky-700/60 bg-sky-950 p-7 shadow-2xl sm:ml-auto sm:mt-0 sm:w-[min(30rem,90vw)] sm:rounded-none sm:border-y-0 sm:border-r-0 sm:pt-24"
        role="dialog"
      >
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.18em] text-sky-300/70">
          React-B | fact sheet
        </p>
        <FactStatusView status={status} />
        <button
          className="primary-button mt-6 w-full"
          onClick={actions.dismissedCounterFactAlert}
          type="button"
        >
          Dismiss
        </button>
      </aside>
    </div>
  )
}

const DeleteCounterConfirmationDialog = ({
  counterId,
}: Readonly<{ counterId: string }>) => {
  const actions = useMultipleCountersActions()
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog !== null && !dialog.open) {
      dialog.showModal()
    }
    return () => {
      if (dialog !== null && dialog.open) {
        dialog.close()
      }
    }
  }, [])

  const clickedBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) {
      actions.cancelledDeleteCounter()
    }
  }

  return (
    <dialog
      aria-labelledby="delete-counter-title"
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-3xl border border-red-700/60 bg-stone-950 p-7 text-stone-100 shadow-2xl backdrop:bg-black/70"
      onCancel={event => {
        event.preventDefault()
        actions.cancelledDeleteCounter()
      }}
      onClick={clickedBackdrop}
      ref={dialogRef}
    >
      <p className="mb-4 font-mono text-xs uppercase tracking-[0.18em] text-red-300/70">
        React-B | native dialog
      </p>
      <h2 className="text-xl font-semibold" id="delete-counter-title">
        Delete {counterId}?
      </h2>
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
      <ReplayControls />
    </dialog>
  )
}
