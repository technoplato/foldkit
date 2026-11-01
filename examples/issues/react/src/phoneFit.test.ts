import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(
  fileURLToPath(new URL('./styles.css', import.meta.url)),
  'utf8',
)

const PHONE_QUERY = '@media (max-width: 719px) {'

const phoneRules = (): string => {
  const start = styles.indexOf(PHONE_QUERY)
  return start < 0 ? '' : styles.slice(start)
}

describe('the site at 390 wide', () => {
  it('lets a long word break instead of widening the page', () => {
    expect(styles).toMatch(
      /\.issues-screen \.fk-item-title,[^}]*overflow-wrap: anywhere/,
    )
  })

  it('keeps every button and field at 44 px or more', () => {
    expect(phoneRules()).toMatch(/\.issues-screen \.fk-button[^}]*44px/)
    expect(phoneRules()).toMatch(/\.issues-screen \.fk-text-input[^}]*44px/)
    expect(phoneRules()).toMatch(/\.issues-screen \.fk-item-check[^}]*44px/)
  })

  it('puts a row on a grid, its fields under its title', () => {
    expect(phoneRules()).toMatch(/\.fk-item:has\(> \.fk-button\)[^}]*grid/)
  })
})
