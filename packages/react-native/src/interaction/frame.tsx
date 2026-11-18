import { Array } from 'effect'
import type { UiNode } from 'foldkit/renderers'
import { type ReactElement, useMemo, useRef } from 'react'
import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { lightLook } from './look.js'
import { type PaintHandlers, screenPartsOf } from './paint.js'
import { paintTree } from './screen.js'
import { type ScreenScroll, ScreenScrollContext } from './scroll.js'

const pagePadding = 16

const dockPaddingY = 8

/**
 * One whole screen on a phone: the tree's body in a scrolling area, and
 * its docks, such as a player's bar or the tabs, kept in view at the
 * bottom edge above the home indicator. Parts inside the body, such as
 * words read along with, read and move the scroll through
 * `ScreenScrollContext`.
 *
 * @example
 * ```tsx
 * <ScreenFrame tree={tree} handlers={{ onPress, look }} />
 * ```
 */
export const ScreenFrame = ({
  tree,
  handlers,
  isUnderHeader,
}: Readonly<{
  tree: UiNode
  handlers: PaintHandlers
  isUnderHeader?: boolean
}>): ReactElement => {
  const look = handlers.look ?? lightLook
  const insets = useSafeAreaInsets()
  const scrollView = useRef<ScrollView>(null)
  const content = useRef<View>(null)
  const offset = useRef(0)
  const viewport = useRef(0)
  const listeners = useRef(new Set<() => void>())
  const scroll = useMemo<ScreenScroll>(
    () => ({
      offset: () => offset.current,
      viewport: () => viewport.current,
      scrollTo: y => {
        scrollView.current?.scrollTo({ y, animated: true })
      },
      measure: (part, onMeasured) => {
        const within = content.current
        if (within !== null) {
          part.measureLayout(within, (_x, y, _width, height) => {
            onMeasured(y, height)
          })
        }
      },
      onUserScroll: listener => {
        listeners.current.add(listener)
        return () => {
          listeners.current.delete(listener)
        }
      },
    }),
    [],
  )
  const noteUserScroll = (): void => {
    listeners.current.forEach(listener => {
      listener()
    })
  }
  const parts = useMemo(() => screenPartsOf(tree), [tree])
  const body = useMemo(
    () =>
      parts.maybeBody === undefined
        ? null
        : paintTree(parts.maybeBody, handlers),
    [parts.maybeBody, handlers],
  )
  const docks = useMemo(
    () =>
      Array.map(parts.docks, (dock, index) => (
        <View key={index} style={{ alignSelf: 'stretch' }}>
          {paintTree({ ...dock, isDock: false }, handlers)}
        </View>
      )),
    [parts.docks, handlers],
  )
  return (
    <View style={{ backgroundColor: look.colors.PageGround, flex: 1 }}>
      <ScrollView
        ref={scrollView}
        contentInsetAdjustmentBehavior={
          isUnderHeader === true ? 'automatic' : 'never'
        }
        keyboardShouldPersistTaps="handled"
        onLayout={event => {
          viewport.current = event.nativeEvent.layout.height
        }}
        onMomentumScrollEnd={noteUserScroll}
        onScroll={event => {
          offset.current = event.nativeEvent.contentOffset.y
        }}
        onScrollBeginDrag={noteUserScroll}
        onScrollEndDrag={noteUserScroll}
        scrollEventThrottle={32}
        style={{ flex: 1 }}
      >
        <View
          ref={content}
          collapsable={false}
          style={{
            padding: pagePadding,
            paddingBottom:
              pagePadding +
              (Array.isReadonlyArrayEmpty(parts.docks) ? insets.bottom : 0),
          }}
        >
          <ScreenScrollContext.Provider value={scroll}>
            {body}
          </ScreenScrollContext.Provider>
        </View>
      </ScrollView>
      {Array.isReadonlyArrayEmpty(parts.docks) ? null : (
        <View
          style={{
            backgroundColor: look.colors.BarGround,
            borderTopColor: look.colors.Rule,
            borderTopWidth: 1,
            gap: 4,
            paddingBottom: Math.max(dockPaddingY, insets.bottom),
            paddingHorizontal: pagePadding,
            paddingTop: dockPaddingY,
          }}
        >
          {docks}
        </View>
      )}
    </View>
  )
}
