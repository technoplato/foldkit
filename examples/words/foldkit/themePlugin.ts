import { firstPaintScriptFollowingSystem } from 'foldkit/theme'
import type { HtmlTagDescriptor, Plugin } from 'vite'

import { wordsStylesheet } from '../core/src/theme'

/**
 * Puts the words theme in every page's head as it is built: the
 * stylesheet that declares each role, light by default and dark where
 * the Program says so, and the first-paint script, so the page opens in
 * the mode it was last in (or the system's, at a first visit) before the
 * Program starts. Both are derived from the theme in the words core; no
 * color is written into a page by hand.
 */
/** The tags the words theme adds to a page's head. */
export const wordsThemeTags = (): Array<HtmlTagDescriptor> => [
  {
    tag: 'style',
    attrs: { id: 'words-theme' },
    children: wordsStylesheet,
    injectTo: 'head-prepend',
  },
  {
    tag: 'script',
    attrs: { id: 'words-first-paint' },
    children: firstPaintScriptFollowingSystem(),
    injectTo: 'head-prepend',
  },
]

/** The plugin that adds {@link wordsThemeTags} to every page as it is built. */
export const wordsThemeHead = (): Plugin => ({
  name: 'words-theme-head',
  transformIndexHtml: () => wordsThemeTags(),
})
