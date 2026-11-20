import { Context, type Effect, Schema as S } from 'effect'

/**
 * Where a scrolled-to section lands: in the middle of the window while audio
 * plays, or with its last line just above the controls at the live edge of a
 * recording in progress.
 */
export const SectionPlacement = S.Literals(['Center', 'LiveEdge'])
/** Where a scrolled-to section lands. */
export type SectionPlacement = typeof SectionPlacement.Type

/** Scrolls the transcript, and the page back to its top, provided by the host. */
export type TranscriptScrollerService = Readonly<{
  scrollToSection: (
    sectionID: string,
    placement: SectionPlacement,
  ) => Effect.Effect<void>
  scrollToPageTop: Effect.Effect<void>
}>

/** Scrolls the transcript to a section, provided by the host. */
export class TranscriptScroller extends Context.Service<
  TranscriptScroller,
  TranscriptScrollerService
>()('words-core-example/TranscriptScroller') {}
