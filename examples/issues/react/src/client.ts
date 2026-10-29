import {
  StaticIssueTrackerResources,
  makeLiveIssueTrackerResources,
  signedInAuthor,
} from 'issues-core-example'
import { makeIssueTrackerReactClient } from 'issues-react-bindings-example'

import { withHostedIdentity } from '@foldkit/instant'
import { InstantToolsSchemaWithFiles } from '@foldkit/instant-tools/instant'
import { init } from '@instantdb/core'

const appId = import.meta.env['VITE_INSTANT_APP_ID']
const database =
  appId === undefined || appId === ''
    ? undefined
    : init({ appId, schema: InstantToolsSchemaWithFiles })
const resources =
  database === undefined
    ? StaticIssueTrackerResources
    : withHostedIdentity(
        makeLiveIssueTrackerResources(database, signedInAuthor(database)),
        database,
      )

/** The React host selects live Instant resources when configured. */
export const IssueTrackerClient = makeIssueTrackerReactClient(resources)
