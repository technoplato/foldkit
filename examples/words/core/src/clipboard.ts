import { Context, Data, type Effect } from 'effect'

/** The clipboard refused the text, for example without page focus. */
export class ClipboardWriteError extends Data.TaggedError(
  'ClipboardWriteError',
)<{
  readonly cause: unknown
}> {}

/** Writes text to the system clipboard. */
export type ClipboardWriterService = Readonly<{
  writeText: (text: string) => Effect.Effect<void, ClipboardWriteError>
}>

/** Writes text to the system clipboard, provided by the host. */
export class ClipboardWriter extends Context.Service<
  ClipboardWriter,
  ClipboardWriterService
>()('words-core-example/ClipboardWriter') {}
