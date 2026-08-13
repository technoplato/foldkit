import { ChangedUrl, ClickedLink } from 'books-core-example'
import { Layer } from 'effect'
import { Runtime } from 'foldkit'

import { overlay } from '@foldkit/devtools'

import { view } from './index.js'
import { APPEARANCE_STORAGE_KEY, BooksFoldkitProgram } from './playback.js'

const persistAppearance = (appearance: 'light' | 'dark'): void => {
  document.documentElement.dataset['theme'] = appearance
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, appearance)
  } catch {
    return
  }
}

const application = Runtime.makeFoldkitApplication({
  container: document.getElementById('root'),
  devTools: {
    overlay,
  },
  onModel: model => {
    persistAppearance(model.appearance)
  },
  program: BooksFoldkitProgram,
  resources: Layer.empty,
  routing: {
    onUrlChange: url => ChangedUrl({ url }),
    onUrlRequest: request => ClickedLink({ request }),
  },
  view,
})

Runtime.run(application)
