import * as Testing from 'effect-oxlint/testing'
import { describe, expect, it } from 'vitest'

import { noRawPageCheck } from '../../src/rules/no-raw-page-check.ts'

const runRule = (node: unknown, filename?: string) =>
  Testing.runRule(
    noRawPageCheck,
    'UnaryExpression',
    node,
    filename === undefined ? undefined : { filename },
  )

describe('no-raw-page-check', () => {
  it('flags typeof window and typeof document', () => {
    expect(
      runRule(Testing.unaryExpr('typeof', Testing.id('window'))),
    ).toHaveLength(1)
    expect(
      runRule(Testing.unaryExpr('typeof', Testing.id('document'))),
    ).toHaveLength(1)
  })

  it('allows typeof on other names, such as navigator capability checks', () => {
    expect(
      runRule(Testing.unaryExpr('typeof', Testing.id('navigator'))),
    ).toHaveLength(0)
    expect(runRule(Testing.unaryExpr('!', Testing.id('window')))).toHaveLength(
      0,
    )
  })

  it('lets the environment module check the globals itself', () => {
    expect(
      runRule(
        Testing.unaryExpr('typeof', Testing.id('window')),
        '/repo/packages/foldkit/src/environment/environment.ts',
      ),
    ).toHaveLength(0)
  })

  it('names the helper to use', () => {
    const [result] = runRule(Testing.unaryExpr('typeof', Testing.id('window')))
    expect(result?.diagnostic.message).toContain('Environment.maybePage()')
  })
})
