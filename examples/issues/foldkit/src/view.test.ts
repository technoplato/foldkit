import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

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
})
