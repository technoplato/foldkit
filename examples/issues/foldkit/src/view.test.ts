import { Option } from 'effect'
import { paintHtml } from 'foldkit/renderers/html'
import {
  FileIssue,
  ObservedProducts,
  issuesScreen,
  messageForScreenToken,
  modelForNavigation,
  update,
} from 'issues-core-example'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  ProductCatalogEntry,
} from '@foldkit/instant-tools/issues'

import { view } from './view.ts'

describe('Issues Foldkit screenify', () => {
  it('paints the Program screen with paintHtml(issuesScreen)', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'view.ts'),
      'utf8',
    )
    expect(source).toContain('paintHtml')
    expect(source).toContain('issuesScreen')
    expect(source).toContain('paintHtml(screen')
  })

  it('paints FileIssue destination with title, details, product, and priority controls', () => {
    const product = ApplicationProduct.make({ id: 'scribe', name: 'Scribe' })
    const [withProducts] = update(
      modelForNavigation(FileIssue.make({})),
      ObservedProducts.make({
        products: [ProductCatalogEntry.make({ product, updatedAtMs: 1_000 })],
      }),
    )
    const document = view(withProducts)
    const painted = JSON.stringify(document.body)
    expect(painted).toContain('fk-text-input')
    expect(painted).toContain('Title')
    expect(painted).toContain('Details')
    expect(painted).toContain('Scribe')
    expect(painted).toContain('P2')
    expect(painted).toContain('Submit issue')
    const screen = paintHtml(issuesScreen(withProducts), token =>
      Option.getOrUndefined(messageForScreenToken(withProducts, token)),
    )
    expect(JSON.stringify(screen)).toContain('fk-text-input')
  })
})
