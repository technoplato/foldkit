import { Array, Match as M } from 'effect'
import type { ButtonNode, UiNode } from 'foldkit/renderers'
import type { ReactNode } from 'react'
import { Linking, Pressable, Text, View } from 'react-native'

const textStyle = {
  color: '#111827',
  fontSize: 72,
  fontVariant: ['tabular-nums'] as Array<'tabular-nums'>,
  fontWeight: '600' as const,
  textAlign: 'center' as const,
}

const labelStyle = {
  color: '#ffffff',
  fontSize: 16,
  fontWeight: '500' as const,
  textAlign: 'center' as const,
}

const childKey = (child: UiNode, index: number): string => {
  if (child._tag === 'Button' && child.action !== undefined) {
    return `button-${child.action}`
  }
  return `${child._tag}-${index.toString()}`
}

const paintChildren = (
  children: ReadonlyArray<UiNode>,
  onPress: (button: ButtonNode) => void,
): ReadonlyArray<ReactNode> =>
  Array.map(children, (child, index) => (
    <View key={childKey(child, index)}>{paintScreen(child, onPress)}</View>
  ))

/**
 * Maps a Program screen tree to React Native. A Button press reports the
 * node, so the window sends its Catalog `action`; a disabled Button reads
 * its `because` sentence as the accessibility hint.
 */
export const paintScreen = (
  node: UiNode,
  onPress: (button: ButtonNode) => void,
): ReactNode =>
  M.value(node).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      Text: text => {
        const href = text.href
        if (href === undefined) {
          return (
            <Text accessibilityLabel={text.label} style={textStyle}>
              {text.content}
            </Text>
          )
        }
        return (
          <Text
            accessibilityRole="link"
            onPress={() => {
              void Linking.openURL(href)
            }}
            style={textStyle}
          >
            {text.content}
          </Text>
        )
      },
      Button: button => {
        const isDisabled = button.disabled === true
        return (
          <Pressable
            accessibilityLabel={button.label}
            accessibilityHint={button.because}
            accessibilityRole="button"
            accessibilityState={{ disabled: isDisabled }}
            disabled={isDisabled}
            onPress={() => {
              onPress(button)
            }}
            style={{
              backgroundColor: '#111827',
              minWidth: 88,
              opacity: isDisabled ? 0.55 : 1,
              paddingHorizontal: 16,
              paddingVertical: 14,
            }}
          >
            <Text style={labelStyle}>{button.label}</Text>
          </Pressable>
        )
      },
      TextInput: input => <Text style={textStyle}>{input.value}</Text>,
      Spacer: () => <View />,
      Row: row => (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 12,
            justifyContent: 'center',
            marginTop: 24,
          }}
        >
          {paintChildren(row.children, onPress)}
        </View>
      ),
      Column: column => (
        <View style={{ alignItems: 'center', gap: 16 }}>
          {paintChildren(column.children, onPress)}
        </View>
      ),
      Box: box => (
        <View style={{ padding: box.padding }}>
          {paintChildren(box.children, onPress)}
        </View>
      ),
      DeviceShell: shell => (
        <View>{paintChildren(shell.children, onPress)}</View>
      ),
    }),
  )
