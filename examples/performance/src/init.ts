import { Option } from 'effect'
import type { Runtime } from 'foldkit'
import type { Url } from 'foldkit/url'

import { FetchIndex, FetchPipeline } from './command'
import type { Message } from './message'
import { IndexData, type Model, PipelineData } from './model'
import { urlToDestination } from './route'
import { movedPageCommands, openBuildFor } from './update'

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
      pipeline: PipelineData.Loading(),
      maybeOpenBuild,
      maybeHover: Option.none(),
    },
    [
      FetchIndex(),
      FetchPipeline(),
      ...buildCommands,
      ...movedPageCommands(destination),
    ],
  ]
}
