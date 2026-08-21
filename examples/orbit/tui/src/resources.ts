import {
  StaticOrbitResources,
  makeLiveOrbitResources,
  schema,
} from 'orbit-core-example'

import { withHostedIdentity } from '@foldkit/instant'
import { init } from '@instantdb/core'

const defaultHostedIdentityOrigin = 'https://orbit.knophy.com'

let cached: ReturnType<typeof init> | undefined

const orbitDatabase = () => {
  const appId = process.env['INSTANT_APP_ID']
  if (appId === undefined || appId === '') {
    return undefined
  }
  if (cached === undefined) {
    cached = init({ appId, schema })
  }
  return cached
}

/** Node hosts use INSTANT_APP_ID when present, otherwise the static snap. */
export const orbitResources = () => {
  const database = orbitDatabase()
  if (database === undefined) {
    return StaticOrbitResources
  }
  return withHostedIdentity(makeLiveOrbitResources(database), database, {
    sessionOrigin: defaultHostedIdentityOrigin,
  })
}
