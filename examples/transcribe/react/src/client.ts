import {
  StaticTranscribeResources,
  makeLiveTranscribeResources,
  schema,
} from 'transcribe-core-example'
import { makeTranscribeReactClient } from 'transcribe-react-bindings-example'

import { withHostedIdentity } from '@foldkit/instant'
import { init } from '@instantdb/core'

const appId = import.meta.env['VITE_INSTANT_APP_ID']
const database =
  appId === undefined || appId === '' ? undefined : init({ appId, schema })
const resources =
  database === undefined
    ? StaticTranscribeResources
    : withHostedIdentity(
        makeLiveTranscribeResources(database as never),
        database,
      )

/** The React host selects live Instant resources when configured. */
export const TranscribeClient = makeTranscribeReactClient(resources)
