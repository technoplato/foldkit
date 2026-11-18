import { Array, Match as M } from 'effect'
import type { UiNode } from 'foldkit/renderers'
import type { ReactNode } from 'react'
import {
  Pressable,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native'

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

const barHeight = 4

const dimColor = '#6b7280'

const trackColor = '#e5e7eb'

const accentColor = '#9a3412'

const accentSoftColor = '#fed7aa'

const stretchStyle: ViewStyle = { alignSelf: 'stretch' }

const dimTextStyle: TextStyle = {
  color: dimColor,
  fontSize: 14,
  fontWeight: '400',
}

const trackStyle: ViewStyle = {
  alignSelf: 'stretch',
  backgroundColor: trackColor,
  borderRadius: 999,
  height: barHeight,
  overflow: 'hidden',
}

const fillStyleOf = (value: number, max: number): ViewStyle => ({
  backgroundColor: '#111827',
  height: barHeight,
  width: `${(max > 0 ? Math.min(1, Math.max(0, value / max)) : 0) * 100}%`,
})

const itemStyle: ViewStyle = {
  alignItems: 'center',
  borderBottomColor: trackColor,
  borderBottomWidth: 1,
  flexDirection: 'row',
  gap: 8,
  paddingVertical: 10,
}

const itemTitleStyle: TextStyle = { ...bodyStyle, fontWeight: '600' }

const currentItemTitleStyle: TextStyle = { color: accentColor }

const passageStyle: TextStyle = { ...bodyStyle, lineHeight: 26 }

const passageLabelStyle: TextStyle = { color: dimColor }

const currentWordStyle: TextStyle = {
  backgroundColor: accentSoftColor,
  color: accentColor,
}

const paintBar = (value: number, max: number): ReactNode => (
  <View style={trackStyle}>
    <View style={fillStyleOf(value, max)} />
  </View>
)

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
      Progress: progress => (
        <View
          accessibilityLabel={progress.label}
          accessibilityRole="progressbar"
          style={stretchStyle}
        >
          {paintBar(progress.value, progress.max)}
        </View>
      ),
      List: list => (
        <View accessibilityLabel={list.label} style={stretchStyle}>
          {Array.map(list.items, item => {
            const action = item.action
            return (
              <View key={item.key} style={itemStyle}>
                <Pressable
                  accessibilityLabel={item.title}
                  accessibilityRole="button"
                  disabled={action === undefined}
                  onPress={() => {
                    if (action !== undefined) {
                      sendToken(action)
                    }
                  }}
                  style={{ flex: 1, gap: 3 }}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      itemTitleStyle,
                      item.isCurrent === true
                        ? currentItemTitleStyle
                        : undefined,
                    ]}
                  >
                    {item.title}
                  </Text>
                  {Array.match(item.lines ?? [], {
                    onEmpty: () => null,
                    onNonEmpty: lines => (
                      <Text numberOfLines={1} style={dimTextStyle}>
                        {Array.join(lines, ' · ')}
                      </Text>
                    ),
                  })}
                  {item.progress === undefined
                    ? null
                    : paintBar(item.progress.value, item.progress.max)}
                </Pressable>
                {paintChildren(item.trailing ?? [], sendToken)}
              </View>
            )
          })}
        </View>
      ),
      Seek: seek => (
        <View
          accessibilityLabel={seek.label}
          accessibilityValue={{ text: seek.valueText }}
          style={[stretchStyle, { gap: 6 }]}
        >
          {paintBar(seek.value, seek.max)}
          <Text style={dimTextStyle}>{seek.valueText}</Text>
        </View>
      ),
      Transcript: transcript => (
        <View
          accessibilityLabel={transcript.label}
          style={[stretchStyle, { gap: 12 }]}
        >
          {Array.match(transcript.passages, {
            onEmpty: () => (
              <Text style={dimTextStyle}>{transcript.emptyText}</Text>
            ),
            onNonEmpty: passages =>
              Array.map(passages, passage => (
                <Text key={passage.key} style={passageStyle}>
                  <Text style={passageLabelStyle}>{`${passage.label}  `}</Text>
                  {Array.map(passage.words, word => (
                    <Text
                      key={word.token}
                      onPress={() => {
                        sendToken(`${transcript.action}:${word.token}`)
                      }}
                      style={
                        word.isCurrent === true ? currentWordStyle : undefined
                      }
                    >
                      {`${word.text} `}
                    </Text>
                  ))}
                </Text>
              )),
          })}
        </View>
      ),
      DeviceShell: shell => (
        <View>{paintChildren(shell.children, sendToken)}</View>
      ),
    }),
  )
