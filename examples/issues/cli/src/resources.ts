import { Array, Data, Effect, Option, String } from 'effect'
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
  type InstantToolsDatabase,
  InstantToolsSchema,
  makeInstantEntityStore,
  makeInstantIssueRecord,
} from '@foldkit/instant-tools/instant'
import {
  IssueQuery,
  type IssueTrackerError,
  type IssueTrackerService,
} from '@foldkit/instant-tools/issues'
import { init as initAdmin, lookup } from '@instantdb/admin'

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

const applyLine = (line: string): void => {
  const trimmed = line.trim()
  if (trimmed === '' || trimmed.startsWith('#')) {
    return
  }
  const maybeSeparator = String.indexOf('=')(trimmed)
  if (Option.isNone(maybeSeparator)) {
    return
  }
  const key = trimmed.slice(0, maybeSeparator.value)
  const value = unquote(trimmed.slice(maybeSeparator.value + 1))
  if (key === '' || process.env[key] !== undefined) {
    return
  }
  process.env[key] = value
}

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
  const lines = readFileSync(path, 'utf8').split('\n')
  for (const fileLine of lines) {
    applyLine(fileLine)
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

/**
 * Adapts Instant's admin client to the client surface the tracker reads.
 * Instant core refuses Node, and the admin client has no live queries, so a
 * subscription answers with one snapshot. A one-shot command patches its
 * Model from each Command's result, so it never needs a second snapshot, and
 * no timer is left to hold the process open.
 */
const adminAsInstantToolsDatabase = (
  admin: ReturnType<typeof initAdmin>,
): InstantToolsDatabase => {
  const answers = new Map<string, Promise<unknown>>()
  const readOnce = (query: unknown): Promise<unknown> => {
    const key = JSON.stringify(query)
    // oxlint-disable-next-line typescript/consistent-type-assertions
    const answer = answers.get(key) ?? admin.query(query as never)
    answers.set(key, answer)
    answer.catch(() => answers.delete(key))
    return answer
  }
  return adminDatabase(admin, readOnce, () => answers.clear())
}

/**
 * The read-once adapter behind `adminAsInstantToolsDatabase`: one command
 * reads the 7 MB catalog once, not once for the first snapshot and again for
 * the subscription, and every write forgets what was read, so a check after a
 * write reads the store again.
 */
const adminDatabase = (
  admin: ReturnType<typeof initAdmin>,
  readOnce: (query: unknown) => Promise<unknown>,
  forgetReads: () => void,
): InstantToolsDatabase =>
  // NOTE: a structural adapter: the admin client lacks core's typings.
  // oxlint-disable-next-line typescript/consistent-type-assertions
  ({
    queryOnce: async (
      query: Parameters<InstantToolsDatabase['queryOnce']>[0],
    ) => {
      const data = await readOnce(query)
      return { data }
    },
    subscribeQuery: (
      query: Parameters<InstantToolsDatabase['subscribeQuery']>[0],
      onResponse: Parameters<InstantToolsDatabase['subscribeQuery']>[1],
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
    transact: (ops: Parameters<InstantToolsDatabase['transact']>[0]) => {
      forgetReads()
      // oxlint-disable-next-line typescript/consistent-type-assertions
      return admin.transact(ops as never).finally(forgetReads)
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
  }) as unknown as InstantToolsDatabase

/**
 * The stored records behind Issues, read without decoding them: the numbers
 * in use, to account for every stored Issue, and one number's raw records, to
 * back them up before a delete.
 */
export type IssueRecordsService = Readonly<{
  fetchIssueIds: Effect.Effect<
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
  files: IssueFilesService
  records: IssueRecordsService
  resources: ReturnType<typeof makeLiveIssueTrackerResources>
}>

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
    schema: InstantToolsSchema,
    ...(apiURI === undefined ? {} : { apiURI }),
  })
  const database = adminAsInstantToolsDatabase(admin)
  const store = makeInstantEntityStore(database)
  return {
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
    resources: makeLiveIssueTrackerResources(database),
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
  fetchIssueIds: tracker
    .fetch(everyIssue)
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
