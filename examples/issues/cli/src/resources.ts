import {
  Array,
  Data,
  Effect,
  Option,
  Result,
  Schema as S,
  Schedule,
  String,
} from 'effect'
import {
  StaticIssueTrackerResources,
  makeLiveIssueTrackerResources,
} from 'issues-core-example'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import {
  type InstantEntityStoreError,
  type InstantIssueRecord,
  type InstantToolsDatabaseWithFiles,
  InstantToolsSchemaWithFiles,
  makeInstantEntityStore,
  makeInstantIssueRecord,
} from '@foldkit/instant-tools/instant'
import {
  IssueQuery,
  type IssueStatus,
  type IssueTrackerError,
  type IssueTrackerService,
  describeIssueTrackerCause,
} from '@foldkit/instant-tools/issues'
import { InstantAPIError, init as initAdmin, lookup } from '@instantdb/admin'

import {
  type BuildJobsReader,
  type ScribeQuery,
  UnavailableBuildJobs,
  readBuildJobs,
} from './builds.js'
import { type IssueFilesService } from './commands.js'

/** Instant Tools env documented by the issues example and listener. */
export const documentedInstantEnvPath = join(
  homedir(),
  '.config',
  'instant-tools',
  'instant.env',
)

/** Instant credentials are missing after loading the documented env. */
export class IssuesInstantConfigError extends Data.TaggedError(
  'IssuesInstantConfigError',
)<{
  readonly message: string
}> {}

