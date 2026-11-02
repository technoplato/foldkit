import {
  NoGraphRows,
  NoIssueLandings,
  NoIssueViews,
  StaticIssueTrackerResources,
  instantGraphRows,
  instantIssueLandings,
  instantIssueViews,
  makeLiveIssueTrackerResources,
  signedInAuthor,
} from 'issues-core-example'
import { makeIssueTrackerReactClient } from 'issues-react-bindings-example'

import { withHostedIdentity } from '@foldkit/instant'
import { InstantToolsSchemaWithFiles } from '@foldkit/instant-tools/instant'
import { init } from '@instantdb/core'

import { indexedDbIssueCatalogCache } from './issueCatalogCache.js'
import {
  openedScribeDatabase,
  scribeGraph,
  scribeLandings,
  scribeViews,
} from './scribeDatabase.js'

const appId = import.meta.env['VITE_INSTANT_APP_ID']
const scribeAppId = import.meta.env['VITE_SCRIBE_INSTANT_APP_ID']
const database =
  appId === undefined || appId === ''
    ? undefined
    : init({ appId, schema: InstantToolsSchemaWithFiles })
const scribe =
  scribeAppId === undefined || scribeAppId === ''
    ? undefined
    : openedScribeDatabase(scribeAppId)
const landings =
  scribe === undefined
    ? NoIssueLandings
    : instantIssueLandings(scribeLandings(scribe))
const views =
  scribe === undefined ? NoIssueViews : instantIssueViews(scribeViews(scribe))
const graph =
  scribe === undefined ? NoGraphRows : instantGraphRows(scribeGraph(scribe))
const resources =
  database === undefined
    ? StaticIssueTrackerResources
    : withHostedIdentity(
        makeLiveIssueTrackerResources(
          database,
          signedInAuthor(database),
          landings,
          indexedDbIssueCatalogCache(),
          graph,
          views,
        ),
        database,
      )

/** The React host selects live Instant resources when configured. */
export const IssueTrackerClient = makeIssueTrackerReactClient(resources)
