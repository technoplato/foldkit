import { Array, Match as M } from 'effect'
import type { UiNode } from 'foldkit/renderers'
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
  if (child._tag === 'Button' && child.token !== undefined) {
    return `button-${child.token}`
  }
  return `${child._tag}-${index.toString()}`
}

const paintChildren = (
  children: ReadonlyArray<UiNode>,
  sendToken: (token: string) => void,
): ReadonlyArray<ReactNode> =>
  Array.map(children, (child, index) => (
    <View key={childKey(child, index)}>{paintScreen(child, sendToken)}</View>
  ))

/**
 * Maps a Program screen tree to React Native. The painter does not
 * invent hosts.
 */
export const paintScreen = (
  node: UiNode,
  sendToken: (token: string) => void,
): ReactNode =>
  M.value(node).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      Text: text => {
        const href = text.href
        if (href === undefined) {
          return (
            <Text
              accessibilityLabel={`count ${text.content}`}
              style={textStyle}
            >
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
        const token = button.token
        const isDisabled = button.disabled === true || token === undefined
        return (
          <Pressable
            accessibilityLabel={button.label}
            accessibilityRole="button"
            disabled={isDisabled}
            onPress={() => {
              if (token !== undefined && button.disabled !== true) {
                sendToken(token)
              }
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
          {paintChildren(row.children, sendToken)}
        </View>
      ),
      Column: column => (
        <View style={{ alignItems: 'center', gap: 16 }}>
          {paintChildren(column.children, sendToken)}
        </View>
      ),
      Box: box => (
        <View style={{ padding: box.padding }}>
          {paintChildren(box.children, sendToken)}
        </View>
      ),
      DeviceShell: shell => (
        <View>{paintChildren(shell.children, sendToken)}</View>
      ),
    }),
  )
