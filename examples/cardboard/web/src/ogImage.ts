import { Array, Schema as S, pipe } from 'effect'
import { ts } from 'foldkit/schema'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import satori, { type Font } from 'satori'

import { Resvg } from '@resvg/resvg-js'

import { type CardboardWebPreview } from './preview.js'

/** Width of every Cardboard Open Graph image. */
export const cardboardOgImageWidth = 1_200
/** Height of every Cardboard Open Graph image. */
export const cardboardOgImageHeight = 630

/** Exact wrapped text and its fitted font size. */
export const CardboardTextLayout = ts('CardboardTextLayout', {
  fontSize: S.Number,
  lines: S.Array(S.String),
})
/** Exact wrapped text and its fitted font size. */
export type CardboardTextLayout = typeof CardboardTextLayout.Type

type SatoriNode = Readonly<{
  props: Record<string, unknown>
  type: string
}>

const findWorkspaceRoot = (directory: string): string => {
  if (existsSync(resolve(directory, 'pnpm-workspace.yaml'))) {
    return directory
  }
  const parentDirectory = dirname(directory)
  if (parentDirectory === directory) {
    throw new Error('Could not find the Foldkit workspace root')
  }
  return findWorkspaceRoot(parentDirectory)
}

const workspaceRoot = findWorkspaceRoot(process.cwd())
const requireFromPackage = createRequire(
  resolve(workspaceRoot, 'examples/cardboard/web/package.json'),
)
const fonts = Promise.all([
  readFile(
    requireFromPackage.resolve(
      '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff',
    ),
  ),
  readFile(
    requireFromPackage.resolve(
      '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff',
    ),
  ),
]).then(
  ([regular, bold]): Array<Font> => [
    { data: regular, name: 'JetBrains Mono', weight: 400 },
    { data: bold, name: 'JetBrains Mono', weight: 700 },
  ],
)

const el = (
  type: string,
  style: Record<string, unknown>,
  children?: string | SatoriNode | ReadonlyArray<string | SatoriNode>,
): SatoriNode => ({
  type,
  props: {
    style,
    ...(children === undefined ? {} : { children }),
  },
})

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** Wraps an unbroken value without removing, reordering, or reformatting it. */
export const wrapExactText = (
  text: string,
  maximumLineCharacters: number,
): ReadonlyArray<string> => {
  if (text.length === 0) {
    return ['']
  }
  return pipe(
    Array.fromIterable(text),
    Array.chunksOf(maximumLineCharacters),
    Array.map(Array.join('')),
  )
}

/** Fits exact Cardboard content into at most four periodic-card rows. */
export const layoutCardboardContent = (
  content: string,
): CardboardTextLayout => {
  const maximumLineCount = 4
  const preferredCharactersPerLine = 15
  const lineCount = Math.min(
    maximumLineCount,
    Math.max(1, Math.ceil(content.length / preferredCharactersPerLine)),
  )
  const charactersPerLine = Math.max(1, Math.ceil(content.length / lineCount))
  const lines = wrapExactText(content, charactersPerLine)
  const longestLineLength = pipe(
    lines,
    Array.map(line => line.length),
    Array.reduce(1, Math.max),
  )
  const widthConstrainedSize = Math.floor(960 / (longestLineLength * 0.62))
  const heightConstrainedSize = Math.floor(300 / (Array.length(lines) * 1.04))
  const fontSize = Math.max(
    10,
    Math.min(300, widthConstrainedSize, heightConstrainedSize),
  )

  return CardboardTextLayout({ fontSize, lines })
}

const lineNodes = (
  lines: ReadonlyArray<string>,
  style: Record<string, unknown>,
): ReadonlyArray<SatoriNode> =>
  Array.map(lines, line => el('div', style, escapeHtml(line)))

