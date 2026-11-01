import { Array, Option, Schema as S } from 'effect'

import {
  InstantIssueRecord,
  type IssueCatalogCache,
  type KeptIssueCatalog,
} from '@foldkit/instant-tools/instant'

const DATABASE_NAME = 'issues-catalog'
const DATABASE_VERSION = 1
const ROWS_STORE = 'rows'
const FACTS_STORE = 'facts'
const FULL_READ_FACT = 'fullReadAtMs'

const opened = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(ROWS_STORE, { keyPath: 'id' })
      request.result.createObjectStore(FACTS_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const answerOf = <A>(request: IDBRequest<A>): Promise<A> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const finished = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })

const decodeRows = S.decodeUnknownOption(S.Array(InstantIssueRecord))

/**
 * Keeps the catalog's rows in this browser's IndexedDB between visits, so a
 * reload shows them at once and reads only what changed. Each write is best
 * effort: one that fails only costs the next reload a full read. Rows that no
 * longer read answer with nothing kept.
 *
 * @param database opens the store; a test can hand its own.
 */
export const indexedDbIssueCatalogCache = (
  database: () => Promise<IDBDatabase> = opened,
): IssueCatalogCache => {
  const opening = (() => {
    let maybeOpened = Option.none<Promise<IDBDatabase>>()
    return (): Promise<IDBDatabase> =>
      Option.getOrElse(maybeOpened, () => {
        const next = database()
        maybeOpened = Option.some(next)
        return next
      })
  })()
  const write = (
    stores: ReadonlyArray<string>,
    change: (transaction: IDBTransaction) => void,
  ): void => {
    void opening()
      .then(openedDatabase => {
        const transaction = openedDatabase.transaction(
          Array.fromIterable(stores),
          'readwrite',
        )
        change(transaction)
        return finished(transaction)
      })
      .catch(() => undefined)
  }
  return {
    read: () =>
      opening()
        .then(async openedDatabase => {
          const transaction = openedDatabase.transaction(
            [ROWS_STORE, FACTS_STORE],
            'readonly',
          )
          const [rows, fullReadAtMs] = await Promise.all([
            answerOf(transaction.objectStore(ROWS_STORE).getAll()),
            answerOf(transaction.objectStore(FACTS_STORE).get(FULL_READ_FACT)),
          ])
          return typeof fullReadAtMs === 'number'
            ? Option.map(
                decodeRows(rows),
                (records): KeptIssueCatalog => ({ fullReadAtMs, records }),
              )
            : Option.none()
        })
        .catch(() => Option.none()),
    rememberAll: (records, fullReadAtMs) => {
      write([ROWS_STORE, FACTS_STORE], transaction => {
        const rows = transaction.objectStore(ROWS_STORE)
        rows.clear()
        for (const record of records) {
          rows.put(record)
        }
        transaction.objectStore(FACTS_STORE).put(fullReadAtMs, FULL_READ_FACT)
      })
    },
    rememberChanged: records => {
      write([ROWS_STORE], transaction => {
        const rows = transaction.objectStore(ROWS_STORE)
        for (const record of records) {
          rows.put(record)
        }
      })
    },
    forget: rowIds => {
      write([ROWS_STORE], transaction => {
        const rows = transaction.objectStore(ROWS_STORE)
        for (const rowId of rowIds) {
          rows.delete(rowId)
        }
      })
    },
  }
}
