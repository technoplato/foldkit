import { Match as M, Option } from 'effect'
import { StatusBar } from 'expo-status-bar'
import type { ReactElement, ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'

import { useBound, useStatus } from '@foldkit/react/interaction'

import { ActionMenuModal } from './ActionMenuModal.js'
import { paintScreen } from './paintScreen.js'

/**
 * The Expo Counter window. It paints the Program's screen, opens the action
 * menu from a floating button, and presents the menu as a Modal, all
 * through the generic adapter. It never names Increment, Decrement, or
 * Reset.
 */
export const App = (): ReactElement => {
  const bound = useBound()
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={{ backgroundColor: '#ffffff', flex: 1 }}>
        {M.value(useStatus()).pipe(
          M.withReturnType<ReactNode>(),
          M.tagsExhaustive({
            Starting: () => <Status>Starting Instant Counter…</Status>,
            Failed: ({ description }) => <Status>{description}</Status>,
            Ready: () => (
              <View
                style={{
                  alignItems: 'center',
                  flex: 1,
                  justifyContent: 'center',
                  padding: 24,
                }}
              >
                {Option.match(bound.screen(), {
                  onNone: () => null,
                  onSome: screen =>
                    paintScreen(screen, button => {
                      if (button.action !== undefined) {
                        bound.press(button.action)
                      }
                    }),
                })}
              </View>
            ),
          }),
        )}
        <Pressable
          accessibilityLabel="Actions"
          accessibilityRole="button"
          onPress={() => {
            bound.openMenu()
          }}
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
      <ActionMenuModal />
    </SafeAreaProvider>
  )
}

const Status = ({ children }: Readonly<{ children: ReactNode }>) => (
  <View
    style={{
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
      padding: 24,
    }}
  >
    <Text style={{ color: '#111827', fontSize: 18, textAlign: 'center' }}>
      {children}
    </Text>
  </View>
)
