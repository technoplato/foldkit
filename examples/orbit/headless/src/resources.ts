import { init } from '@instantdb/core'
import {
  StaticOrbitResources,
  makeLiveOrbitResources,
  schema,
} from 'orbit-core-example'

/** Node hosts use INSTANT_APP_ID when present, otherwise the static snap. */
export const orbitResources = () => {
  const appId = process.env['INSTANT_APP_ID']
  if (appId === undefined || appId === '') {
    return StaticOrbitResources
  }
  return makeLiveOrbitResources(init({ appId, schema }))
}
