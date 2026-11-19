import { Array } from 'effect'
import type { UiNode } from 'foldkit/renderers'
import { type ReactElement, useMemo, useRef, useState } from 'react'
import { ScrollView, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { keyboardRoomOf, useKeyboardHeight } from './keyboard.js'
import { lightLook } from './look.js'
import { type PaintHandlers, screenPartsOf } from './paint.js'
import { paintTree } from './screen.js'
import {
  ScreenOverlayContext,
  type ScreenScroll,
  ScreenScrollContext,
} from './scroll.js'

const pagePadding = 16

const dockPaddingY = 8

const fittedShareOfWindow = 0.85

/**
 * How tall a frame is: `Fill` takes all the room it is given, as a page
 * does; `Content` is as tall as what it holds, up to most of the window,
 * as a sheet or a card is. A native sheet sizes itself to its content,
 * and gives a content that asks to fill it no height at all.
 */
export type FrameFit = 'Fill' | 'Content'

/**
 * One whole screen on a phone: the tree's body in a scrolling area, and
 * its docks, such as a player's bar or the tabs, kept in view at the
 * bottom edge above the home indicator. A page fills its room; a sheet
 * or a card is as tall as what it holds. Parts inside the body, such as
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
  fit,
}: Readonly<{
  tree: UiNode
  handlers: PaintHandlers
  isUnderHeader?: boolean
  fit?: FrameFit
}>): ReactElement => {
  const look = handlers.look ?? lightLook
  const insets = useSafeAreaInsets()
  const room = keyboardRoomOf({
    keyboardHeight: useKeyboardHeight(),
    bottomInset: insets.bottom,
  })
  const windowHeight = useWindowDimensions().height
  const isFitted = fit === 'Content'
  const [maybeOverlay, setMaybeOverlay] = useState<ReactElement | undefined>(
    undefined,
  )
  const [contentHeight, setContentHeight] = useState(0)
  const fittedHeight = Math.min(
    contentHeight,
    windowHeight * fittedShareOfWindow,
  )
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
  const isCoasting = useRef(false)
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
  const dockHandlers = useMemo<PaintHandlers>(
    () => ({ ...handlers, isCentered: true }),
    [handlers],
  )
  const docks = useMemo(
    () =>
      Array.map(parts.docks, (dock, index) => (
        <View key={index} style={{ alignSelf: 'stretch' }}>
          {paintTree({ ...dock, isDock: false }, dockHandlers)}
        </View>
      )),
    [parts.docks, dockHandlers],
  )
  return (
    <View
      style={[
        { backgroundColor: look.colors.PageGround },
        isFitted ? undefined : { flex: 1 },
        // NOTE: the keyboard's room: the docks, and a field in one, stay in
        // sight above it.
        { paddingBottom: room.frameLift },
      ]}
    >
      <ScrollView
        ref={scrollView}
        contentInsetAdjustmentBehavior={
          isUnderHeader === true ? 'automatic' : 'never'
        }
        keyboardShouldPersistTaps="handled"
        onLayout={event => {
          viewport.current = event.nativeEvent.layout.height
        }}
        onMomentumScrollEnd={() => {
          // NOTE: a scroll this frame made itself also ends with this
          // event. Only the coasting after a person's own drag is theirs.
          if (isCoasting.current) {
            isCoasting.current = false
            noteUserScroll()
          }
        }}
        onScroll={event => {
          offset.current = event.nativeEvent.contentOffset.y
        }}
        onScrollBeginDrag={() => {
          isCoasting.current = false
          noteUserScroll()
        }}
        onScrollEndDrag={() => {
          isCoasting.current = true
          noteUserScroll()
        }}
        onContentSizeChange={(_width, height) => {
          setContentHeight(height)
        }}
        scrollEventThrottle={32}
        style={isFitted ? { flexGrow: 0, height: fittedHeight } : { flex: 1 }}
      >
        <View
          ref={content}
          collapsable={false}
          style={{
            padding: pagePadding,
            paddingBottom:
              pagePadding +
              (Array.isReadonlyArrayEmpty(parts.docks) ? room.dockInset : 0),
          }}
        >
          <ScreenOverlayContext.Provider value={setMaybeOverlay}>
            <ScreenScrollContext.Provider value={scroll}>
              {body}
            </ScreenScrollContext.Provider>
          </ScreenOverlayContext.Provider>
        </View>
      </ScrollView>
      {Array.isReadonlyArrayEmpty(parts.docks) ? null : (
        <View
          style={{
            backgroundColor: look.colors.BarGround,
            borderTopColor: look.colors.Rule,
            borderTopWidth: 1,
            gap: 4,
            paddingBottom: Math.max(dockPaddingY, room.dockInset),
            paddingHorizontal: pagePadding,
            paddingTop: dockPaddingY,
          }}
        >
          {docks}
        </View>
      )}
      {maybeOverlay === undefined ? null : (
        <View
          style={{ bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 }}
        >
          {maybeOverlay}
        </View>
      )}
    </View>
  )
}
