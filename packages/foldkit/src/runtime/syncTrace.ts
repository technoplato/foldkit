import type { SyncLink } from './syncEngine.js'

// SYNC TRACE

/**
 * Where a sync engine's link to its store stands: connecting, connected,
 * signed in, or offline. A link that is back after a drop says
 * `Connected` again.
 */
export type SyncLinkState = 'Connecting' | 'Connected' | 'SignedIn' | 'Offline'

type At = Readonly<{ timestamp: number }>

/**
 * One thing a sync runtime did, as it says it: the row it wrote and how
 * the write ended, a row that waits behind one that has not gone out, a
 * write the engine refused, its own row sent back by the store, a row it
 * received and from which Processor, a row it could not read, a row its
 * session's policy keeps from this Processor, and each change of its
 * link. `rowId` is the log row's id, the same on every device, so the
 * `WroteRow` in one device's trace and the `ReceivedRow` in another's are
 * the same row. `message` is the Message's tag, never its payload. A
 * `WroteRow` is told when the engine answers, `tookMs` after the write
 * left, so the other device may say it received the row a little before.
 *
 * @example
 * ```typescript
 * // terminal: { _tag: 'WroteRow', rowId: '7947ca8d…', message: 'Play', link: 'delivered', isRetry: false, timestamp: 1795050000120 }
 * // phone:    { _tag: 'ReceivedRow', rowId: '7947ca8d…', message: 'Play', from: 'cli', isLate: false, timestamp: 1795050000410 }
 * ```
 */
export type SyncTrace = At &
  (
    | Readonly<{
        _tag: 'WroteRow'
        rowId: string
        message: string
        link: SyncLink
        isRetry: boolean
        tookMs: number
      }>
    | Readonly<{ _tag: 'QueuedRow'; rowId: string; message: string }>
    | Readonly<{
        _tag: 'FailedToWriteRow'
        rowId: string
        message: string
        cause: string
      }>
    | Readonly<{ _tag: 'ConfirmedRow'; rowId: string }>
    | Readonly<{
        _tag: 'ReceivedRow'
        rowId: string
        message: string
        from: string
        isLate: boolean
      }>
    | Readonly<{
        _tag: 'DroppedRow'
        rowId: string
        from: string
        cause: string
      }>
    | Readonly<{
        _tag: 'RefusedRow'
        rowId: string
        message: string
        from: string
        cause: string
      }>
    | Readonly<{ _tag: 'LinkChanged'; link: SyncLinkState }>
  )

/** A sync trace before the runtime stamps the time on it. */
export type SyncTraceFact = SyncTrace extends infer Trace
  ? Trace extends At
    ? Omit<Trace, 'timestamp'>
    : never
  : never

/** Hears each thing a sync runtime did. Returns how to stop hearing. */
export type ObserveSync = (listener: (trace: SyncTrace) => void) => () => void
