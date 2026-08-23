import { Data, Effect, Layer, Option, String } from 'effect'
import {
  IssueIdentity,
  StaticIssueTrackerResources,
  makeLiveIssueTrackerResources,
} from 'issues-core-example'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import {
  type InstantToolsDatabase,
  InstantToolsSchema,
} from '@foldkit/instant-tools/instant'
import { init as initAdmin, lookup } from '@instantdb/admin'

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
  envValue('INSTANT_APP_ADMIN_TOKEN')

const instantApiUri = (): string | undefined =>
  envValue('INSTANT_API_URI') ??
  envValue('INSTANT_API_URL') ??
  envValue('VITE_INSTANT_API_URI')

const adminPollMs = 1_000

/** Instant core refuses Node; admin query/transact is the Node Instant surface. */
const adminAsInstantToolsDatabase = (
  admin: ReturnType<typeof initAdmin>,
): InstantToolsDatabase =>
  ({
    queryOnce: async (
      query: Parameters<InstantToolsDatabase['queryOnce']>[0],
    ) => {
      const data = await admin.query(query)
      return { data }
    },
    subscribeQuery: (
      query: Parameters<InstantToolsDatabase['subscribeQuery']>[0],
      onResponse: Parameters<InstantToolsDatabase['subscribeQuery']>[1],
    ) => {
      let isRunning = true
      const tick = (): void => {
        void admin.query(query).then(
          data => {
            if (isRunning) {
              onResponse({ data } as never)
              setTimeout(tick, adminPollMs)
            }
          },
          error => {
            if (isRunning) {
              onResponse({ error } as never)
            }
          },
        )
      }
      tick()
      return () => {
        isRunning = false
      }
    },
    transact: (ops: Parameters<InstantToolsDatabase['transact']>[0]) =>
      admin.transact(ops as never),
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
  }) as unknown as InstantToolsDatabase

let cachedDatabase: InstantToolsDatabase | undefined

const issuesDatabase = (): InstantToolsDatabase | IssuesInstantConfigError => {
  const appId = instantAppId()
  if (appId === undefined) {
    return new IssuesInstantConfigError({
      message: `Missing INSTANT_APP_ID. Expected ${documentedInstantEnvPath} (the Instant Tools env documented by the issues example) or INSTANT_APP_ID in the process environment.`,
    })
  }
  const adminToken = instantAdminToken()
  if (adminToken === undefined) {
    return new IssuesInstantConfigError({
      message: `Missing INSTANT_APP_ADMIN_TOKEN. Expected ${documentedInstantEnvPath} (the Instant Tools env documented by the issues example). Instant core cannot observe or transact from Node.`,
    })
  }
  if (cachedDatabase === undefined) {
    const apiURI = instantApiUri()
    const admin = initAdmin({
      adminToken,
      appId,
      disableValidation: true,
      schema: InstantToolsSchema,
      ...(apiURI === undefined ? {} : { apiURI }),
    })
    cachedAdmin = admin
    cachedDatabase = adminAsInstantToolsDatabase(admin)
  }
  return cachedDatabase
}

const nextNumericIssueId = (
  admin: ReturnType<typeof initAdmin>,
): Effect.Effect<string> =>
  Effect.promise(async () => {
    try {
      const data = await admin.query({ instantToolsIssues: {} })
      const max = data.instantToolsIssues.reduce((current, record) => {
        const parsed = Number.parseInt(globalThis.String(record['issueID']), 10)
        return Number.isFinite(parsed) && parsed > current ? parsed : current
      }, 0)
      return globalThis.String(max + 1).padStart(3, '0')
    } catch {
      return randomUUID()
    }
  })

let cachedAdmin: ReturnType<typeof initAdmin> | undefined

/** Live Instant resources for the one-shot CLI, or a missing-config error. */
export const liveIssueTrackerResources = () => {
  loadDocumentedInstantEnv()
  const database = issuesDatabase()
  if (database instanceof IssuesInstantConfigError) {
    return database
  }
  const identity = {
    next: Effect.gen(function* () {
      const id =
        cachedAdmin === undefined
          ? randomUUID()
          : yield* nextNumericIssueId(cachedAdmin)
      return { id, nowMs: Date.now() }
    }),
  }
  return Layer.merge(
    makeLiveIssueTrackerResources(database),
    Layer.succeed(IssueIdentity, identity),
  )
}

export { StaticIssueTrackerResources }
