import { useState } from 'react'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import {
  SettingsProgram,
  emptyModel,
  messageFromToken,
  settingsScreen,
} from 'settings-core-example'

import { paintScreen } from './paintScreen.js'

/** Draws one Settings window from the Program screen tree. */
export const App = () => {
  const [model, setModel] = useState(emptyModel)
  const sendToken = (token: string) => {
    const message = messageFromToken(token)
    if (message === undefined) {
      return
    }
    setModel(SettingsProgram.update(model, message)[0])
  }
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ backgroundColor: '#ffffff', flex: 1 }}>
        {paintScreen(settingsScreen(model), sendToken)}
      </SafeAreaView>
    </SafeAreaProvider>
  )
}
