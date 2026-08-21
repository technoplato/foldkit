import {
  StaticTranscribeResources,
  makeLiveTranscribeResources,
  schema,
} from 'transcribe-core-example'

import { init } from '@instantdb/core'

/** Node hosts use INSTANT_APP_ID when present, otherwise the seed catalog. */
export const transcribeResources = () => {
  const appId = process.env['INSTANT_APP_ID']
  if (appId === undefined || appId === '') {
    return StaticTranscribeResources
  }
  return makeLiveTranscribeResources(init({ appId, schema }))
}
