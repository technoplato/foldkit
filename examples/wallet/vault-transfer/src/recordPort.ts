import { Context, Effect, Redacted } from 'effect'

import { WalletTransferRecordPortError } from './protocol.js'

/** Host custody operations for exactly one canonical opaque Wallet record. */
export type WalletTransferRecordPortService = Readonly<{
  exportCanonicalRecord: Effect.Effect<
    Redacted.Redacted<string>,
    WalletTransferRecordPortError
  >
  importCanonicalRecord: (
    record: Redacted.Redacted<string>,
  ) => Effect.Effect<void, WalletTransferRecordPortError>
}>

/** A host-supplied custody boundary that never enters Foldkit Program state. */
export class WalletTransferRecordPort extends Context.Service<
  WalletTransferRecordPort,
  WalletTransferRecordPortService
>()('Wallet/WalletTransferRecordPort') {}
