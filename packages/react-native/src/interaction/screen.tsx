import { Array, Match as M, Option } from 'effect'
import { Navigation } from 'foldkit'
import type { ButtonNode, UiNode } from 'foldkit/renderers'
import { Fragment, type ReactElement, useMemo } from 'react'
import {
  Linking,
  Pressable,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native'

import { useBound, useScreen } from '@foldkit/react/interaction'

/**
 * Extra style per node kind, merged over the neutral default for that kind.
 * `ButtonLabel` styles the text inside a Button.
 *
 * @example
 * ```typescript
 * const styles: PaintStyles = { Text: { fontSize: 72, fontWeight: '600' } }
 * ```
 */
export type PaintStyles = Readonly<{
  Text?: TextStyle
  Button?: ViewStyle
  ButtonLabel?: TextStyle
  TextInput?: TextStyle
  Spacer?: ViewStyle
  Row?: ViewStyle
  Column?: ViewStyle
  Box?: ViewStyle
  DeviceShell?: ViewStyle
}>

/** How a painted tree reports presses and which styles it merges. */
export type PaintHandlers = Readonly<{
  onPress: (button: ButtonNode) => void
  onLink?: (href: string) => void
  styles?: PaintStyles
}>

/**
 * Follows a screen's text link where `Navigation.linkTargetOf` decides,
 * the same decision every web adapter makes: `/counter/session` opens in
 * the Program, and anything else opens through the device.
 *
 * @example
 * ```tsx
 * paintTree(node, { onPress, onLink: openLinkOf(bound) })
 * ```
 */
export const openLinkOf =
  (
    bound: Readonly<{
      ownsUri: (uri: string) => boolean
      openUri: (uri: string, via: Navigation.UriVia) => boolean
    }>,
  ) =>
  (href: string): void =>
    M.value(
      Navigation.linkTargetOf(href, {
        ownsUri: bound.ownsUri,
        maybeCurrentUri: Option.none(),
        hostPages: 'ProgramOnly',
      }),
    ).pipe(
      M.withReturnType<void>(),
      M.tagsExhaustive({
        OpenInProgram: () => {
          bound.openUri(href, Navigation.Link())
        },
        ShowHostPage: () => {
          void Linking.openURL(href)
        },
        LoadDocument: () => {
          void Linking.openURL(href)
        },
      }),
    )

const disabledOpacity = 0.55

const textStyle: TextStyle = {
  color: '#111827',
  fontSize: 17,
  textAlign: 'center',
}

const linkStyle: TextStyle = {
  color: '#2563eb',
  textDecorationLine: 'underline',
}

const buttonStyle: ViewStyle = {
  backgroundColor: '#111827',
  borderRadius: 8,
  minWidth: 88,
  paddingHorizontal: 16,
  paddingVertical: 12,
}

const disabledButtonStyle: ViewStyle = { opacity: disabledOpacity }

const buttonLabelStyle: TextStyle = {
  color: '#ffffff',
  fontSize: 16,
  fontWeight: '500',
  textAlign: 'center',
}

const rowStyle: ViewStyle = {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 12,
  justifyContent: 'center',
}

const columnStyle: ViewStyle = { alignItems: 'center', gap: 16 }

/**
 * Paints a Program screen tree as React Native elements. A Button press
 * reports the whole node, so a Client sends its Catalog `action`. A
 * disabled Button reads its `because` sentence as the accessibility hint,
 * and a Text with a `label` announces the label instead of its content.
 *
 * @example
 * ```tsx
 * paintTree(counterScreen({ count: 3 }), {
 *   onPress: button => console.log(button.action),
 *   styles: { Text: { fontSize: 72 } },
 * })
 * ```
 */
export const paintTree = (
  node: UiNode,
  handlers: PaintHandlers,
): ReactElement => {
  const styles = handlers.styles ?? {}
  const keyFor = (child: UiNode, index: number): string =>
    child._tag === 'Button' && child.action !== undefined
      ? `button-${child.action}`
      : `${child._tag}-${index.toString()}`
  const paintChildren = (
    children: ReadonlyArray<UiNode>,
  ): ReadonlyArray<ReactElement> =>
    Array.map(children, (child, index) => (
      <Fragment key={keyFor(child, index)}>{paint(child)}</Fragment>
    ))
  const paint = (current: UiNode): ReactElement =>
    M.value(current).pipe(
      M.withReturnType<ReactElement>(),
      M.tagsExhaustive({
        Text: text => {
          const href = text.href
          if (href === undefined) {
            return (
              <Text
                accessibilityLabel={text.label}
                style={[textStyle, styles.Text]}
              >
                {text.content}
              </Text>
            )
          }
          return (
            <Text
              accessibilityLabel={text.label}
              accessibilityRole="link"
              onPress={() => {
                if (handlers.onLink === undefined) {
                  void Linking.openURL(href)
                } else {
                  handlers.onLink(href)
                }
              }}
              style={[textStyle, linkStyle, styles.Text]}
            >
              {text.content}
            </Text>
          )
        },
        Button: button => {
          const isDisabled = button.disabled === true
          return (
            <Pressable
              accessibilityHint={button.because}
              accessibilityLabel={button.label}
              accessibilityRole="button"
              accessibilityState={{ disabled: isDisabled }}
              disabled={isDisabled}
              onPress={() => {
                handlers.onPress(button)
              }}
              style={[
                buttonStyle,
                styles.Button,
                isDisabled ? disabledButtonStyle : undefined,
              ]}
            >
              <Text style={[buttonLabelStyle, styles.ButtonLabel]}>
                {button.label}
              </Text>
            </Pressable>
          )
        },
        TextInput: input => (
          <Text style={[textStyle, styles.TextInput]}>{input.value}</Text>
        ),
        Spacer: () => <View style={styles.Spacer} />,
        Row: row => (
          <View style={[rowStyle, styles.Row]}>
            {paintChildren(row.children)}
          </View>
        ),
        Column: column => (
          <View style={[columnStyle, styles.Column]}>
            {paintChildren(column.children)}
          </View>
        ),
        Box: box => (
          <View style={[{ padding: box.padding }, styles.Box]}>
            {paintChildren(box.children)}
          </View>
        ),
        DeviceShell: shell => (
          <View style={styles.DeviceShell}>
            {paintChildren(shell.children)}
          </View>
        ),
      }),
    )
  return paint(node)
}

/**
 * Paints the bound Program's screen tree and repaints only when the tree
 * changes. A Button press sends its Catalog Action, so the screen needs no
 * token table.
 *
 * @example
 * ```tsx
 * <ProgramProvider bound={counter}>
 *   <Screen styles={{ Text: { fontSize: 72 } }} />
 * </ProgramProvider>
 * ```
 */
export const Screen = ({
  styles,
}: Readonly<{ styles?: PaintStyles }>): ReactElement | null => {
  const bound = useBound()
  const maybeTree = useScreen()
  return useMemo(
    () =>
      Option.match(maybeTree, {
        onNone: () => null,
        onSome: tree =>
          paintTree(tree, {
            styles: styles ?? {},
            onPress: button => {
              if (button.action !== undefined) {
                bound.press(button.action)
              }
            },
            onLink: openLinkOf(bound),
          }),
      }),
    [bound, maybeTree, styles],
  )
}
