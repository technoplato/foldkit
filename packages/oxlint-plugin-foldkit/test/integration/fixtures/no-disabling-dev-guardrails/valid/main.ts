import { Runtime } from 'foldkit'

import { init, Model, update, view } from './app'

export const app = Runtime.makeApplication({ Model, Message, init, update, view })
