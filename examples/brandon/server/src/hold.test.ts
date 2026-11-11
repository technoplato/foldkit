import { Effect } from 'effect'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { type HeldListFile, heldListFileAt } from './heldList.js'
import {
  type HoldStore,
  type NamedAccount,
  holdAccount,
  holdLineOf,
} from './hold.js'
import type { PersonAccount } from './store.js'

const accountKey = 'a'.repeat(64)
const otherKey = 'b'.repeat(64)
const holder = `brandon-dot:${accountKey}`
const mainnet = 'solana:mainnet-beta'
const heldAddress = 'So11111111111111111111111111111111111111112'

const named: ReadonlyArray<NamedAccount> = [
  { accountKey, displayName: 'Recipient', flags: ['party', 'wallet'] },
  { accountKey: otherKey, displayName: 'Guest', flags: ['party'] },
  { accountKey: 'c'.repeat(64), displayName: 'Twin', flags: ['wallet'] },
  { accountKey: 'd'.repeat(64), displayName: 'Twin', flags: ['wallet'] },
]

const makeStore = (
  existing: ReadonlyArray<PersonAccount> = [],
): Readonly<{
  store: HoldStore
  added: Array<Readonly<{ holder: string; networkId: string; address: string }>>
}> => {
  const added: Array<
    Readonly<{ holder: string; networkId: string; address: string }>
  > = []
  return {
    added,
    store: {
      namedAccounts: Effect.succeed(named),
      personAccounts: () => Effect.succeed(existing),
      addHeldAccount: account =>
        Effect.sync(() => {
          added.push(account)
        }),
    },
  }
}

const makeList = (
  text = '',
): Readonly<{ list: HeldListFile; lines: Array<string> }> => {
  const lines: Array<string> = text === '' ? [] : text.split('\n')
  return {
    lines,
    list: {
      read: Effect.sync(() => lines.join('\n')),
      append: line =>
        Effect.sync(() => {
          lines.push(line)
        }),
    },
  }
}

const hold = (
  request: Readonly<{ displayName: string; networkId: string; address: string }>,
  store: HoldStore,
  list: HeldListFile,
) => Effect.runPromise(holdAccount(request, store, list))

const refusal = async (
  request: Readonly<{ displayName: string; networkId: string; address: string }>,
  store: HoldStore,
  list: HeldListFile,
): Promise<string> =>
  Effect.runPromise(
    Effect.match(holdAccount(request, store, list), {
      onFailure: error => error.message,
      onSuccess: () => 'held',
    }),
  )

describe('holding an account for a person', () => {
  it('holds it under the page holder of the one person of that name, and lists it on this Mac', async () => {
    const { store, added } = makeStore()
    const { list, lines } = makeList()
    const result = await hold(
      { displayName: 'Recipient', networkId: mainnet, address: heldAddress },
      store,
      list,
    )
    expect(added).toEqual([{ holder, networkId: mainnet, address: heldAddress }])
    expect(lines).toEqual([`${mainnet}\t${heldAddress}\t${holder}`])
    expect(result.isRowNew).toBe(true)
    expect(result.isListingNew).toBe(true)
  })

  it('writes nothing twice', async () => {
    const { store, added } = makeStore([
      { networkId: mainnet, address: heldAddress, isHeldByScribe: true },
    ])
    const { list, lines } = makeList(`${mainnet}\t${heldAddress}\t${holder}`)
    const result = await hold(
      { displayName: 'Recipient', networkId: mainnet, address: heldAddress },
      store,
      list,
    )
    expect(added).toEqual([])
    expect(lines).toEqual([`${mainnet}\t${heldAddress}\t${holder}`])
    expect(result.isRowNew).toBe(false)
    expect(result.isListingNew).toBe(false)
  })

  it('refuses a name no account has, or two share', async () => {
    const { store, added } = makeStore()
    const { list, lines } = makeList()
    for (const displayName of ['Nobody', 'Twin']) {
      expect(
        await refusal(
          { displayName, networkId: mainnet, address: heldAddress },
          store,
          list,
        ),
      ).not.toBe('held')
    }
    expect(added).toEqual([])
    expect(lines).toEqual([])
  })

  it('refuses a person without the wallet flag', async () => {
    const { store, added } = makeStore()
    const { list } = makeList()
    expect(
      await refusal(
        { displayName: 'Guest', networkId: mainnet, address: heldAddress },
        store,
        list,
      ),
    ).toMatch(/wallet/)
    expect(added).toEqual([])
  })

  it('refuses a network the page does not follow, or an address that is not public on it', async () => {
    const { store, added } = makeStore()
    const { list } = makeList()
    for (const [networkId, address] of [
      ['solana:testnet', heldAddress],
      ['ethereum:mainnet', heldAddress],
      [mainnet, '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'],
      [mainnet, 'not-an-address'],
    ] as const) {
      expect(
        await refusal({ displayName: 'Recipient', networkId, address }, store, list),
      ).not.toBe('held')
    }
    expect(added).toEqual([])
  })

  it("refuses an address the person's own wallet follows: Scribe never holds their own key", async () => {
    const { store, added } = makeStore([
      { networkId: mainnet, address: heldAddress, isHeldByScribe: false },
    ])
    const { list, lines } = makeList()
    expect(
      await refusal(
        { displayName: 'Recipient', networkId: mainnet, address: heldAddress },
        store,
        list,
      ),
    ).not.toBe('held')
    expect(added).toEqual([])
    expect(lines).toEqual([])
  })

  it('says only the name, the network and the address', async () => {
    const { store } = makeStore()
    const { list } = makeList()
    const line = holdLineOf(
      await hold(
        { displayName: 'Recipient', networkId: mainnet, address: heldAddress },
        store,
        list,
      ),
    )
    expect(line).toContain('Recipient')
    expect(line).toContain(mainnet)
    expect(line).toContain(heldAddress)
    expect(line).not.toContain(accountKey)
  })
})

describe('the held list file', () => {
  it('is readable by this Mac’s user alone, and keeps every line it is given', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'held-list-')), 'held.tsv')
    const file = heldListFileAt(path)
    expect(await Effect.runPromise(file.read)).toBe('')
    await Effect.runPromise(file.append(`${mainnet}\t${heldAddress}\t${holder}`))
    await Effect.runPromise(file.append(`solana:devnet\t${heldAddress}\t${holder}`))
    expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(readFileSync(path, 'utf8')).toBe(
      `${mainnet}\t${heldAddress}\t${holder}\nsolana:devnet\t${heldAddress}\t${holder}\n`,
    )
  })
})
