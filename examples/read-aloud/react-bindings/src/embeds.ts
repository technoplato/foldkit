import { googleBooksPreviewKind } from 'read-aloud-core-example/browser'

import type { EmbedPainters } from '@foldkit/react'

import { GoogleBooksPreview } from './googleBooksPreview.js'

/**
 * The live views Read Aloud's screens embed, by kind, for a React host to
 * give its painted trees: Google Books' preview of the page being read.
 *
 * @example
 * ```tsx
 * <EmbedPaintersProvider value={readAloudEmbeds}>
 *   <NavigationFrame />
 * </EmbedPaintersProvider>
 * ```
 */
export const readAloudEmbeds: EmbedPainters = {
  [googleBooksPreviewKind]: GoogleBooksPreview,
}