const unquote = (value: string): string => {
  const isWrapped =
    value.length >= 2 &&
    ((value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"')))
  if (isWrapped) {
    return value.slice(1, -1)
  }
  return value
}

type EnvEntry = Readonly<{ key: string; value: string }>

const exportPrefix = /^export\s+/

const envEntryOf = (line: string): Option.Option<EnvEntry> => {
  const trimmed = line.trim()
  if (trimmed === '' || trimmed.startsWith('#')) {
    return Option.none()
  }
  return Option.flatMap(String.indexOf('=')(trimmed), separator => {
    const key = trimmed.slice(0, separator).replace(exportPrefix, '')
    if (key === '') {
      return Option.none()
    } else {
      return Option.some({
        key,
        value: unquote(trimmed.slice(separator + 1)),
      })
    }
  })
}

/**
 * The `KEY=value` lines of an env file, in order: blank lines and `#`
 * comments are skipped, and an `export ` prefix and one pair of quotes around
 * the value are removed, so `export SCRIBE_MAIN_INSTANT_APP_ID='abc'` reads
 * as `SCRIBE_MAIN_INSTANT_APP_ID` = `abc`.
 */
export const envFileEntries = (text: string): ReadonlyArray<EnvEntry> =>
  Array.getSomes(Array.map(text.split('\n'), envEntryOf))

/** Fills missing Instant keys from the documented Instant Tools env file. */
export const loadDocumentedInstantEnv = (): void => {
  const override = process.env['INSTANT_TOOLS_ENV_FILE']
  const path =
    override !== undefined && override !== ''
      ? override
      : documentedInstantEnvPath
  if (!existsSync(path)) {
    return
  }
  for (const { key, value } of envFileEntries(readFileSync(path, 'utf8'))) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

const envValue = (name: string): string | undefined => {
  const value = process.env[name]
  if (value === undefined || value === '') {
    return undefined
  }
  return value
}

const instantAppId = (): string | undefined =>
  envValue('INSTANT_APP_ID') ??
  envValue('ISSUES_INSTANT_APP_ID') ??
  envValue('VITE_INSTANT_APP_ID')

const instantAdminToken = (): string | undefined =>
  envValue('INSTANT_APP_ADMIN_TOKEN') ?? envValue('INSTANT_ADMIN_TOKEN')

const instantApiUri = (): string | undefined =>
  envValue('INSTANT_API_URI') ??
  envValue('INSTANT_API_URL') ??
  envValue('VITE_INSTANT_API_URI')

const RATE_LIMITED_STATUS = 429

const rateLimitWording = /rate limit/i

/**
 * Whether Instant turned a request away for coming too fast: HTTP 429, type
 * `rate-limited`, or its wording, "Your request exceeded the rate limit." A
 * rate-limited request was not applied, so sending it again is safe.
 */
export const isRateLimited = (cause: unknown): boolean => {
  if (cause instanceof InstantAPIError) {
    return (
      cause.status === RATE_LIMITED_STATUS ||
      cause.body?.type === 'rate-limited' ||
      rateLimitWording.test(cause.message)
    )
  }
  return cause instanceof Error && rateLimitWording.test(cause.message)
}

/**
 * How a rate-limited request is sent again: after about 500 ms, then twice as
 * long each time, jittered so agents that met the limit together spread out,
 * five times (about 15 s in all). Instant asks for 1 s (#1329).
 */
export const rateLimitRetry: Schedule.Schedule<unknown, unknown> =
  Schedule.exponential('500 millis').pipe(
    Schedule.jittered,
    Schedule.upTo({ times: 5 }),
  )

const sendRetryingRateLimits = <A>(
  request: () => Promise<A>,
  retry: Schedule.Schedule<unknown, unknown>,
): Promise<A> =>
  Effect.runPromise(
    Effect.retry(Effect.tryPromise({ try: request, catch: cause => cause }), {
      schedule: retry,
      while: isRateLimited,
    }),
  )

/** The admin client surface the adapter uses. */

export type InstantAdminClient = Readonly<{
  query: (query: never) => Promise<unknown>
  transact: (ops: never) => Promise<unknown>
  tx: object
}>

/**
 * The read-once adapter behind `adminAsInstantToolsDatabase`: one command
 * reads the catalog (18.6 MB on 2026-10-29) once, not once for the first snapshot and again for
 * the subscription, and every write forgets what was read, so a check after a
 * write reads the store again.
 */
const adminDatabase = (
  admin: InstantAdminClient,
  readOnce: (query: unknown) => Promise<unknown>,
  write: (ops: unknown) => Promise<unknown>,
  forgetReads: () => void,
): InstantToolsDatabaseWithFiles =>
  // NOTE: a structural adapter: the admin client lacks core's typings.
  // oxlint-disable-next-line typescript/consistent-type-assertions
  ({
    queryOnce: async (
      query: Parameters<InstantToolsDatabaseWithFiles['queryOnce']>[0],
    ) => {
      const data = await readOnce(query)
      return { data }
    },
    subscribeQuery: (
      query: Parameters<InstantToolsDatabaseWithFiles['subscribeQuery']>[0],
      onResponse: Parameters<
        InstantToolsDatabaseWithFiles['subscribeQuery']
      >[1],
    ) => {
      const subscription = { isRunning: true }
      void readOnce(query).then(
        data => {
          if (subscription.isRunning) {
            // oxlint-disable-next-line typescript/consistent-type-assertions
            onResponse({ data } as never)
          }
        },
        error => {
          if (subscription.isRunning) {
            // oxlint-disable-next-line typescript/consistent-type-assertions
            onResponse({ error } as never)
          }
        },
      )
      return () => {
        subscription.isRunning = false
      }
    },
    transact: (
      ops: Parameters<InstantToolsDatabaseWithFiles['transact']>[0],
    ) => {
      forgetReads()
      return write(ops).finally(forgetReads)
    },
    tx: new Proxy(admin.tx, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver)
        if (property !== 'instantToolsIssues') {
          return value
        }
        return new Proxy(value, {
          get(issues, issuesProperty, issuesReceiver) {
            if (issuesProperty === 'lookup') {
              return (field: string, lookupValue: string) =>
                issues[lookup(field, lookupValue)]
            }
            return Reflect.get(issues, issuesProperty, issuesReceiver)
          },
        })
      },
    }),
    // oxlint-disable-next-line typescript/consistent-type-assertions
  }) as unknown as InstantToolsDatabaseWithFiles

