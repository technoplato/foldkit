import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { indexedDbIssueCatalogCache } from './issueCatalogCache.js'

type Request = { result: unknown; onsuccess?: () => void; onerror?: () => void }

const answered = (result: unknown): Request => {
  const request: Request = { result }
  queueMicrotask(() => request.onsuccess?.())
  return request
}

/**
 * Just enough of IndexedDB for the cache: two stores, and transactions that
 * finish or abort. A write to the rows fails when `isRowsWriteFailing`.
 */
const fakeDatabase = (isRowsWriteFailing: () => boolean) => {
  const facts = new Map<string, unknown>([['fullReadAtMs', Date.now()]])
  const rows = new Map<string, unknown>()
  const database = {
    transaction: (stores: ReadonlyArray<string>, mode: string) => {
      const isFailing =
        mode === 'readwrite' && stores.includes('rows') && isRowsWriteFailing()
      const transaction: {
        error: null
        objectStore: (name: string) => unknown
        oncomplete?: () => void
        onabort?: () => void
        onerror?: () => void
      } = {
        error: null,
        objectStore: (name: string) => ({
          clear: () => answered(undefined),
          delete: (key: string) => {
            if (!isFailing) {
              ;(name === 'rows' ? rows : facts).delete(key)
            }
            return answered(undefined)
          },
          get: (key: string) => answered(facts.get(key)),
          getAll: () => answered([...rows.values()]),
          put: (value: { id: string }, key?: string) => {
            if (!isFailing) {
              if (name === 'rows') {
                rows.set(value.id, value)
              } else if (key !== undefined) {
                facts.set(key, value)
              }
            }
            return answered(undefined)
          },
        }),
      }
      queueMicrotask(() =>
        isFailing ? transaction.onabort?.() : transaction.oncomplete?.(),
      )
      return transaction
    },
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions
  return () => Promise.resolve(database as unknown as IDBDatabase)
}

const record = {
  attachmentCount: 0,
  attachmentIdsJson: '[]',
  id: 'row-1538',
  issueID: '1538',
  payloadJson: '{}',
  priority: 'P1',
  productId: 'foldkit',
  projectId: '',
  status: 'InProgress',
  updatedAtMs: 1,
}

const settled = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 20))

describe('the catalog kept in the browser', () => {
  it('reads everything on the next reload after a change it could not keep', async () => {
    let isFailing = false
    const cache = indexedDbIssueCatalogCache(fakeDatabase(() => isFailing))
    cache.rememberChanged([record])
    await settled()
    expect(Option.isSome(await cache.read())).toBe(true)

    isFailing = true
    cache.rememberChanged([{ ...record, updatedAtMs: 2 }])
    await settled()

    expect(await cache.read()).toEqual(Option.none())
  })
})
