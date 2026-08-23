import {
  IngestProgram,
  emptyModel,
  ingestScreen,
  messageFromToken,
} from 'ingest-core-example'
import { useState } from 'react'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'

import { paintScreen } from './paintScreen.js'

/** Draws one Ingest window from the Program screen tree. */
export const App = () => {
  const [model, setModel] = useState(emptyModel)
  const sendToken = (token: string) => {
    const message = messageFromToken(token, model)
    if (message === undefined) {
      return
    }
    setModel(IngestProgram.update(model, message)[0])
  }
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ backgroundColor: '#ffffff', flex: 1 }}>
        {paintScreen(ingestScreen(model), sendToken)}
      </SafeAreaView>
    </SafeAreaProvider>
  )
}
