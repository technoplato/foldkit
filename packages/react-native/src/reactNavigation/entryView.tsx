import { Match as M, Option } from 'effect'
import { Navigation, Session } from 'foldkit'
import { type ReactElement, createContext, useContext, useMemo } from 'react'
import { Pressable, View } from 'react-native'

import { useBound } from '@foldkit/react/interaction'
import { useNavigationPlan, useViewAt } from '@foldkit/react/navigation'

import { ActionMenuSheet } from '../interaction/actionMenuModal.js'
import { ScreenFrame } from '../interaction/frame.js'
import type { PaintHandlers, PaintStyles } from '../interaction/paint.js'
import { openLinkOf } from '../interaction/screen.js'
import { WhenReady } from '../interaction/whenReady.js'
import { PaintedPart } from '../telemetry/paintReporter.js'
import { useLook } from '../theme/themed.js'
import { entryOptionsOf } from './entryOptions.js'
import {
  entryOfNavigatorKey,
  entryRouteName,
  tagOfDestination,
} from './stack.js'

// ENTRY

const noStyles: PaintStyles = {}

/** The paint styles every stack entry screen merges. */
export const EntryStylesContext = createContext<PaintStyles>(noStyles)

/**
 * What the platform's stack already offers above a page: going back, from
 * its header and its edge swipe. A page's own Back button would only
 * repeat it, so it is left out there.
 */
const headerActions: ReadonlyArray<string> = [Session.GoBack()._tag]

const noActions: ReadonlyArray<string> = []

const cardMaxWidth = 480

/**
 * Paints the stack entry a navigator's route shows, found by the page
 * it is, so a page whose address moves stays one screen: its screen tree in a scrolling frame
 * with its docks at the bottom edge, or the action menu over a dimmed
 * backdrop. A screen the stack floats over the page beneath, such as a
 * question, is drawn as a card over a scrim; a press on the scrim goes
 * back through the Program. Both native stacks render it inside each
 * route. Before the Program is Ready it shows the Program's own
 * description.
 *
 * @example
 * ```tsx
 * <EntryView entryKey={route.key} />
 * ```
 */
export const EntryView = ({
  entryKey,
}: Readonly<{ entryKey: string }>): ReactElement => {
  const bound = useBound()
  const look = useLook()
  const styles = useContext(EntryStylesContext)
  const maybeEntry = Option.flatMap(useNavigationPlan(), plan =>
    entryOfNavigatorKey(plan, entryKey),
  )
  const maybeEntryKey = Option.map(maybeEntry, entry => entry.key)
  const partName = Option.getOrElse(
    Option.flatMap(maybeEntry, entry => tagOfDestination(entry.destination)),
    () => entryRouteName,
  )
  const maybeView = useViewAt(Option.getOrElse(maybeEntryKey, () => entryKey))
  const options = entryOptionsOf(bound, entryKey, look)
  const presentation = options.presentation
  const isUnderHeader = presentation === 'card'
  const headerTitle = options.title
  const handlers = useMemo<PaintHandlers>(
    () => ({
      look,
      styles,
      platformActions: isUnderHeader ? headerActions : noActions,
      ...(isUnderHeader && headerTitle !== ''
        ? { platformTitle: headerTitle }
        : {}),
      onPress: button => {
        if (button.action !== undefined) {
          bound.press(button.action)
        }
      },
      onLink: openLinkOf(bound),
    }),
    [bound, look, styles, isUnderHeader, headerTitle],
  )
  const painted = useMemo(
    () =>
      Option.match(maybeView, {
        onNone: () => <WhenReady>{null}</WhenReady>,
        onSome: view =>
          M.value(view).pipe(
            M.withReturnType<ReactElement>(),
            M.tagsExhaustive({
              Screen: ({ node }) =>
                presentation === 'transparentModal' ? (
                  <View
                    style={{
                      alignItems: 'center',
                      backgroundColor: look.colors.Scrim,
                      flex: 1,
                      justifyContent: 'center',
                      padding: 24,
                    }}
                  >
                    <Pressable
                      accessibilityLabel="Close"
                      accessibilityRole="button"
                      onPress={() => {
                        Navigation.backOneEntry(bound)
                      }}
                      style={{
                        bottom: 0,
                        left: 0,
                        position: 'absolute',
                        right: 0,
                        top: 0,
                      }}
                    />
                    <View
                      style={{
                        backgroundColor: look.colors.RaisedSurface,
                        borderColor: look.colors.Border,
                        borderRadius: look.sizes.panelRadius,
                        borderWidth: 1,
                        maxWidth: cardMaxWidth,
                        overflow: 'hidden',
                        width: '100%',
                      }}
                    >
                      <ScreenFrame
                        fit="Content"
                        handlers={handlers}
                        tree={node}
                      />
                    </View>
                  </View>
                ) : (
                  <ScreenFrame
                    handlers={handlers}
                    isUnderHeader={isUnderHeader}
                    tree={node}
                  />
                ),
              Menu: ({ menu }) => <ActionMenuSheet menu={menu} />,
            }),
          ),
      }),
    [bound, handlers, isUnderHeader, look, maybeView, presentation],
  )
  return <PaintedPart name={partName}>{painted}</PaintedPart>
}

/** Paint styles for {@link EntryView}, or the neutral defaults. */
export const entryStylesOf = (styles: PaintStyles | undefined): PaintStyles =>
  styles ?? noStyles
