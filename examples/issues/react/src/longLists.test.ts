import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(
  fileURLToPath(new URL('./styles.css', import.meta.url)),
  'utf8',
)

const PHONE_QUERY = '@media (max-width: 719px) {'
const WIDE_ROWS =
  /@media \(min-width: 720px\) \{\s*(?:\/\*[^*]*\*\/\s*)?\.issues-screen \.fk-list > \.fk-item:has\(> \.fk-button\) \{[^}]*\}/

const rulesOf = (pattern: RegExp): string => pattern.exec(styles)?.[0] ?? ''

describe('a long list of Issues at 1280 wide', () => {
  it('skips the work of rows off the screen, with every row still in the page', () => {
    expect(rulesOf(WIDE_ROWS)).toContain('content-visibility: auto')
  })

  it('holds every row at one height whatever the font, so Back lands on the same rows', () => {
    expect(rulesOf(WIDE_ROWS)).toContain('height: 2.0234375rem')
  })

  it('keeps the keyboard’s ring inside a row, which clips what leaves it', () => {
    expect(styles).toMatch(
      /\.fk-list > \.fk-item:has\(> \.fk-button\) > :focus-visible \{\s*outline-offset: -2px/,
    )
  })

  it('holds a board card near its usual height, each column scrolling its own cards', () => {
    expect(styles).toMatch(
      /\.fk-board \.fk-list > \.fk-item:has\(> \.fk-button\) \{\s*height: auto;\s*contain-intrinsic-size: auto 6\.1rem/,
    )
  })
})

describe('rows of unknown height', () => {
  it('leaves them painted, because a pixel kept across Back would land on other rows', () => {
    const phoneRules = styles.slice(styles.indexOf(PHONE_QUERY))
    expect(phoneRules).not.toContain('content-visibility: auto')
    expect(styles).not.toMatch(
      /aria-label='Inbox'\][^{]*\{[^}]*content-visibility: auto/,
    )
  })

  it('leaves the rows of a menu or a palette as they were', () => {
    expect(styles).toMatch(
      /\.fk-layer \.fk-list > \.fk-item:has\(> \.fk-button\) \{\s*height: auto;\s*content-visibility: visible/,
    )
  })
})
