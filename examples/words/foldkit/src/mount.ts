import { Effect, Schema as S } from 'effect'
import { Mount } from 'foldkit'
import { CompletedScrollToSection } from 'words-core-example'

/** Scrolls a transcript section to the middle of the view when it becomes the one to show. */
export const ScrollSectionIntoView = Mount.define(
  'ScrollSectionIntoView',
  { sectionID: S.String },
  CompletedScrollToSection,
)(
  () => element =>
    Effect.sync(() => {
      element.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return CompletedScrollToSection()
    }),
)
