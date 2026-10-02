import { Match as M, Option } from 'effect'
import { type ReactElement, createContext, useContext, useMemo } from 'react'

import { useBound } from '@foldkit/react/interaction'
import { useViewAt } from '@foldkit/react/navigation'

import { ActionMenuSheet } from '../interaction/actionMenuModal.js'
import { type PaintStyles, paintTree } from '../interaction/screen.js'

// ENTRY

const noStyles: PaintStyles = {}

/** The paint styles every stack entry screen merges. */
export const EntryStylesContext = createContext<PaintStyles>(noStyles)

/**
 * Paints one stack entry by key: its screen tree, or the action menu over
 * a dimmed backdrop. Both native stacks render it inside each route.
 *
 * @example
 * ```tsx
 * <EntryView entryKey={route.key} />
 * ```
 */
export const EntryView = ({
  entryKey,
}: Readonly<{ entryKey: string }>): ReactElement | null => {
  const bound = useBound()
  const styles = useContext(EntryStylesContext)
  const maybeView = useViewAt(entryKey)
  return useMemo(
    () =>
      Option.match(maybeView, {
        onNone: () => null,
        onSome: view =>
          M.value(view).pipe(
            M.withReturnType<ReactElement>(),
            M.tagsExhaustive({
              Screen: ({ node }) =>
                paintTree(node, {
                  styles,
                  onPress: button => {
                    if (button.action !== undefined) {
                      bound.press(button.action)
                    }
                  },
                }),
              Menu: ({ menu }) => <ActionMenuSheet menu={menu} />,
            }),
          ),
      }),
    [bound, maybeView, styles],
  )
}

/** Paint styles for {@link EntryView}, or the neutral defaults. */
export const entryStylesOf = (styles: PaintStyles | undefined): PaintStyles =>
  styles ?? noStyles
