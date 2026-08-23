import { Schema as S } from 'effect'

// MODEL

/** Public Puzzle page. The only public host. */
export const puzzlePage = 'https://puzzle.knophy.com'

/** Self-replicate script served from the Puzzle page. */
export const puzzleReplicateScript = 'https://puzzle.knophy.com/replicate.sh'

/** Example path inside the Foldkit tree. */
export const puzzleExample = 'examples/puzzle'

/** Loopback bind. Never 0.0.0.0. */
export const puzzleBind = '127.0.0.1'

/** Preview port. */
export const puzzlePort = 5209

/** Public host name. */
export const puzzleHost = 'puzzle.knophy.com'

/**
 * Self-replicate step. Points at the page and /replicate.sh.
 * Not a markdown blob. Clients render the two URLs.
 */
export const ReplicateStep = S.TaggedStruct('ReplicateStep', {
  page: S.Literal(puzzlePage),
  script: S.Literal(puzzleReplicateScript),
  example: S.Literal(puzzleExample),
  bind: S.Literal(puzzleBind),
  port: S.Literal(puzzlePort),
  host: S.Literal(puzzleHost),
})
/** Self-replicate step. Points at the page and /replicate.sh. */
export type ReplicateStep = typeof ReplicateStep.Type

/** Canonical ReplicateStep for `#replicate`. */
export const defaultReplicateStep = (): ReplicateStep =>
  ReplicateStep.make({
    page: puzzlePage,
    script: puzzleReplicateScript,
    example: puzzleExample,
    bind: puzzleBind,
    port: puzzlePort,
    host: puzzleHost,
  })
