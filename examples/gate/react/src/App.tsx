import { Path } from 'gate-core-example'
import 'gate-react-bindings-example'

import { ProgramKeyBindings } from '@foldkit/react'

import { ScreenApp } from './ScreenApp.js'

export const App = () => (
  <ProgramKeyBindings path={Path()}>
    <ScreenApp />
  </ProgramKeyBindings>
)
