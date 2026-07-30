# @foldkit/instant-tools

Transport-neutral structured logging and issue tracking for Effect applications.

The package keeps its portable domain separate from persistence:

- `@foldkit/instant-tools/issues` defines Issue, Attachment, Mention, work-log, reference, query, escalation, and `IssueTracker` service types.
- `@foldkit/instant-tools/logging` defines structured Log Events, source locations, levels, and the `Logger` service.
- `@foldkit/instant-tools/instant` supplies queryable InstantDB envelopes and adapters for those services.

Issue references are an algebraic data type that can link an Issue to an Agent, Commit, Media artifact, Project, exact Recording position, Release, or URI. Attachments preserve their content type, digest, capture time, and tagged durable source. A first unique Mention preserves the Issue's baseline priority. Each later unique Mention moves it one step toward P0; retries with the same Mention id are idempotent.

## Install

```bash
pnpm add @foldkit/instant-tools @instantdb/core effect
```

## Host-owned InstantDB setup

The application owns its InstantDB app id and credential loading. Initialize the client at the host boundary, then pass it to the adapter:

```typescript
import {
  InstantToolsSchema,
  makeInstantToolsLayer,
} from '@foldkit/instant-tools/instant'
import { init } from '@instantdb/core'

const database = init({
  appId: process.env.INSTANT_APP_ID,
  schema: InstantToolsSchema,
})

const InstantToolsLive = makeInstantToolsLayer(database)
```

An application with an existing InstantDB schema can compose
`InstantToolsEntities` into its own entity definition rather than using the
standalone schema:

```typescript
import { InstantToolsEntities } from '@foldkit/instant-tools/instant'
import { i } from '@instantdb/core'

const ApplicationSchema = i.schema({
  entities: {
    ...InstantToolsEntities,
    notes: i.entity({
      body: i.string(),
    }),
  },
})
```

Keep development credentials in the machine's environment or secret manager,
outside application source and Git. On this development Mac, source the neutral
`~/.config/instant-tools/instant.env` path before launching a local host. Client
applications use `INSTANT_APP_ID`; never deliver `INSTANT_APP_ADMIN_TOKEN` to a
browser or device application.

## Portable domains

The core modules do not import InstantDB. A test, local store, or different remote transport can implement the same service capabilities:

```typescript
import { Effect, Option } from 'effect'

import {
  ApplicationProduct,
  Issue,
  IssueQuery,
  IssueTracker,
} from '@foldkit/instant-tools/issues'

const issue = Issue.make({
  attachments: [],
  createdAtMs: Date.now(),
  details: 'Timestamp should be in the right gutter.',
  id: 'issue-021',
  mentions: [],
  priority: 'P1',
  product: ApplicationProduct.make({
    id: 'scribe',
    name: 'Scribe',
  }),
  projectId: Option.some('transcript-ui'),
  sourceDocument: Option.none(),
  status: 'InProgress',
  title: 'Put the full recording timestamp in the gutter',
  updatedAtMs: Date.now(),
  workLog: [],
})

const program = Effect.gen(function* () {
  const tracker = yield* IssueTracker
  yield* tracker.save(issue)
  return yield* tracker.fetch(
    IssueQuery.make({
      limit: 100,
      productId: Option.some('scribe'),
      projectId: Option.some('transcript-ui'),
      statuses: ['InProgress'],
    }),
  )
})
```