/**
 * Adapts Instant's admin client to the client surface the tracker reads.
 * Instant core refuses Node, and the admin client has no live queries, so a
 * subscription answers with one snapshot. A one-shot command patches its
 * Model from each Command's result, so it never needs a second snapshot, and
 * no timer is left to hold the process open. Every read and write that meets
 * Instant's rate limit is sent again on `retry`, so a command never fails
 * for having come too fast.
 */
export const adminAsInstantToolsDatabase = (
  admin: InstantAdminClient,
  retry: Schedule.Schedule<unknown, unknown> = rateLimitRetry,
): InstantToolsDatabaseWithFiles => {
  const answers = new Map<string, Promise<unknown>>()
  const readOnce = (query: unknown): Promise<unknown> => {
    const key = JSON.stringify(query)
    const answer =
      answers.get(key) ??
      sendRetryingRateLimits(
        // oxlint-disable-next-line typescript/consistent-type-assertions
        () => admin.query(query as never),
        retry,
      )
    answers.set(key, answer)
    answer.catch(() => answers.delete(key))
    return answer
  }
  return adminDatabase(
    admin,
    readOnce,
    ops =>
      sendRetryingRateLimits(
        // oxlint-disable-next-line typescript/consistent-type-assertions
        () => admin.transact(ops as never),
        retry,
      ),
    () => answers.clear(),
  )
}

/**
 * The stored records behind Issues, read without decoding them: the numbers
 * in use, to account for every stored Issue, and one number's raw records, to
 * back them up before a delete.
 */
export type IssueRecordsService = Readonly<{
  fetchIssueIds: (
    statuses: ReadonlyArray<IssueStatus>,
  ) => Effect.Effect<
    ReadonlyArray<string>,
    InstantEntityStoreError | IssueTrackerError
  >
  fetchIssueRecordsById: (
    issueId: string,
  ) => Effect.Effect<
    ReadonlyArray<InstantIssueRecord>,
    InstantEntityStoreError | IssueTrackerError
  >
}>

/** Every live resource the one-shot command needs. */
export type LiveIssueHostServices = Readonly<{
  buildJobs: BuildJobsReader
  credentials: ReadonlyArray<string>
  files: IssueFilesService
  records: IssueRecordsService
  resources: ReturnType<typeof makeLiveIssueTrackerResources>
}>

/**
 * The env file of Scribe's main Instant app, where `issues show` reads an
 * Issue's build jobs (Scribe #1412): `SCRIBE_MAIN_INSTANT_APP_ID` and
 * `SCRIBE_MAIN_INSTANT_ADMIN_TOKEN`.
 */
export const scribeMainEnvPath = join(
  homedir(),
  '.config',
  'instant-tools',
  'scribe-main.env',
)

const scribeAppIdName = 'SCRIBE_MAIN_INSTANT_APP_ID'
const scribeAdminTokenName = 'SCRIBE_MAIN_INSTANT_ADMIN_TOKEN'

/** The app id and admin token of Scribe's main Instant app. */
export const ScribeCredentials = S.Struct({
  adminToken: S.String,
  appId: S.String,
})
/** The app id and admin token of Scribe's main Instant app. */
export type ScribeCredentials = typeof ScribeCredentials.Type

const nonEmpty = (value: string | undefined): Option.Option<string> =>
  Option.filter(Option.fromNullishOr(value), String.isNonEmpty)

/**
 * Scribe's main app credentials: each from `environment`, else from
 * `scribe-main.env` (`envFile`: its text, or why it could not be read). The
 * tracker's own `INSTANT_APP_ID` is never read, so `issues show` cannot ask
 * the tracker's app for Scribe's jobs. A failure names what is missing and
 * where it looked, never a value.
 */
