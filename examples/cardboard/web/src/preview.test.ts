import { Array, Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import { injectCardboardMetaTags } from './meta.js'
import {
  layoutCardboardContent,
  renderCardboardOgImage,
  wrapExactText,
} from './ogImage.js'
import {
  portableRouteForOgImageUrl,
  resolveCardboardWebPreview,
} from './preview.js'

const config = {
  deepLinkOrigin: 'foldkit://showcase',
  pageOrigin: 'https://cardboard.knophy.com',
}

describe('Cardboard web preview', () => {
  it('derives every carrier from the canonical Program route', async () => {
    const preview = await Effect.runPromise(
      resolveCardboardWebPreview('/0/69/', config),
    )

    expect(preview).toMatchObject({
      content: '69',
      deepLink: 'foldkit://showcase/0/69',
      description: 'Cardboard 69. Next.',
      imageUrl: 'https://cardboard.knophy.com/og/v1/0/69.png',
      pageUrl: 'https://cardboard.knophy.com/0/69',
      portableRoute: '/0/69',
      title: '69 | Project Cardboard',
    })
  })

  it('recovers the canonical route from its versioned image URL', () => {
    expect(
      portableRouteForOgImageUrl(
        new URL('https://cardboard.knophy.com/og/v1/0/69.png'),
      ),
    ).toBe('/0/69')
    expect(
      portableRouteForOgImageUrl(
        new URL('https://cardboard.knophy.com/og/v1/0/state.png?model=encoded'),
      ),
    ).toBe('/0/state?model=encoded')
  })

  it('injects canonical, Open Graph, and Twitter metadata', async () => {
    const preview = await Effect.runPromise(
      resolveCardboardWebPreview('/0/69', config),
    )
    const html = injectCardboardMetaTags(
      '<html><head><!-- cardboard-preview:start --><title>Old</title><!-- cardboard-preview:end --></head></html>',
      preview,
    )

    expect(html).toContain('<title>69 | Project Cardboard</title>')
    expect(html).toContain(
      '<meta property="og:url" content="https://cardboard.knophy.com/0/69" />',
    )
    expect(html).toContain(
      '<meta property="og:image" content="https://cardboard.knophy.com/og/v1/0/69.png" />',
    )
    expect(html).toContain(
      '<meta name="twitter:card" content="summary_large_image" />',
    )
  })

  it('wraps large values without changing their digits', () => {
    const content =
      '999999999999999999999999999999999999999999999999999999999999'
    const layout = layoutCardboardContent(content)

    expect(Array.length(layout.lines)).toBeGreaterThan(1)
    expect(layout.lines.join('')).toBe(content)
    expect(layout.fontSize).toBeGreaterThanOrEqual(10)
    expect(wrapExactText('foldkit://showcase/0/69', 8).join('')).toBe(
      'foldkit://showcase/0/69',
    )
  })

  it('renders a 1200 by 630 PNG', async () => {
    const preview = await Effect.runPromise(
      resolveCardboardWebPreview('/0/69', config),
    )
    const png = await renderCardboardOgImage(preview)
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength)

    expect(Array.fromIterable(png.slice(0, 8))).toStrictEqual([
      137, 80, 78, 71, 13, 10, 26, 10,
    ])
    expect(view.getUint32(16)).toBe(1_200)
    expect(view.getUint32(20)).toBe(630)
  })
})
