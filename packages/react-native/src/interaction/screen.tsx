import { Array, Match as M, Option } from 'effect'
import { Interaction, Navigation } from 'foldkit'
import { iconGlyphs } from 'foldkit/renderers'
import type {
  ButtonNode,
  ProgressNode,
  TextNode,
  UiNode,
} from 'foldkit/renderers'
import { Fragment, type ReactElement, useMemo } from 'react'
import {
  Image,
  Linking,
  Platform,
  Pressable,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native'

import { useBound, useScreen } from '@foldkit/react/interaction'

/**
 * Extra style per node kind, merged over the default for that kind, which
 * comes from `Interaction.screenLook`. `ButtonLabel` styles the text
 * inside a Button. An app needs none of it to match the other painters.
 *
 * @example
 * ```typescript
 * const styles: PaintStyles = { Button: { borderRadius: 8 } }
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
  Progress?: ViewStyle
  List?: ViewStyle
  Seek?: ViewStyle
  Transcript?: ViewStyle
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

const look = Interaction.screenLook

const monoFamily = Platform.select({ ios: 'Menlo', default: 'monospace' })

const textStyle: TextStyle = {
  color: look.textColor,
  fontSize: look.bodySize,
  textAlign: 'center',
}

const displayTextStyle: TextStyle = {
  fontSize: look.displaySize,
  fontVariant: ['tabular-nums'],
  fontWeight: '600',
}

const dimTextStyle: TextStyle = {
  color: look.dimColor,
  fontSize: look.dimSize,
  fontWeight: '400',
}

const monoTextStyle: TextStyle = { fontFamily: monoFamily }

const linkStyle: TextStyle = {
  color: look.linkColor,
  textDecorationLine: 'underline',
}

const buttonStyle: ViewStyle = {
  alignItems: 'center',
  backgroundColor: look.buttonColor,
  justifyContent: 'center',
  minHeight: look.buttonHeight,
  minWidth: look.buttonMinWidth,
  paddingHorizontal: look.buttonPaddingX,
}

const disabledButtonStyle: ViewStyle = {
  backgroundColor: look.buttonDisabledColor,
}

const buttonLabelStyle: TextStyle = {
  color: look.buttonLabelColor,
  fontSize: look.buttonLabelSize,
  fontWeight: '500',
  textAlign: 'center',
}

const rowStyle: ViewStyle = {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: look.rowGap,
  justifyContent: 'center',
}

const columnStyle: ViewStyle = { alignItems: 'center', gap: look.columnGap }

const headlineTextStyle: TextStyle = {
  fontSize: look.headlineSize,
  fontWeight: '700',
}

const trackStyle: ViewStyle = {
  alignSelf: 'stretch',
  backgroundColor: look.trackColor,
  borderRadius: 999,
  height: 4,
  overflow: 'hidden',
}

const fillStyleOf = (value: number, max: number): ViewStyle => ({
  backgroundColor: look.accentColor,
  height: 4,
  width: `${(max > 0 ? Math.min(1, Math.max(0, value / max)) : 0) * 100}%`,
})

const listStyle: ViewStyle = { alignSelf: 'stretch' }

const itemStyle: ViewStyle = {
  alignItems: 'center',
  borderBottomColor: look.trackColor,
  borderBottomWidth: 1,
  flexDirection: 'row',
  gap: look.rowGap,
  paddingVertical: 10,
}

const itemTitleStyle: TextStyle = {
  color: look.textColor,
  fontSize: look.bodySize,
  fontWeight: '600',
}

const itemLineStyle: TextStyle = { color: look.dimColor, fontSize: 14 }

const passageStyle: ViewStyle = {
  alignSelf: 'stretch',
  borderRadius: 14,
  flexDirection: 'row',
  gap: 8,
  padding: 8,
}

const passageHeadingStyle: TextStyle = {
  color: look.textColor,
  fontSize: 13,
  fontWeight: '700',
  letterSpacing: 0.8,
  width: '100%',
}

const passageLabelStyle: TextStyle = {
  color: look.dimColor,
  fontFamily: monoFamily,
  fontSize: 12,
  paddingTop: 5,
  width: 48,
}

const passageWordsStyle: TextStyle = {
  color: look.textColor,
  flex: 1,
  fontSize: look.readingSize,
  lineHeight: look.readingSize * 1.6,
}

const currentWordStyle: TextStyle = {
  backgroundColor: look.accentSoftColor,
  color: '#9a3412',
}

const labelOfButton = (button: ButtonNode): string => {
  const glyph = button.icon === undefined ? undefined : iconGlyphs[button.icon]
  if (glyph === undefined) {
    return button.label
  } else if (button.isIconOnly === true) {
    return glyph
  } else {
    return `${glyph} ${button.label}`
  }
}

const Bar = ({
  progress,
}: Readonly<{
  progress: Pick<ProgressNode, 'value' | 'max'>
}>): ReactElement => (
  <View style={trackStyle}>
    <View style={fillStyleOf(progress.value, progress.max)} />
  </View>
)

const styleOfText = (text: TextNode): ReadonlyArray<TextStyle> => [
  textStyle,
  ...(text.emphasis === 'Display' ? [displayTextStyle] : []),
  ...(text.emphasis === 'Headline' ? [headlineTextStyle] : []),
  ...(text.dim === true ? [dimTextStyle] : []),
  ...(text.mono === true ? [monoTextStyle] : []),
]

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
 *   styles: { Button: { borderRadius: 8 } },
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
          const image = text.image
          if (image !== undefined) {
            const picture = (
              <Image
                accessibilityLabel={text.content}
                source={{ uri: image.src }}
                style={{
                  alignSelf: 'center',
                  borderRadius: 6,
                  height: image.height,
                  width: image.width,
                }}
              />
            )
            return href === undefined ? (
              picture
            ) : (
              <Pressable
                accessibilityLabel={text.content}
                accessibilityRole="link"
                onPress={() => {
                  if (handlers.onLink === undefined) {
                    void Linking.openURL(href)
                  } else {
                    handlers.onLink(href)
                  }
                }}
              >
                {picture}
              </Pressable>
            )
          }
          if (href === undefined) {
            return (
              <Text
                accessibilityLabel={text.label}
                selectable={text.copyable === true}
                style={[...styleOfText(text), styles.Text]}
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
              style={[...styleOfText(text), linkStyle, styles.Text]}
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
                {labelOfButton(button)}
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
        Progress: progress => (
          <View
            accessibilityLabel={progress.label}
            accessibilityRole="progressbar"
            style={[listStyle, styles.Progress]}
          >
            <Bar progress={progress} />
          </View>
        ),
        List: list => (
          <View
            accessibilityLabel={list.label}
            style={[listStyle, styles.List]}
          >
            {Array.map(list.items, item => {
              const action = item.action
              const href = item.href
              return (
                <View key={item.key} style={itemStyle}>
                  <Pressable
                    accessibilityLabel={item.title}
                    accessibilityRole={href === undefined ? 'button' : 'link'}
                    disabled={action === undefined && href === undefined}
                    onPress={() => {
                      if (href !== undefined) {
                        if (handlers.onLink === undefined) {
                          void Linking.openURL(href)
                        } else {
                          handlers.onLink(href)
                        }
                      } else if (action !== undefined) {
                        handlers.onPress({
                          _tag: 'Button',
                          label: item.title,
                          action,
                        })
                      }
                    }}
                    style={{
                      alignItems: 'center',
                      flex: 1,
                      flexDirection: 'row',
                      gap: 14,
                    }}
                  >
                    {item.image === undefined ? null : (
                      <Image
                        accessibilityLabel={item.image.alt}
                        source={{ uri: item.image.src }}
                        style={{
                          borderRadius: 6,
                          height: look.itemImageSize,
                          width: look.itemImageSize,
                        }}
                      />
                    )}
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text
                        numberOfLines={1}
                        style={[
                          itemTitleStyle,
                          item.isCurrent === true
                            ? { color: look.accentColor }
                            : undefined,
                        ]}
                      >
                        {item.title}
                      </Text>
                      {Array.map(item.lines ?? [], (line, index) => (
                        <Text
                          key={index}
                          numberOfLines={1}
                          style={itemLineStyle}
                        >
                          {line}
                        </Text>
                      ))}
                      {item.progress === undefined ? null : (
                        <Bar progress={item.progress} />
                      )}
                    </View>
                  </Pressable>
                  {paintChildren(item.trailing ?? [])}
                </View>
              )
            })}
          </View>
        ),
        Seek: seek => (
          <View
            accessibilityLabel={seek.label}
            accessibilityValue={{ text: seek.valueText }}
            style={[listStyle, { gap: 6 }, styles.Seek]}
          >
            <Bar progress={{ value: seek.value, max: seek.max }} />
            <Text style={[textStyle, dimTextStyle]}>{seek.valueText}</Text>
          </View>
        ),
        Transcript: transcript => (
          <View
            accessibilityLabel={transcript.label}
            style={[listStyle, styles.Transcript]}
          >
            {Array.match(transcript.passages, {
              onEmpty: () => (
                <Text style={[textStyle, dimTextStyle]}>
                  {transcript.emptyText}
                </Text>
              ),
              onNonEmpty: passages =>
                Array.map(passages, passage => (
                  <View
                    key={passage.key}
                    style={[
                      passageStyle,
                      passage.isCurrent === true
                        ? { backgroundColor: look.rowHoverColor }
                        : undefined,
                    ]}
                  >
                    {passage.heading === undefined ? null : (
                      <Text style={passageHeadingStyle}>
                        {passage.heading.toUpperCase()}
                      </Text>
                    )}
                    <Text style={passageLabelStyle}>{passage.label}</Text>
                    <Text style={passageWordsStyle}>
                      {Array.map(passage.words, word => (
                        <Text
                          key={word.token}
                          onPress={() => {
                            handlers.onPress({
                              _tag: 'Button',
                              label: word.text,
                              action: `${transcript.action}:${word.token}`,
                            })
                          }}
                          style={
                            word.isCurrent === true
                              ? currentWordStyle
                              : undefined
                          }
                        >
                          {`${word.text} `}
                        </Text>
                      ))}
                    </Text>
                  </View>
                )),
            })}
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
 *   <Screen />
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
