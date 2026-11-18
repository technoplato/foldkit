import { Runtime } from 'foldkit'

import { init } from './init'
import { ChangedUrl, ClickedLink, Message } from './message'
import { Model } from './model'
import { update } from './update'
import { view } from './view/index'

const application = Runtime.makeApplication({
  Model,
  Message,
  init,
  update,
  view,
  container: document.getElementById('root'),
  routing: {
    onUrlRequest: request => ClickedLink({ request }),
    onUrlChange: url => ChangedUrl({ url }),
  },
})

Runtime.run(application)
