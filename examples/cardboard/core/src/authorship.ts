import { Schema as S } from 'effect'

/** Public provenance attached to the first Cardboard Rule Zero prototype. */
export const CardboardAuthorship = S.Struct({
  acronym: S.String,
  acronymSha256: S.String,
  author: S.String,
  statement: S.String,
  statementSha256: S.String,
  timestamp: S.String,
})
/** Public provenance attached to the first Cardboard Rule Zero prototype. */
export type CardboardAuthorship = typeof CardboardAuthorship.Type

/** The compact human label for the first Rule Zero authorship statement. */
export const cardboardAuthorshipAcronym = 'BC0-20260728T0016EDT-GHOST-SON'

/** The exact public authorship statement whose bytes are content-addressed. */
export const cardboardAuthorshipStatement =
  'Original author: Blueberry Chopsticks. Tuesday, July 28, 2026 at 12:16 a.m. EDT. My wife sent me a ghost emoji reaction and made me a son.'

/** The public content-addressed authorship record for Rule Zero. */
export const cardboardAuthorship = CardboardAuthorship.make({
  acronym: cardboardAuthorshipAcronym,
  acronymSha256:
    '5bc44b62da6985ebe87a00122686a39fb75c7ffdd8da086776b4dcc624c97fab',
  author: 'Blueberry Chopsticks',
  statement: cardboardAuthorshipStatement,
  statementSha256:
    '1ee74fc3b1f9f35525eae4dacbb0848703aae9528742f39fd2951b072112df90',
  timestamp: 'Tuesday, July 28, 2026 at 12:16 a.m. EDT',
})

/** The local command that opens the interactive Cardboard terminal client. */
export const cardboardDesktopCommand = 'pnpm demo:cardboard:tui'
