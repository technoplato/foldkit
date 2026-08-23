import { useState } from 'react'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import {
  SongbookProgram,
  emptyModel,
  messageFromToken,
  songbookScreen,
} from 'songbook-core-example'

import { paintScreen } from './paintScreen.js'

/** Draws one Songbook window from the Program screen tree. */
export const App = () => {
  const [model, setModel] = useState(emptyModel)
  const sendToken = (token: string) => {
    const message = messageFromToken(token, model)
    if (message === undefined) {
      return
    }
    setModel(SongbookProgram.update(model, message)[0])
  }
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ backgroundColor: '#ffffff', flex: 1 }}>
        {paintScreen(songbookScreen(model), sendToken)}
      </SafeAreaView>
    </SafeAreaProvider>
  )
}
