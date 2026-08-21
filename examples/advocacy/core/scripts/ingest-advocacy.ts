import { Array } from 'effect'

import { init } from '@instantdb/admin'

import schema from '../instant.schema.ts'
import { encodeWrite, seedGraph, writesForGraph } from '../src/index.ts'

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
  const ops = Array.map(writesForGraph(seedGraph), write => {
    const encoded = encodeWrite(write)
    if (encoded.namespace === 'advocacyPeople') {
      return requireTx(
        database.tx.advocacyPeople[encoded.id],
        encoded.namespace,
      ).update(encoded.attrs)
    }
    if (encoded.namespace === 'advocacyMeetings') {
      return requireTx(
        database.tx.advocacyMeetings[encoded.id],
        encoded.namespace,
      ).update(encoded.attrs)
    }
    if (encoded.namespace === 'advocacyCalls') {
      return requireTx(
        database.tx.advocacyCalls[encoded.id],
        encoded.namespace,
      ).update(encoded.attrs)
    }
    if (encoded.namespace === 'advocacyParticipants') {
      return requireTx(
        database.tx.advocacyParticipants[encoded.id],
        encoded.namespace,
      ).update(encoded.attrs)
    }
    if (encoded.namespace === 'advocacyChats') {
      return requireTx(
        database.tx.advocacyChats[encoded.id],
        encoded.namespace,
      ).update(encoded.attrs)
    }
    return requireTx(
      database.tx.advocacySegments[encoded.id],
      encoded.namespace,
    ).update(encoded.attrs)
  })
  await database.transact(ops)
  console.log(`seeded ${String(ops.length)} advocacy rows`)
}

ingest().catch(error => {
  console.error(error)
  process.exitCode = 1
})