export const scribeCredentialsOf = (
  environment: Readonly<Record<string, string | undefined>>,
  envFile: Result.Result<string, string>,
): Result.Result<ScribeCredentials, string> => {
  const fileEntries = Result.getOrElse(
    Result.map(envFile, envFileEntries),
    () => [],
  )
  const credentialOf = (name: string): Option.Option<string> =>
    Option.orElse(nonEmpty(environment[name]), () =>
      Option.flatMap(
        Array.findFirst(fileEntries, entry => entry.key === name),
        entry => nonEmpty(entry.value),
      ),
    )
  const maybeAppId = credentialOf(scribeAppIdName)
  const maybeAdminToken = credentialOf(scribeAdminTokenName)
  if (Option.isSome(maybeAppId) && Option.isSome(maybeAdminToken)) {
    return Result.succeed(
      ScribeCredentials.make({
        adminToken: maybeAdminToken.value,
        appId: maybeAppId.value,
      }),
    )
  }
  const missing = Array.join(
    [
      ...(Option.isNone(maybeAppId) ? [scribeAppIdName] : []),
      ...(Option.isNone(maybeAdminToken) ? [scribeAdminTokenName] : []),
    ],
    ' and ',
  )
  return Result.fail(
    Result.match(envFile, {
      onFailure: why =>
        `the environment does not set ${missing}, and ${scribeMainEnvPath} could not be read (${why})`,
      onSuccess: () =>
        `neither the environment nor ${scribeMainEnvPath} sets ${missing}`,
    }),
  )
}

/**
 * Sends InstaQL to Scribe's main Instant app as its admin, with no schema, so
 * rows come back as stored. Aborting the signal abandons the request.
 */
export const adminScribeQuery =
  (credentials: ScribeCredentials): ScribeQuery =>
  (query, signal) =>
    initAdmin({
      adminToken: credentials.adminToken,
      appId: credentials.appId,
      disableValidation: true,
    }).query(
      // oxlint-disable-next-line typescript/consistent-type-assertions
      query as never,
      { fetchOpts: { signal } },
    )

/**
 * Reads an Issue's build jobs from Scribe's main Instant app, a second app
 * beside the tracker's (Scribe #1412), with `queryFor`'s client. Without
 * credentials every read answers `UnavailableBuildJobs` naming what is
 * missing, and nothing is sent.
 */
export const scribeBuildJobsReader = (
  credentials: Result.Result<ScribeCredentials, string>,
  queryFor: (credentials: ScribeCredentials) => ScribeQuery = adminScribeQuery,
): BuildJobsReader =>
  Result.match(credentials, {
    onFailure: why => () =>
      Effect.succeed(
        UnavailableBuildJobs.make({
          reason: `no Scribe Instant credentials: ${why}.`,
        }),
      ),
    onSuccess: found => {
      const send = queryFor(found)
      return issueNumber => readBuildJobs(send, issueNumber)
    },
  })

const scribeMainEnvText = (): Result.Result<string, string> => {
  if (!existsSync(scribeMainEnvPath)) {
    return Result.fail('no such file')
  }
  return Result.try({
    try: () => readFileSync(scribeMainEnvPath, 'utf8'),
    catch: describeIssueTrackerCause,
  })
}

const contentDispositionFor = (fileName: string): string =>
  `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`

/**
 * Instant storage through an admin client initialized without a schema: the
 * shared schema links `instantToolsIssues.files` to `$files`, which the Issue
 * Tracker's own schema does not declare.
 */
const liveIssueFiles = (
  files: ReturnType<typeof initAdmin>,
): IssueFilesService => ({
  download: path =>
    Effect.tryPromise(async () => {
      const response = await files.query({ $files: { $: { where: { path } } } })
      const [stored] = response.$files
      if (stored === undefined) {
        throw new Error(`No stored file ${path}.`)
      }
      const url = stored['url']
      if (typeof url !== 'string') {
        throw new Error(`Instant holds no download address for ${path}.`)
      }
      const fetched = await fetch(url)
      if (!fetched.ok) {
        throw new Error(
          `${path}: HTTP ${fetched.status.toString()} ${fetched.statusText}`,
        )
      }
      return new Uint8Array(await fetched.arrayBuffer())
    }),
  link: ({ entityId, fileId }) =>
    Effect.tryPromise(() =>
      files
        .transact(
          files.tx['instantToolsIssues']?.[entityId]?.link({ files: fileId }) ??
            [],
        )
        .then(() => undefined),
    ),
  remove: ({ fileId, path }) =>
    Effect.tryPromise(async () => {
      try {
        await files.transact(files.tx['$files']?.[fileId]?.delete() ?? [])
      } catch {
        await files.storage.delete(path)
      }
    }),
  upload: ({ bytes, contentType, fileName, path }) =>
    Effect.tryPromise(async () => {
      const response = await files.storage.uploadFile(path, bytes, {
        contentDisposition: contentDispositionFor(fileName),
        contentType,
        fileSize: bytes.byteLength,
      })
      const fileId = response.data?.id
      if (typeof fileId !== 'string') {
        throw new Error(`Instant returned no file id for ${path}.`)
      }
      return fileId
    }),
})

