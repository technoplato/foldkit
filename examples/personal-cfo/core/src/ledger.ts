import { Context, Data, Effect, Option } from 'effect'

import {
  AccountKind,
  CadenceTag,
  type Finding,
  NotifyChannel,
  type Snapshot,
  VaultOrigin,
} from './domain.js'

/** A Ledger call failed without retaining secrets. */
export class LedgerError extends Data.TaggedError('LedgerError')<{
  readonly reason: string
}> {}

/** Input for one manual account. Access is implied read-only. */
export type NewAccount = Readonly<{
  name: string
  institution: string
  kind: AccountKind
  balanceCents: number
}>

/** Input for one vault stub. */
export type NewVault = Readonly<{
  title: string
  origin: VaultOrigin
}>

/** Input for one Radar job. */
export type NewRadar = Readonly<{
  question: string
  cadence: CadenceTag
  everyMinutes: number
}>

/** Input for one chat turn. */
export type NewChat = Readonly<{
  text: string
}>

/** Input for one notification row plus local delivery. */
export type NewNotification = Readonly<{
  title: string
  body: string
  channel: NotifyChannel
}>

/** Result of ticking Radar. Findings must carry citations. */
export type RadarTickResult = Readonly<{
  snapshot: Snapshot
  findings: ReadonlyArray<Finding>
}>

/** Backend-independent durable Personal CFO operations. */
export type LedgerService = Readonly<{
  restore: Effect.Effect<Snapshot, LedgerError>
  login: (email: string) => Effect.Effect<Snapshot, LedgerError>
  logout: Effect.Effect<Snapshot, LedgerError>
  addAccount: (input: NewAccount) => Effect.Effect<Snapshot, LedgerError>
  addVault: (input: NewVault) => Effect.Effect<Snapshot, LedgerError>
  armRadar: (input: NewRadar) => Effect.Effect<Snapshot, LedgerError>
  tickRadar: Effect.Effect<RadarTickResult, LedgerError>
  sendChat: (input: NewChat) => Effect.Effect<Snapshot, LedgerError>
  enqueueNotification: (
    input: NewNotification,
  ) => Effect.Effect<Snapshot, LedgerError>
  currentEmail: Effect.Effect<Option.Option<string>, LedgerError>
}>

/** Injected ledger. Hosts choose Instant, memory, or a test fake. */
export class Ledger extends Context.Service<Ledger, LedgerService>()(
  'personal-cfo/Ledger',
) {}
