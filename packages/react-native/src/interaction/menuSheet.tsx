import { Array } from 'effect'
import type { MenuAction } from 'foldkit/renderers'
import { type ReactElement, useContext, useEffect, useMemo } from 'react'
import { Pressable, Text, type TextStyle, View } from 'react-native'

import { Icon } from './icon.js'
import { type Paint, pressOf } from './paint.js'
import { ScreenOverlayContext } from './scroll.js'

const sheetRadius = 18

const sheetBottomInset = 34

const headingSize = 17

/**
 * A menu the Program holds open, drawn as a sheet at the bottom edge of
 * its screen: what it is on, such as a word or a book's name, then what
 * the menu offers. A press outside it presses `dismissAction`. Whether it
 * is open, and on what, is the Program's.
 *
 * @example
 * ```typescript
 * MenuSheet({ heading: 'Salt Road', items: [{ action: 'Open:salt-road', label: 'Open' }], dismissAction: 'CloseTitleMenu', paint })
 * ```
 */
export const MenuSheet = ({
  heading,
  headingStyle,
  items,
  dismissAction,
  paint,
}: Readonly<{
  heading: string
  headingStyle?: TextStyle
  items: ReadonlyArray<MenuAction>
  dismissAction: string
  paint: Paint
}>): ReactElement => {
  const { colors, sizes } = paint.look
  return (
    <View
      accessibilityViewIsModal
      style={{ flex: 1, justifyContent: 'flex-end' }}
    >
      <Pressable
        accessibilityLabel="Close"
        accessibilityRole="button"
        onPress={() => {
          paint.onPress(pressOf(dismissAction, 'Close'))
        }}
        style={{
          backgroundColor: colors.Scrim,
          bottom: 0,
          left: 0,
          position: 'absolute',
          right: 0,
          top: 0,
        }}
      />
      <View
        accessibilityLabel={heading}
        accessibilityRole="menu"
        style={{
          backgroundColor: colors.RaisedSurface,
          borderTopLeftRadius: sheetRadius,
          borderTopRightRadius: sheetRadius,
          gap: 2,
          paddingBottom: sheetBottomInset,
          paddingHorizontal: 12,
          paddingTop: 14,
        }}
      >
        <Text
          numberOfLines={2}
          style={[
            {
              color: colors.QuietText,
              fontSize: headingSize,
              paddingBottom: 8,
              paddingHorizontal: 10,
            },
            headingStyle,
          ]}
        >
          {heading}
        </Text>
        {Array.map(items, item => (
          <Pressable
            key={item.action}
            accessibilityLabel={item.label}
            accessibilityRole="menuitem"
            onPress={() => {
              paint.onPress(pressOf(item.action, item.label))
            }}
            style={{
              alignItems: 'center',
              borderRadius: 10,
              flexDirection: 'row',
              gap: 12,
              minHeight: sizes.buttonHeight,
              paddingHorizontal: 10,
            }}
          >
            {item.icon === undefined ? null : (
              <Icon color={colors.QuietText} name={item.icon} size={20} />
            )}
            <Text style={{ color: colors.Text, fontSize: sizes.bodySize }}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

/**
 * Shows a menu's sheet over the whole screen while the Program holds the
 * menu open: through the screen's overlay where the screen has one, and in
 * place where it has none, such as a tree painted alone. The sheet is made
 * again only when what the menu says changes, so a Program that says the
 * same menu twice shows one sheet.
 */
export const MenuSheetOverlay = ({
  heading,
  items,
  dismissAction,
  paint,
}: Readonly<{
  heading: string
  items: ReadonlyArray<MenuAction>
  dismissAction: string
  paint: Paint
}>): ReactElement | null => {
  const showOverlay = useContext(ScreenOverlayContext)
  const said = Array.join(
    Array.map(items, item => `${item.action}\n${item.label}`),
    '\n',
  )
  const sheet = useMemo(
    () => (
      <MenuSheet
        dismissAction={dismissAction}
        heading={heading}
        items={items}
        paint={paint}
      />
    ),
    // NOTE: `items` is a new array each time the Program says its screen;
    // `said` holds what the items say, so the same menu is the same sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [heading, said, dismissAction, paint],
  )
  useEffect(() => {
    if (showOverlay === undefined) {
      return undefined
    }
    showOverlay(sheet)
    return () => {
      showOverlay(undefined)
    }
  }, [showOverlay, sheet])
  return showOverlay === undefined ? sheet : null
}
