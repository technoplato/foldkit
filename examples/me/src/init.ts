import type { Runtime } from 'foldkit'
import type { Url } from 'foldkit/url'

import { FetchMe } from './command'
import type { Message } from './message'
import { MeData, type Model, UnderstandingData } from './model'
import { urlToDestination } from './route'

// INIT

export const init: Runtime.RoutingApplicationInit<Model, Message> = (
  url: Url,
) => [
  {
    destination: urlToDestination(url),
    me: MeData.Loading(),
    understanding: UnderstandingData.Idle(),
  },
  [FetchMe()],
]
