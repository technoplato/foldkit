import {
  DelayedAdvocacyResources,
  adminAdvocacyClient,
  coreAdvocacyClient,
  liveAdvocacyResources,
  schema,
} from 'advocacy-core-example'

import { withHostedIdentity } from '@foldkit/instant'
import { init as initAdmin } from '@instantdb/admin'
import { init as initCore } from '@instantdb/core'

let cachedCore: ReturnType<typeof initCore> | undefined

const advocacyAppId = (): string | undefined => {
  const appId =
    process.env['INSTANT_APP_ID'] ?? process.env['VITE_INSTANT_APP_ID']
  if (appId === undefined || appId === '') {
    return undefined
  } else {
    return appId
  }
}

const advocacyCoreDatabase = () => {
  const appId = advocacyAppId()
  if (appId === undefined) {
    return undefined
  }
  if (cachedCore === undefined) {
    cachedCore = initCore({ appId, schema })
  }
  return cachedCore
}

/** Node hosts prefer Instant admin, then the public core client, then seed data. */
export const advocacyResources = () => {
  const appId = advocacyAppId()
  const adminToken = process.env['INSTANT_APP_ADMIN_TOKEN']
  if (appId === undefined) {
    return DelayedAdvocacyResources
  }
  if (adminToken !== undefined && adminToken !== '') {
    return liveAdvocacyResources(
      adminAdvocacyClient(
        initAdmin({
          adminToken,
          appId,
          schema,
        }),
      ),
    )
  }
  const database = advocacyCoreDatabase()
  if (database === undefined) {
    return DelayedAdvocacyResources
  }
  return withHostedIdentity(
    liveAdvocacyResources(coreAdvocacyClient(database)),
    database,
  )
}