const carrier = (label: string, value: string): SatoriNode => {
  const lines = wrapExactText(value, 46)
  const fontSize = Array.length(lines) > 2 ? 14 : 18
  return el(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      gap: '7px',
      minWidth: 0,
      width: '520px',
    },
    [
      el(
        'div',
        {
          color: '#d3a861',
          fontSize: '15px',
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        },
        label,
      ),
      el(
        'div',
        {
          color: '#f7dca5',
          display: 'flex',
          flexDirection: 'column',
          fontSize: `${fontSize.toString()}px`,
          lineHeight: 1.25,
        },
        lineNodes(lines, { display: 'flex' }),
      ),
    ],
  )
}

const ogTemplate = (preview: CardboardWebPreview): SatoriNode => {
  const contentLayout = layoutCardboardContent(preview.content)
  const portableRouteLines = wrapExactText(preview.portableRoute, 38)
  return el(
    'div',
    {
      alignItems: 'center',
      backgroundColor: '#100d09',
      color: '#17130d',
      display: 'flex',
      fontFamily: 'JetBrains Mono',
      height: `${cardboardOgImageHeight.toString()}px`,
      justifyContent: 'center',
      width: `${cardboardOgImageWidth.toString()}px`,
    },
    el(
      'div',
      {
        backgroundColor: '#f2b85f',
        border: '8px solid #f7dca5',
        borderRadius: '48px',
        display: 'flex',
        flexDirection: 'column',
        height: '558px',
        overflow: 'hidden',
        width: '1128px',
      },
      [
        el(
          'div',
          {
            alignItems: 'flex-start',
            display: 'flex',
            justifyContent: 'space-between',
            padding: '24px 34px 0',
          },
          [
            el(
              'div',
              {
                fontSize: '18px',
                fontWeight: 700,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
              },
              'Project Cardboard',
            ),
            el(
              'div',
              {
                alignItems: 'flex-end',
                display: 'flex',
                flexDirection: 'column',
                fontSize: '14px',
                fontWeight: 700,
                lineHeight: 1.15,
                textAlign: 'right',
                width: '530px',
              },
              lineNodes(portableRouteLines, { display: 'flex' }),
            ),
          ],
        ),
        el(
          'div',
          {
            alignItems: 'center',
            display: 'flex',
            flexDirection: 'column',
            flexGrow: 1,
            justifyContent: 'center',
            minHeight: 0,
            padding: '8px 56px 16px',
          },
          [
            el(
              'div',
              {
                alignItems: 'center',
                display: 'flex',
                flexDirection: 'column',
                fontSize: `${contentLayout.fontSize.toString()}px`,
                fontWeight: 700,
                justifyContent: 'center',
                letterSpacing: '-0.08em',
                lineHeight: 1.04,
                textAlign: 'center',
              },
              lineNodes(contentLayout.lines, { display: 'flex' }),
            ),
            el(
              'div',
              {
                fontSize: '18px',
                fontWeight: 400,
                marginTop: '12px',
                textAlign: 'center',
              },
              escapeHtml(preview.description),
            ),
          ],
        ),
        el(
          'div',
          {
            backgroundColor: '#211a11',
            display: 'flex',
            gap: '28px',
            minHeight: '138px',
            padding: '22px 30px',
          },
          [
            carrier('Web', preview.pageUrl),
            carrier('Deep link', preview.deepLink),
          ],
        ),
      ],
    ),
  )
}

/** Renders one resolved Cardboard preview through SVG into a PNG response body. */
export const renderCardboardOgImage = async (
  preview: CardboardWebPreview,
): Promise<Uint8Array> => {
  const loadedFonts = await fonts
  const template = ogTemplate(preview)
  const svg = await satori(
    // @ts-expect-error Satori accepts its documented object element shape at runtime.
    template,
    {
      width: cardboardOgImageWidth,
      height: cardboardOgImageHeight,
      fonts: loadedFonts,
    },
  )
  return new Resvg(svg, {
    fitTo: { mode: 'width', value: cardboardOgImageWidth },
  })
    .render()
    .asPng()
}
