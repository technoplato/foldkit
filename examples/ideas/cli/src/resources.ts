import {
  StaticIdeasResources,
  makeLiveIdeasResources,
  schema,
} from 'ideas-core-example'

import { withHostedIdentity } from '@foldkit/instant'
import { init } from '@instantdb/core'

const defaultHostedIdentityOrigin = 'https://ideas.knophy.com'

let cached: ReturnType<typeof init> | undefined

const ideasDatabase = () => {
  const appId = process.env['INSTANT_APP_ID']
  if (appId === undefined || appId === '') {
    return undefined
  }
  if (cached === undefined) {
    cached = init({ appId, schema })
  }
  return cached
}

/** Node hosts use INSTANT_APP_ID when present, otherwise the seed catalog. */
export const ideasResources = () => {
  const database = ideasDatabase()
  if (database === undefined) {
    return StaticIdeasResources
  }
  return withHostedIdentity(
    makeLiveIdeasResources(database as never),
    database,
    { sessionOrigin: defaultHostedIdentityOrigin },
  )
}
