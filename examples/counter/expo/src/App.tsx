import { StatusBar } from 'expo-status-bar'
import type { ReactElement } from 'react'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'

import { ActionMenuButton } from '@foldkit/react-native/interaction'
import {
  FoldkitStack,
  useDeepLinks,
} from '@foldkit/react-native/react-navigation'

/**
 * The Expo Counter window. It shows the Program's navigation as a native
 * stack, opens the action menu from a floating button, and presents the
 * menu as a transparent route, all through `@foldkit/react-native`. A
 * swipe or the Android back button goes back through the Program, and
 * `foldkit-counter://counter/session` opens the Session Sheet. It never
 * names Increment, Decrement, Reset, or a route, and writes no words or
 * screen styles: `Starting Counter…` and the look of the count come from
 * the Program and Foldkit.
 */
export const App = (): ReactElement => {
  useDeepLinks()
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={{ backgroundColor: '#ffffff', flex: 1 }}>
        <FoldkitStack />
        <ActionMenuButton />
      </SafeAreaView>
    </SafeAreaProvider>
  )
}
