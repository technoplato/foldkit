import { init } from '@instantdb/admin'

import schema from '../instant.schema.ts'
import { seedIdeas } from '../src/catalog.ts'

const requireEnv = (
  name: 'INSTANT_APP_ID' | 'INSTANT_APP_ADMIN_TOKEN',
): string => {
  const value = process.env[name]
  if (value === undefined || value.length === 0) {
    throw new Error(
      `${name} is missing. Source the foldkit Instant demo env file.`,
    )
  }
  return value
}

const requireTx = <T>(value: T | undefined, label: string): T => {
  if (value === undefined) {
    throw new Error(`missing Instant tx for ${label}`)
  }
  return value
}

const ingest = async (): Promise<void> => {
  const appId = requireEnv('INSTANT_APP_ID')
  const adminToken = requireEnv('INSTANT_APP_ADMIN_TOKEN')
  const database = init({ adminToken, appId, schema })
  const ops = seedIdeas.map(idea =>
    requireTx(database.tx.knophyIdeas[idea.id], 'knophyIdeas').update({
      body: idea.body,
      index: idea.index,
      slug: idea.slug,
      title: idea.title,
    }),
  )
  await database.transact(ops)
  console.log(`seeded ${String(seedIdeas.length)} Knophy ideas`)
}

ingest().catch(error => {
  console.error(error)
  process.exitCode = 1
})
