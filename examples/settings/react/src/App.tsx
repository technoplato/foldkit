import { Path } from 'settings-core-example'
import 'settings-react-bindings-example'

import { ProgramKeyBindings } from '@foldkit/react'

import { ScreenApp } from './ScreenApp.js'

export const App = () => (
  <ProgramKeyBindings path={Path()}>
    <ScreenApp />
  </ProgramKeyBindings>
)
