import { startExpoCounter } from 'counter-expo-example/start'
import { StatusBar } from 'expo-status-bar'
import type { ReactElement } from 'react'
import { Pressable, Text } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { FoldkitRouterStack } from '@foldkit/react-native/expo-router'
import {
  type PaintStyles,
  ProgramProvider,
  useBound,
} from '@foldkit/react-native/interaction'

const bound = startExpoCounter()

const styles: PaintStyles = {
  Text: { fontSize: 72, fontVariant: ['tabular-nums'], fontWeight: '600' },
  Button: { borderRadius: 0, paddingVertical: 14 },
  Row: { marginTop: 24 },
}

const ActionsButton = (): ReactElement => {
  const bound = useBound()
  return (
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
  )
}

/**
 * The Expo Router root layout. Every screen comes from the Counter's
 * declaration: `/counter`, `/counter/session`, and `/counter/menu?menu.q=re`
 * render through the one catch-all route, and
 * `foldkit-counter-router://counter/session` opens the Session page. It
 * never names an Action or a route.
 */
export default function Layout(): ReactElement {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <ProgramProvider bound={bound}>
        <FoldkitRouterStack styles={styles} />
        <ActionsButton />
      </ProgramProvider>
    </SafeAreaProvider>
  )
}
