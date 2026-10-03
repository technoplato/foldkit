import { Match as M } from 'effect'
import { StatusBar } from 'expo-status-bar'
import type { ReactElement, ReactNode } from 'react'
import { Text, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'

import {
  ActionMenuButton,
  type PaintStyles,
  useStatus,
} from '@foldkit/react-native/interaction'
import {
  FoldkitStack,
  useDeepLinks,
} from '@foldkit/react-native/react-navigation'

const styles: PaintStyles = {
  Text: { fontSize: 72, fontVariant: ['tabular-nums'], fontWeight: '600' },
  Button: { borderRadius: 0, paddingVertical: 14 },
  Row: { marginTop: 24 },
}

/**
 * The Expo Counter window. It shows the Program's navigation as a native
 * stack, opens the action menu from a floating button, and presents the
 * menu as a transparent route, all through `@foldkit/react-native`. A
 * swipe or the Android back button goes back through the Program, and
 * `foldkit-counter://counter/session` opens the Session page. It never
 * names Increment, Decrement, Reset, or a route.
 */
export const App = (): ReactElement => {
  useDeepLinks()
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={{ backgroundColor: '#ffffff', flex: 1 }}>
        {M.value(useStatus()).pipe(
          M.withReturnType<ReactNode>(),
          M.tagsExhaustive({
            Starting: ({ description }) => <Status>{description}</Status>,
            Failed: ({ description }) => <Status>{description}</Status>,
            Ready: () => <FoldkitStack styles={styles} />,
          }),
        )}
        <ActionMenuButton />
      </SafeAreaView>
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
