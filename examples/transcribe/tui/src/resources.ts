import {
  StaticTranscribeResources,
  makeLiveTranscribeResources,
  schema,
} from 'transcribe-core-example'

import { withHostedIdentity } from '@foldkit/instant'
import { init } from '@instantdb/core'

const defaultHostedIdentityOrigin = 'https://transcribe.knophy.com'

let cached: ReturnType<typeof init> | undefined

const transcribeDatabase = () => {
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
export const transcribeResources = () => {
  const database = transcribeDatabase()
  if (database === undefined) {
    return StaticTranscribeResources
  }
  return withHostedIdentity(
    makeLiveTranscribeResources(database as never),
    database,
    { sessionOrigin: defaultHostedIdentityOrigin },
  )
}
