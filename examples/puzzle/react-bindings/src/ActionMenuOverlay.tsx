import { Match as M, Option } from 'effect'
import { Program } from 'foldkit'
import { type ListedAction, actionMenuRowLabel } from 'puzzle-core-example'

const rowStyle = (
  isFocused: boolean,
  isChosen: boolean,
  isDisabled: boolean,
): Readonly<{
  background: string
  color: string
  opacity: number
  outline: string | undefined
  padding: string
  textAlign: 'left'
}> => ({
  background: isChosen ? '#1d4ed8' : isFocused ? '#111827' : '#f3f4f6',
  color: isChosen || isFocused ? '#ffffff' : '#111827',
  opacity: isDisabled ? 0.55 : 1,
  outline: isChosen ? '2px solid #93c5fd' : undefined,
  padding: '10px 12px',
  textAlign: 'left',
})

/** Paints the Action menu from Program state. The window does not own Open. */
export const ActionMenuOverlay = ({
  menu,
  rows,
  empty,
  maybeChosen = Option.none(),
  onDismiss,
  onSelect,
}: Readonly<{
  menu: Program.ActionMenuModelValue
  rows: ReadonlyArray<ListedAction>
  empty?: boolean
  maybeChosen?: Option.Option<string>
  onDismiss: () => void
  onSelect: (token: string) => void
}>) =>
  M.value(menu).pipe(
    M.tagsExhaustive({
      Closed: () => null,
      Open: open => {
        const filtered =
          empty === true
            ? Program.FilteredEmpty()
            : { _tag: 'Matches' as const, rows }
        const maybeHighlight = Program.highlightIndex(open, filtered)
        return (
          <div
            aria-label="Action menu backdrop"
            className="fk-action-menu-backdrop"
            onClick={onDismiss}
            role="presentation"
            style={{
              alignItems: 'center',
              background: 'rgba(15, 23, 42, 0.4)',
              display: 'flex',
              inset: 0,
              justifyContent: 'center',
              position: 'fixed',
            }}
          >
            <div
              aria-label="Action menu"
              className="fk-action-menu"
              onClick={event => {
                event.stopPropagation()
              }}
              role="dialog"
              style={{
                background: '#ffffff',
                borderRadius: 12,
                boxShadow: '0 10px 40px rgba(0, 0, 0, 0.18)',
                minWidth: 280,
                padding: 16,
              }}
            >
              <p style={{ fontWeight: 600, margin: '0 0 8px' }}>Actions</p>
              {Option.isSome(open.maybeQuery) ? (
                <p style={{ color: '#4b5563', margin: '0 0 12px' }}>
                  {open.maybeQuery.value}
                </p>
              ) : null}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {empty === true ? (
                  <p aria-label="Empty">Empty</p>
                ) : (
                  rows.map((row, index) => {
                    const isFocused =
                      Option.isSome(maybeHighlight) &&
                      maybeHighlight.value === index
                    const isChosen =
                      Option.isSome(maybeChosen) &&
                      maybeChosen.value === row.token
                    return (
                      <button
                        disabled={row.disabled}
                        key={row.token}
                        onClick={() => {
                          onSelect(row.token)
                        }}
                        style={rowStyle(isFocused, isChosen, row.disabled)}
                        type="button"
                      >
                        {actionMenuRowLabel(row)}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        )
      },
    }),
  )