/** Who the CLI writes as: `$SCRIBE_AGENT`, or `claude-code` when it is unset. */
export const defaultIssuesAgent = (): string => {
  const value = process.env['SCRIBE_AGENT']
  return value === undefined || value === '' ? 'claude-code' : value
}

/** Live Instant resources for the one-shot CLI, or a missing-config error. */
export const liveIssueHostServices = ():
  | LiveIssueHostServices
  | IssuesInstantConfigError => {
  loadDocumentedInstantEnv()
  const appId = instantAppId()
  if (appId === undefined) {
    return new IssuesInstantConfigError({
      message: `Missing INSTANT_APP_ID. Expected ${documentedInstantEnvPath} (the Instant Tools env) or INSTANT_APP_ID in the process environment.`,
    })
  }
  const adminToken = instantAdminToken()
  if (adminToken === undefined) {
    return new IssuesInstantConfigError({
      message: `Missing INSTANT_APP_ADMIN_TOKEN. Expected ${documentedInstantEnvPath} (the Instant Tools env).`,
    })
  }
  const apiURI = instantApiUri()
  const admin = initAdmin({
    adminToken,
    appId,
    disableValidation: true,
    schema: InstantToolsSchemaWithFiles,
    ...(apiURI === undefined ? {} : { apiURI }),
  })
  const database = adminAsInstantToolsDatabase(admin)
  const store = makeInstantEntityStore(database)
  const scribeCredentials = scribeCredentialsOf(
    process.env,
    scribeMainEnvText(),
  )
  return {
    buildJobs: scribeBuildJobsReader(scribeCredentials),
    credentials: [
      adminToken,
      ...Result.match(scribeCredentials, {
        onFailure: () => [],
        onSuccess: found => [found.adminToken],
      }),
    ],
    files: liveIssueFiles(
      initAdmin({
        adminToken,
        appId,
        ...(apiURI === undefined ? {} : { apiURI }),
      }),
    ),
    records: {
      fetchIssueIds: store.fetchIssueIds,
      fetchIssueRecordsById: store.fetchIssueRecordsById,
    },
    resources: makeLiveIssueTrackerResources(
      database,
      Effect.sync(defaultIssuesAgent),
    ),
  }
}

const everyIssue = IssueQuery.make({
  limit: Number.MAX_SAFE_INTEGER,
  productId: Option.none(),
  projectId: Option.none(),
  statuses: [],
})

/** Stored records read through an in-memory tracker, for tests and previews. */
export const memoryIssueRecords = (
  tracker: IssueTrackerService,
): IssueRecordsService => ({
  fetchIssueIds: statuses =>
    tracker
      .fetch(IssueQuery.make({ ...everyIssue, statuses }))
      .pipe(Effect.map(issues => Array.map(issues, issue => issue.id))),
  fetchIssueRecordsById: issueId =>
    tracker.fetchIssue(issueId).pipe(
      Effect.map(maybeIssue =>
        Option.match(maybeIssue, {
          onNone: () => [],
          onSome: issue => [
            {
              ...makeInstantIssueRecord(issue),
              id: `memory-${issue.id}`,
            },
          ],
        }),
      ),
    ),
})

/** Live layer used by the screen runner (`issues run`). */
export const liveIssueTrackerResources = () => {
  const services = liveIssueHostServices()
  if (services instanceof IssuesInstantConfigError) {
    return services
  }
  return services.resources
}

export { StaticIssueTrackerResources }
