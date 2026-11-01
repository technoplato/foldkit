import {
  NoIssueLandings,
  StaticIssueTrackerResources,
  instantIssueLandings,
  makeLiveIssueTrackerResources,
  signedInAuthor,
} from 'issues-core-example'
import { makeIssueTrackerReactClient } from 'issues-react-bindings-example'

import { withHostedIdentity } from '@foldkit/instant'
import { InstantToolsSchemaWithFiles } from '@foldkit/instant-tools/instant'
import { init } from '@instantdb/core'

import { indexedDbIssueCatalogCache } from './issueCatalogCache.js'
import { openedScribeDatabase } from './scribeDatabase.js'

const appId = import.meta.env['VITE_INSTANT_APP_ID']
const scribeAppId = import.meta.env['VITE_SCRIBE_INSTANT_APP_ID']
const database =
  appId === undefined || appId === ''
    ? undefined
    : init({ appId, schema: InstantToolsSchemaWithFiles })
const landings =
  scribeAppId === undefined || scribeAppId === ''
    ? NoIssueLandings
    : instantIssueLandings(openedScribeDatabase(scribeAppId))
const resources =
  database === undefined
    ? StaticIssueTrackerResources
    : withHostedIdentity(
        makeLiveIssueTrackerResources(
          database,
          signedInAuthor(database),
          landings,
          indexedDbIssueCatalogCache(),
        ),
        database,
      )

/** The React host selects live Instant resources when configured. */
export const IssueTrackerClient = makeIssueTrackerReactClient(resources)
