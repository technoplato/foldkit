import { Option } from 'effect'
import type { Runtime } from 'foldkit'
import type { Url } from 'foldkit/url'

import { FetchIndex, FetchUnderstanding } from './command'
import type { Message } from './message'
import { IndexData, type Model, UnderstandingData } from './model'
import { urlToDestination } from './route'
import { openBuildFor } from './update'

// INIT

export const init: Runtime.RoutingApplicationInit<Model, Message> = (
  url: Url,
) => {
  const destination = urlToDestination(url)
  const [maybeOpenBuild, buildCommands] = openBuildFor(
    destination,
    Option.none(),
  )
  return [
    {
      destination,
      index: IndexData.Loading(),
      understanding: UnderstandingData.Loading(),
      maybeOpenBuild,
      maybeHover: Option.none(),
    },
    [FetchIndex(), FetchUnderstanding(), ...buildCommands],
  ]
}
