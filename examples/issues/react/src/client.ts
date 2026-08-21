import { Layer } from 'effect'
import {
  IssueIdentity,
  LiveIssueIdentity,
  StaticIssueTrackerResources,
} from 'issues-core-example'
import { makeIssueTrackerReactClient } from 'issues-react-bindings-example'

import { withHostedIdentity } from '@foldkit/instant'
import {
  InstantToolsSchema,
  makeInstantToolsLayer,
} from '@foldkit/instant-tools/instant'
import { init } from '@instantdb/core'

const appId = import.meta.env['VITE_INSTANT_APP_ID']
const database =
  appId === undefined || appId === ''
    ? undefined
    : init({ appId, schema: InstantToolsSchema })
const resources =
  database === undefined
    ? StaticIssueTrackerResources
    : withHostedIdentity(
        Layer.merge(
          makeInstantToolsLayer(database),
          Layer.succeed(IssueIdentity, LiveIssueIdentity),
        ),
        database,
      )

/** The React host selects live Instant resources when configured. */
export const IssueTrackerClient = makeIssueTrackerReactClient(resources)
