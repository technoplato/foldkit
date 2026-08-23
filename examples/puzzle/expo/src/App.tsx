import { Option } from 'effect'
import { StatusBar } from 'expo-status-bar'
import { Program } from 'foldkit'
import {
  type ListedAction,
  Path,
  actionMenuRowLabel,
} from 'puzzle-core-example'
import { useActionMenu } from 'puzzle-react-bindings-example'
import { Modal, Pressable, Text, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'

import { ProgramKeyBindings, sendScreenToken, useScreen } from '@foldkit/react'

import { paintScreen } from './paintScreen.js'

/** Draws one Puzzle window from the Program screen tree. */
export const App = () => (
  <ProgramKeyBindings path={Path()}>
    <PuzzleWindow />
  </ProgramKeyBindings>
)

const PuzzleWindow = () => {
  const screen = useScreen(Path())
  const { menu, rows, empty, maybeChosen, dismiss, select, trigger } =
    useActionMenu()
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={{ backgroundColor: '#ffffff', flex: 1 }}>
        <View
          style={{
            alignItems: 'center',
            flex: 1,
            justifyContent: 'center',
            padding: 24,
          }}
        >
          {paintScreen(screen, sendScreenToken)}
        </View>
        <Pressable
          accessibilityLabel="Actions"
          accessibilityRole="button"
          onPress={trigger}
          style={{
            backgroundColor: '#111827',
            borderRadius: 24,
            bottom: 24,
            paddingHorizontal: 16,
            paddingVertical: 12,
            position: 'absolute',
            right: 24,
          }}
        >
          <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '600' }}>
            Actions
          </Text>
        </Pressable>
      </SafeAreaView>
      <Modal
        animationType="fade"
        onRequestClose={dismiss}
        transparent
        visible={menu._tag === 'Open'}
      >
        <View
          accessibilityLabel="Action menu backdrop"
          style={{
            alignItems: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            flex: 1,
            justifyContent: 'center',
          }}
        >
          <Pressable
            accessibilityRole="button"
            onPress={dismiss}
            style={{
              bottom: 0,
              left: 0,
              position: 'absolute',
              right: 0,
              top: 0,
            }}
          />
          <View
            accessibilityLabel="Action menu"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 12,
              minWidth: 280,
              padding: 16,
            }}
          >
            <Text
              style={{
                color: '#111827',
                fontSize: 16,
                fontWeight: '600',
                marginBottom: 8,
              }}
            >
              Actions
            </Text>
            {menu._tag === 'Open' && Option.isSome(menu.maybeQuery) ? (
              <Text style={{ color: '#4b5563', marginBottom: 12 }}>
                {menu.maybeQuery.value}
              </Text>
            ) : null}
            {empty ? <Text accessibilityLabel="Empty">Empty</Text> : null}
            {empty || menu._tag !== 'Open' ? null : (
              <ExpoMenuRows
                maybeChosen={maybeChosen}
                maybeHighlight={Program.highlightIndex(menu, {
                  _tag: 'Matches',
                  rows,
                })}
                rows={rows}
                onSelect={select}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaProvider>
  )
}

const expoRowBackground = (isChosen: boolean, isFocused: boolean): string => {
  if (isChosen) {
    return '#1d4ed8'
  }
  if (isFocused) {
    return '#111827'
  }
  return '#f3f4f6'
}

const ExpoMenuRows = ({
  maybeChosen,
  maybeHighlight,
  rows,
  onSelect,
}: Readonly<{
  maybeChosen: Option.Option<string>
  maybeHighlight: Option.Option<number>
  rows: ReadonlyArray<ListedAction>
  onSelect: (token: string) => void
}>) => (
  <>
    {rows.map((row, index) => {
      const isFocused =
        Option.isSome(maybeHighlight) && maybeHighlight.value === index
      const isChosen =
        Option.isSome(maybeChosen) && maybeChosen.value === row.token
      return (
        <Pressable
          accessibilityRole="button"
          disabled={row.disabled}
          key={row.token}
          onPress={() => {
            onSelect(row.token)
          }}
          style={{
            backgroundColor: expoRowBackground(isChosen, isFocused),
            marginBottom: 8,
            opacity: row.disabled ? 0.55 : 1,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        >
          <Text
            style={{
              color: isChosen || isFocused ? '#ffffff' : '#111827',
            }}
          >
            {actionMenuRowLabel(row)}
          </Text>
        </Pressable>
      )
    })}
  </>
)
