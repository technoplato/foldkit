import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  canOccupyStoredShare,
  ensureNamedShareOwner,
  grantNamedShareWith,
  lookupNamedShare,
  resetMemoryShareLedger,
  shareLedgerPath,
} from './shareLedger.js'

const restoreEnv = (key: string, value: string | undefined): void => {
  if (value === undefined) {
    delete process.env[key]
    return
  }
  process.env[key] = value
}

describe('named share ledger', () => {
  afterEach(() => {
    resetMemoryShareLedger()
  })

  it('puts file-tape grants next to the tape, not in the Instant cache', () => {
    const previous = process.env['COUNTER_TAPE_PATH']
    const ledger = process.env['COUNTER_SHARE_LEDGER']
    const tape = join(tmpdir(), 'counter-share-tape.json')
    process.env['COUNTER_TAPE_PATH'] = tape
    delete process.env['COUNTER_SHARE_LEDGER']
    expect(shareLedgerPath()).toBe(`${tape}.shares.json`)
    restoreEnv('COUNTER_TAPE_PATH', previous)
    restoreEnv('COUNTER_SHARE_LEDGER', ledger)
  })

  it('lets alice claim kitchen and grant bob on a file ledger', () => {
    const directory = mkdtempSync(join(tmpdir(), 'counter-shares-'))
    const previousLedger = process.env['COUNTER_SHARE_LEDGER']
    const previousTape = process.env['COUNTER_TAPE']
    process.env['COUNTER_SHARE_LEDGER'] = join(directory, 'shares.json')
    delete process.env['COUNTER_TAPE']
    const claimed = ensureNamedShareOwner('kitchen', 'alice')
    expect(claimed.owner).toBe('alice')
    const granted = grantNamedShareWith('kitchen', 'alice', 'bob')
    expect(granted._tag).toBe('Ok')
    const stored = lookupNamedShare('kitchen')
    expect(stored).toEqual({
      name: 'kitchen',
      owner: 'alice',
      with: ['bob'],
    })
    expect(canOccupyStoredShare(stored ?? claimed, 'bob')).toBe(true)
    expect(canOccupyStoredShare(stored ?? claimed, 'carol')).toBe(false)
    const disk = JSON.parse(
      readFileSync(process.env['COUNTER_SHARE_LEDGER'] ?? '', 'utf8'),
    ) as { kitchen: { with: ReadonlyArray<string> } }
    expect(disk.kitchen.with).toEqual(['bob'])
    restoreEnv('COUNTER_SHARE_LEDGER', previousLedger)
    restoreEnv('COUNTER_TAPE', previousTape)
  })

  it('refuses carol taking alice kitchen', () => {
    const directory = mkdtempSync(join(tmpdir(), 'counter-shares-'))
    const previousLedger = process.env['COUNTER_SHARE_LEDGER']
    const previousTape = process.env['COUNTER_TAPE']
    process.env['COUNTER_SHARE_LEDGER'] = join(directory, 'shares.json')
    delete process.env['COUNTER_TAPE']
    ensureNamedShareOwner('kitchen', 'alice')
    const denied = grantNamedShareWith('kitchen', 'carol', 'dave')
    expect(denied._tag).toBe('Denied')
    restoreEnv('COUNTER_SHARE_LEDGER', previousLedger)
    restoreEnv('COUNTER_TAPE', previousTape)
  })
})
