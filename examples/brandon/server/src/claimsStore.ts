import { ChangedWalletActivity } from 'brandon-core-example'
import { Effect } from 'effect'

import { id, init } from '@instantdb/admin'

import {
  claimRecordsOf,
  claimUpdateFieldsOf,
  personAccountsOf,
} from './claimRows.js'
import type { BrandonEnv } from './env.js'
import { logFieldsOf } from './facts.js'
import type { ClaimUpdate } from './heldClaims.js'
import type { ClaimRecord, PersonAccount } from './store.js'

// CLAIMS STORE

const claimsProcessor = 'claims-brandon'

/** The claims worker's reads and writes in Scribe's app, with the admin token. */
export type ClaimsStore = Readonly<{
  /**
   * Calls back with every Requested claim now and each time the list
   * changes, from Instant's own subscription, never a timer. Returns the
   * function that stops it.
   */
  followRequestedClaims: (
    onClaims: (claims: ReadonlyArray<ClaimRecord>) => void,
    onFailure: (error: Error) => void,
  ) => () => void
  personAccounts: (
    holder: string,
  ) => Effect.Effect<ReadonlyArray<PersonAccount>, Error>
  finishClaim: (
    claim: ClaimRecord,
    update: ClaimUpdate,
  ) => Effect.Effect<void, Error>
}>

const failure = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause))

/**
 * The claims worker's store. A page person's claims reach no client: only
 * the origin, which files them, and this worker, which ends them, hold the
 * admin token. Each end is written with a change notice that names no one,
 * so open pages read their held accounts again.
 */
export const makeClaimsAdmin = (config: BrandonEnv): ClaimsStore => {
  const admin = init({ appId: config.appId, adminToken: config.adminToken })

  const run = <A>(work: () => Promise<A>): Effect.Effect<A, Error> =>
    Effect.tryPromise({ try: work, catch: failure })

  return {
    followRequestedClaims: (onClaims, onFailure) => {
      const subscription = admin.subscribeQuery(
        { walletClaims: { $: { where: { status: 'Requested' } } } },
        payload => {
          if (payload.type === 'ok') {
            try {
              onClaims(claimRecordsOf(payload.data['walletClaims'] ?? []))
            } catch (cause) {
              onFailure(failure(cause))
            }
          } else {
            onFailure(
              new Error(`walletClaims subscription: ${payload.error.message}`),
            )
          }
        },
      )
      return () => subscription.close()
    },
    personAccounts: holder =>
      Effect.map(
        run(() => admin.query({ walletAccounts: { $: { where: { holder } } } })),
        result => personAccountsOf(result['walletAccounts'] ?? []),
      ),
    finishClaim: (claim, update) =>
      Effect.asVoid(
        run(() =>
          admin.transact([
            admin.tx['walletClaims']!.lookup('claimKey', claim.claimKey).update(
              claimUpdateFieldsOf(update),
            ),
            admin.tx['programMessage']![id()]!.update(
              logFieldsOf(ChangedWalletActivity({ atMs: update.updatedAtMs }), {
                ownerUserID: config.ownerUserID,
                from: claimsProcessor,
                atMs: update.updatedAtMs,
              }),
            ),
          ]),
        ),
      ),
  }
}
