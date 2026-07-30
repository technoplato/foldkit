import { Layer } from 'effect'
import {
  IssueIdentity,
  LiveIssueIdentity,
  StaticIssueTrackerResources,
} from 'issues-core-example'
import { makeIssueTrackerReactClient } from 'issues-react-bindings-example'

import {
  InstantToolsSchema,
  makeInstantToolsLayer,
} from '@foldkit/instant-tools/instant'
import { init } from '@instantdb/core'

const appId = import.meta.env['VITE_INSTANT_APP_ID']
const resources =
  appId === undefined || appId === ''
    ? StaticIssueTrackerResources
    : Layer.merge(
        makeInstantToolsLayer(init({ appId, schema: InstantToolsSchema })),
        Layer.succeed(IssueIdentity, LiveIssueIdentity),
      )

/** The React host selects live Instant resources when configured. */
export const IssueTrackerClient = makeIssueTrackerReactClient(resources)
