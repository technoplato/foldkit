import {
  GateProgram,
  emptyModel,
  gateScreen,
  messageFromToken,
} from 'gate-core-example'
import { useState } from 'react'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'

import { paintScreen } from './paintScreen.js'

/** Draws one Gate window from the Program screen tree. */
export const App = () => {
  const [model, setModel] = useState(emptyModel)
  const sendToken = (token: string) => {
    const message = messageFromToken(token)
    if (message === undefined) {
      return
    }
    setModel(GateProgram.update(model, message)[0])
  }
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ backgroundColor: '#ffffff', flex: 1 }}>
        {paintScreen(gateScreen(model), sendToken)}
      </SafeAreaView>
    </SafeAreaProvider>
  )
}
