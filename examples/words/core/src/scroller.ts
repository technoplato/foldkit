import { Context, type Effect } from 'effect'

/** Scrolls the transcript, and the page back to its top, provided by the host. */
export type TranscriptScrollerService = Readonly<{
  scrollToSection: (sectionID: string) => Effect.Effect<void>
  scrollToPageTop: Effect.Effect<void>
}>

/**
 * Scrolls the transcript to a section a link names, to the middle of the
 * view, provided by the host. Keeping the word being spoken in view is not
 * its job: every painter's own follow does that.
 */
export class TranscriptScroller extends Context.Service<
  TranscriptScroller,
  TranscriptScrollerService
>()('words-core-example/TranscriptScroller') {}
