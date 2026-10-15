import { Array, Effect } from 'effect'
import { Diagnostic, type ESTree, Rule, RuleContext } from 'effect-oxlint'

import { isIdentifier } from '../guards.ts'

const pageGlobals = ['window', 'document']

const environmentModulePattern = /[\\/]environment[\\/]environment\.ts$/

const isUnaryExpression = (
  node: unknown,
): node is Readonly<{
  type: 'UnaryExpression'
  operator: string
  argument: unknown
}> =>
  typeof node === 'object' &&
  node !== null &&
  'type' in node &&
  node.type === 'UnaryExpression' &&
  'operator' in node &&
  typeof node.operator === 'string'

/**
 * Requires `Environment.maybePage()` or `Environment.isPage()` instead of
 * `typeof window` or `typeof document`. A `window` alone is no page:
 * @foldkit/instant's Node client defines an empty one so @instantdb/core
 * runs in a terminal, and React Native defines one with no `document`. A
 * raw check took a terminal for a browser and silenced its telemetry.
 * Only `environment/environment.ts` may check the globals itself.
 */
export const noRawPageCheck = Rule.define({
  name: 'no-raw-page-check',
  meta: Rule.meta({
    type: 'problem',
    description:
      'Check for a browser page with Environment.maybePage() or Environment.isPage(), not typeof window or typeof document.',
  }),
  create: function* () {
    const ctx = yield* RuleContext
    const isEnvironmentModule = environmentModulePattern.test(ctx.filename)
    return {
      UnaryExpression: (node: ESTree.Node) => {
        if (
          isEnvironmentModule ||
          !isUnaryExpression(node) ||
          node.operator !== 'typeof' ||
          !Array.some(pageGlobals, name => isIdentifier(node.argument, name))
        ) {
          return Effect.void
        }
        return ctx.report(
          Diagnostic.make({
            node,
            message:
              'A raw `typeof window` or `typeof document` check takes a terminal with a stand-in window, or React Native, for a browser page. Use `Environment.maybePage()` from foldkit, which returns the page window and document only in a real page, or `Environment.isPage()`.',
          }),
        )
      },
    }
  },
})
