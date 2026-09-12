/**
 * Named-share grant ledger. This file must not import Effect or the
 * Program. The slim CLI view records grants before the daemon starts.
 *
 * File tape: `${COUNTER_TAPE_PATH}.shares.json`.
 * Memory: process-local map (does not persist across processes).
 * Instant: `~/.cache/foldkit-counter-shares/${appId}.json`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Same Instant app id as counterCliProgramId in isolation.ts. */
const counterShareAppId = '5417c2e3-c6b9-476d-a962-2e11c83492aa'

export type StoredShareGrant = Readonly<{
  readonly name: string
  readonly owner: string
  readonly with: ReadonlyArray<string>
}>

type Ledger = Readonly<Record<string, StoredShareGrant>>

const memoryLedger: Record<string, StoredShareGrant> = {}

const isMemoryTape = (): boolean => process.env['COUNTER_TAPE'] === 'memory'

/** Path of the durable grant ledger for this tape or Instant app. */
export const shareLedgerPath = (): string => {
  const explicit = process.env['COUNTER_SHARE_LEDGER']
  if (explicit !== undefined && explicit !== '') {
    return explicit
  }
  const tapePath = process.env['COUNTER_TAPE_PATH']
  if (tapePath !== undefined && tapePath !== '') {
    return `${tapePath}.shares.json`
  }
  return join(
    homedir(),
    '.cache',
    'foldkit-counter-shares',
    `${counterShareAppId}.json`,
  )
}

const readFileLedger = (): Ledger => {
  const path = shareLedgerPath()
  if (!existsSync(path)) {
    return {}
  }
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {}
  }
  return parsed as Ledger
}

const writeFileLedger = (ledger: Ledger): void => {
  const path = shareLedgerPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(ledger)}\n`)
}

const readLedger = (): Ledger => {
  if (isMemoryTape()) {
    return { ...memoryLedger }
  }
  return readFileLedger()
}

const writeLedger = (ledger: Ledger): void => {
  if (isMemoryTape()) {
    for (const key of Object.keys(memoryLedger)) {
      delete memoryLedger[key]
    }
    for (const [key, grant] of Object.entries(ledger)) {
      memoryLedger[key] = grant
    }
    return
  }
  writeFileLedger(ledger)
}

/** Reads the grant for one named share, if any. */
export const lookupNamedShare = (name: string): StoredShareGrant | undefined =>
  readLedger()[name]

/** First occupier of a named share becomes owner. */
export const ensureNamedShareOwner = (
  name: string,
  subject: string,
): StoredShareGrant => {
  const existing = lookupNamedShare(name)
  if (existing !== undefined) {
    return existing
  }
  const grant: StoredShareGrant = { name, owner: subject, with: [] }
  const ledger = readLedger()
  writeLedger({ ...ledger, [name]: grant })
  return grant
}

/**
 * Grants `withSubject` occupancy of `name` owned by `owner`.
 * A different owner cannot take the name.
 */
export const grantNamedShareWith = (
  name: string,
  owner: string,
  withSubject: string,
):
  | Readonly<{ readonly _tag: 'Ok'; readonly grant: StoredShareGrant }>
  | Readonly<{ readonly _tag: 'Denied'; readonly message: string }> => {
  const existing = ensureNamedShareOwner(name, owner)
  if (existing.owner !== owner) {
    return {
      _tag: 'Denied',
      message: `${name} is owned by ${existing.owner}. ${owner} cannot share it.`,
    }
  }
  const nextWith = existing.with.includes(withSubject)
    ? existing.with
    : [...existing.with, withSubject]
  const grant: StoredShareGrant = { name, owner, with: nextWith }
  const ledger = readLedger()
  writeLedger({ ...ledger, [name]: grant })
  return { _tag: 'Ok', grant }
}

/** True when the subject owns or was granted the named share. */
export const canOccupyStoredShare = (
  grant: StoredShareGrant,
  subject: string,
): boolean => grant.owner === subject || grant.with.includes(subject)

/** Clears the process-local memory ledger. Tests only. */
export const resetMemoryShareLedger = (): void => {
  for (const key of Object.keys(memoryLedger)) {
    delete memoryLedger[key]
  }
}
