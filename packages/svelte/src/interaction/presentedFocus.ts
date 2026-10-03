import { Array, Option } from 'effect'
import { Interaction } from 'foldkit'

const enabledButtonsOf = (
  root: HTMLElement,
): ReadonlyArray<HTMLButtonElement> =>
  globalThis.Array.from(
    root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
  )

const steppedIndex = (
  maybeCurrent: Option.Option<number>,
  move: 'Next' | 'Previous',
  count: number,
): number =>
  Option.match(maybeCurrent, {
    onNone: () => (move === 'Next' ? 0 : count - 1),
    onSome: current =>
      (current + (move === 'Next' ? 1 : -1) + count) % Math.max(count, 1),
  })

/**
 * A Svelte action for a screen presented over the page, such as "Delete
 * Counter 3?". It takes the keyboard when the screen opens, on its first
 * button, and keeps it: Tab and the arrows move between its buttons as
 * `Interaction.presentedFocusMoveOf` decides, Enter presses, and Escape
 * goes back through the Program.
 *
 * @example
 * ```svelte
 * <div class="fk-overlay" role="dialog" use:presentedFocus>...</div>
 * ```
 */
export const presentedFocus = (
  root: HTMLElement,
): Readonly<{ destroy: () => void }> => {
  Option.map(Array.head(enabledButtonsOf(root)), button => {
    button.focus()
  })
  const onKeyDown = (event: KeyboardEvent): void => {
    Option.map(
      Interaction.presentedFocusMoveOf(
        Interaction.keyInput(event.key, {
          isMeta: event.metaKey,
          isControl: event.ctrlKey,
          isShift: event.shiftKey,
        }),
      ),
      move => {
        const buttons = enabledButtonsOf(root)
        Option.map(
          Array.get(
            buttons,
            steppedIndex(
              Array.findFirstIndex(
                buttons,
                button => button === document.activeElement,
              ),
              move,
              buttons.length,
            ),
          ),
          button => {
            event.preventDefault()
            button.focus()
          },
        )
      },
    )
  }
  root.addEventListener('keydown', onKeyDown)
  return {
    destroy: () => {
      root.removeEventListener('keydown', onKeyDown)
    },
  }
}
