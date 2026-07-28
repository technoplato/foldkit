import { type CardboardWebPreview } from './preview.js'

/** Opening marker for the generated Cardboard document metadata block. */
export const cardboardMetaStart = '<!-- cardboard-preview:start -->'
/** Closing marker for the generated Cardboard document metadata block. */
export const cardboardMetaEnd = '<!-- cardboard-preview:end -->'

const escapeAttribute = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/** Renders the complete canonical, Open Graph, and Twitter metadata block. */
export const renderCardboardMetaTags = (
  preview: CardboardWebPreview,
): string => {
  const title = escapeAttribute(preview.title)
  const description = escapeAttribute(preview.description)
  const pageUrl = escapeAttribute(preview.pageUrl)
  const imageUrl = escapeAttribute(preview.imageUrl)
  const imageAlt = escapeAttribute(preview.imageAlt)

  return [
    cardboardMetaStart,
    `<title>${title}</title>`,
    `<link rel="canonical" href="${pageUrl}" />`,
    `<meta name="description" content="${description}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:url" content="${pageUrl}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${imageUrl}" />`,
    `<meta property="og:image:secure_url" content="${imageUrl}" />`,
    '<meta property="og:image:type" content="image/png" />',
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta property="og:image:alt" content="${imageAlt}" />`,
    '<meta property="og:site_name" content="Project Cardboard" />',
    '<meta property="og:locale" content="en_US" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${imageUrl}" />`,
    `<meta name="twitter:image:alt" content="${imageAlt}" />`,
    cardboardMetaEnd,
  ].join('\n    ')
}

/** Replaces or inserts Cardboard metadata in one HTML document. */
export const injectCardboardMetaTags = (
  html: string,
  preview: CardboardWebPreview,
): string => {
  const block = renderCardboardMetaTags(preview)
  const startIndex = html.indexOf(cardboardMetaStart)
  const endIndex = html.indexOf(cardboardMetaEnd)

  if (startIndex !== -1 && endIndex >= startIndex) {
    const afterBlock = endIndex + cardboardMetaEnd.length
    return `${html.slice(0, startIndex)}${block}${html.slice(afterBlock)}`
  } else {
    return html.replace('</head>', `    ${block}\n  </head>`)
  }
}
