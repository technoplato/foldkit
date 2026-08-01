import { Schema as S } from 'effect'

// POST FRONTMATTER

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Frontmatter schema for blog posts. One schema drives both halves of the
 * pipeline: the markdown Vite plugin validates every post's frontmatter
 * against it at build time (unknown fields, missing fields, and malformed
 * values all fail the build), and the post registry decodes the emitted
 * `frontmatter` export with it at module load.
 *
 * Kept dependency-light (Schema only) so `vite.config.ts` and
 * `vitest.config.ts` can import it without pulling in the browser view layer.
 */
export const PostFrontmatter = S.Struct({
  title: S.String.check(S.isNonEmpty()),
  description: S.String.check(S.isNonEmpty()),
  date: S.String.check(S.isPattern(ISO_DATE_PATTERN)),
})

export type PostFrontmatter = typeof PostFrontmatter.Type
