import { Array, Match as M } from 'effect'
import type { UiNode } from 'foldkit/renderers'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'

const bodyStyle = {
  color: '#111827',
  fontSize: 16,
  fontWeight: '500' as const,
}

const labelStyle = {
  color: '#111827',
  fontSize: 13,
  fontWeight: '600' as const,
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

/** Maps a Program screen tree to React Native. The painter does not invent hosts. */
export const paintScreen = (
  node: UiNode,
  sendToken: (token: string) => void,
): ReactNode =>
  M.value(node).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      Text: text => {
        if (text.content === '') {
          return null
        }
        return <Text style={bodyStyle}>{text.content}</Text>
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
              backgroundColor: '#e5e7eb',
              borderRadius: 8,
              opacity: isDisabled ? 0.55 : 1,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={labelStyle}>{button.label}</Text>
          </Pressable>
        )
      },
      TextInput: input => <Text style={bodyStyle}>{input.value}</Text>,
      Spacer: () => <View style={{ height: 8 }} />,
      Row: row => (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
            marginTop: 12,
          }}
        >
          {paintChildren(row.children, sendToken)}
        </View>
      ),
      Column: column => (
        <View style={{ gap: 8 }}>
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
