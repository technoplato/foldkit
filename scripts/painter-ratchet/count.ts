import { Array, Option, Record, String } from 'effect'
import ts from 'typescript'

// NOTE: the owner, 2026-11-20: "a painter should just take state and render
// a UI and then when that state changes, it should render again. That's
// it." Every count made here is something a painter holds beyond that: a
// timer, a memory, a listener, a number. Zero is where each file is headed.
// The counts are read off the syntax, so they see `setTimeout(tick, 250)`
// and never a number inside a string such as `'24px'`.

/** How many of each kind one file holds: `{ timers: 2, numbers: 14 }`. */
export type Counts = Readonly<Record<string, number>>

/** A file as it is counted: every node of its script, and its markup when it is a Svelte file. */
export type Source = Readonly<{
  nodes: ReadonlyArray<ts.Node>
  markup: string
}>

/** One kind of thing counted in a file, such as `timers`. */
export type Counter = Readonly<{
  kind: string
  count: (source: Source) => number
}>

// SOURCE

const SVELTE_SCRIPT = /<script\b[^>]*>([\s\S]*?)<\/script>/g

const SCRIPT_BODY = 1

const SVELTE_STYLE = /<style\b[^>]*>[\s\S]*?<\/style>/g

const isSvelte = (filePath: string): boolean => filePath.endsWith('.svelte')

const scriptKindOf = (filePath: string): ts.ScriptKind =>
  filePath.endsWith('.tsx') || filePath.endsWith('.jsx')
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS

const scriptOf = (filePath: string, text: string): string => {
  if (isSvelte(filePath)) {
    return Array.join(
      Array.map(Array.fromIterable(text.matchAll(SVELTE_SCRIPT)), match =>
        Option.getOrElse(Array.get(match, SCRIPT_BODY), () => ''),
      ),
      '\n',
    )
  } else {
    return text
  }
}

const markupOf = (filePath: string, text: string): string => {
  if (isSvelte(filePath)) {
    return text.replace(SVELTE_SCRIPT, '').replace(SVELTE_STYLE, '')
  } else {
    return ''
  }
}

const descendantsOf = (node: ts.Node): ReadonlyArray<ts.Node> => {
  const children: Array<ts.Node> = []
  node.forEachChild(child => {
    children.push(child)
  })
  return [node, ...Array.flatMap(children, descendantsOf)]
}

/**
 * Reads a file's text into what the counters count. A Svelte file gives
 * its `<script>` blocks as script and the rest as markup.
 *
 * @example
 * ```typescript
 * const source = sourceOf('paintReact.tsx', 'const quietMs = 4000')
 * numbers.count(source) // 1
 * ```
 */
export const sourceOf = (filePath: string, text: string): Source => ({
  nodes: descendantsOf(
    ts.createSourceFile(
      filePath,
      scriptOf(filePath, text),
      ts.ScriptTarget.Latest,
      true,
      scriptKindOf(filePath),
    ),
  ),
  markup: markupOf(filePath, text),
})

// SYNTAX

const nameHolders: ReadonlyArray<(node: ts.Node) => boolean> = [
  ts.isVariableDeclaration,
  ts.isParameter,
  ts.isBindingElement,
  ts.isPropertyAssignment,
  ts.isPropertySignature,
  ts.isPropertyDeclaration,
  ts.isMethodSignature,
  ts.isMethodDeclaration,
  ts.isFunctionDeclaration,
  ts.isImportSpecifier,
  ts.isExportSpecifier,
  ts.isImportClause,
  ts.isNamespaceImport,
]

const isNameOf = (node: ts.Identifier): boolean =>
  Array.some(nameHolders, isHolder => isHolder(node.parent)) &&
  'name' in node.parent &&
  node.parent.name === node

const isTypeMention = (node: ts.Identifier): boolean =>
  ts.isTypeQueryNode(node.parent) ||
  ts.isTypeReferenceNode(node.parent) ||
  ts.isQualifiedName(node.parent)

const isUseOf =
  (names: ReadonlyArray<string>) =>
  (node: ts.Node): node is ts.Identifier =>
    ts.isIdentifier(node) &&
    Array.contains(names, node.text) &&
    !isNameOf(node) &&
    !isTypeMention(node)

const lastNameOf = (expression: ts.Expression): Option.Option<string> => {
  if (ts.isIdentifier(expression)) {
    return Option.some(expression.text)
  } else if (ts.isPropertyAccessExpression(expression)) {
    return Option.some(expression.name.text)
  } else {
    return Option.none()
  }
}

const isLastName = (
  expression: ts.Expression,
  names: ReadonlyArray<string>,
): boolean =>
  Option.exists(lastNameOf(expression), name => Array.contains(names, name))

const countWhere = (
  source: Source,
  isCounted: (node: ts.Node) => boolean,
): number => Array.filter(source.nodes, isCounted).length

// TIMERS

const TIMER_NAMES = ['setTimeout', 'setInterval', 'requestAnimationFrame']

type Member = Readonly<{ of: string; name: string }>

const CLOCK_MEMBERS: ReadonlyArray<Member> = [
  { of: 'Date', name: 'now' },
  { of: 'performance', name: 'now' },
  { of: 'Effect', name: 'sleep' },
  { of: 'Effect', name: 'delay' },
]

const isMemberIn =
  (members: ReadonlyArray<Member>) =>
  (node: ts.Node): boolean =>
    ts.isPropertyAccessExpression(node) &&
    Array.some(
      members,
      member =>
        node.name.text === member.name &&
        isLastName(node.expression, [member.of]),
    )

const isDateRead = (node: ts.Node): boolean =>
  ts.isNewExpression(node) &&
  isLastName(node.expression, ['Date']) &&
  Array.isReadonlyArrayEmpty(node.arguments ?? [])

const isTimer = (node: ts.Node): boolean =>
  isUseOf(TIMER_NAMES)(node) ||
  isMemberIn(CLOCK_MEMBERS)(node) ||
  isDateRead(node)

/**
 * Timers and clocks: each use of `setTimeout`, `setInterval`,
 * `requestAnimationFrame`, `Date.now`, `performance.now`, `Effect.sleep`,
 * `Effect.delay`, and each `new Date()` that reads the time.
 *
 * @example
 * ```typescript
 * timers.count(sourceOf('a.ts', 'setTimeout(tick, 250); Date.now()')) // 2
 * ```
 */
export const timers: Counter = {
  kind: 'timers',
  count: source => countWhere(source, isTimer),
}

// HELD STATE

const STATE_CALLS = ['useState', 'useRef', 'useReducer', 'writable']

const SVELTE_STATE = '$state'

const REF_MEMBERS: ReadonlyArray<Member> = [
  { of: 'Ref', name: 'make' },
  { of: 'SubscriptionRef', name: 'make' },
  { of: 'SynchronizedRef', name: 'make' },
  { of: 'MutableRef', name: 'make' },
]

const COLLECTIONS = ['Map', 'Set', 'WeakMap', 'WeakSet']

const ARRAY_WRITES = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
]

const isSvelteState = (callee: ts.Expression): boolean =>
  (ts.isIdentifier(callee) && callee.text === SVELTE_STATE) ||
  (ts.isPropertyAccessExpression(callee) && isSvelteState(callee.expression))

const isStateCall = (node: ts.Node): boolean =>
  ts.isCallExpression(node) &&
  (isLastName(node.expression, STATE_CALLS) ||
    isSvelteState(node.expression) ||
    isMemberIn(REF_MEMBERS)(node.expression))

const isCollection = (node: ts.Node): boolean =>
  ts.isNewExpression(node) && isLastName(node.expression, COLLECTIONS)

const isReassignable = (list: ts.VariableDeclarationList): boolean =>
  (list.flags & ts.NodeFlags.Constant) === ts.NodeFlags.None

const reassignableCount = (source: Source): number =>
  Array.reduce(source.nodes, 0, (count, node) =>
    ts.isVariableDeclarationList(node) && isReassignable(node)
      ? count + node.declarations.length
      : count,
  )

const unwrapped = (expression: ts.Expression): ts.Expression => {
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression)
  ) {
    return unwrapped(expression.expression)
  } else {
    return expression
  }
}

const isAccess = (
  expression: ts.Expression,
): expression is ts.PropertyAccessExpression | ts.ElementAccessExpression =>
  ts.isPropertyAccessExpression(expression) ||
  ts.isElementAccessExpression(expression)

const rootNameOf = (expression: ts.Expression): Option.Option<string> => {
  const inner = unwrapped(expression)
  if (ts.isIdentifier(inner)) {
    return Option.some(inner.text)
  } else if (isAccess(inner)) {
    return rootNameOf(inner.expression)
  } else {
    return Option.none()
  }
}

const memberRootOf = (expression: ts.Expression): Option.Option<string> => {
  const inner = unwrapped(expression)
  if (isAccess(inner)) {
    return rootNameOf(inner.expression)
  } else {
    return Option.none()
  }
}

const isAssignment = (kind: ts.SyntaxKind): boolean =>
  kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment

const isStep = (kind: ts.SyntaxKind): boolean =>
  kind === ts.SyntaxKind.PlusPlusToken || kind === ts.SyntaxKind.MinusMinusToken

const isObjectAssign = (callee: ts.Expression): boolean =>
  ts.isPropertyAccessExpression(callee) &&
  callee.name.text === 'assign' &&
  isLastName(callee.expression, ['Object'])

const calledWriteRootOf = (call: ts.CallExpression): Option.Option<string> => {
  const callee = call.expression
  if (isObjectAssign(callee)) {
    return Option.flatMap(Array.head(call.arguments), rootNameOf)
  } else if (
    ts.isPropertyAccessExpression(callee) &&
    Array.contains(ARRAY_WRITES, callee.name.text)
  ) {
    return rootNameOf(callee.expression)
  } else {
    return Option.none()
  }
}

const writtenRootOf = (node: ts.Node): Option.Option<string> => {
  if (ts.isBinaryExpression(node) && isAssignment(node.operatorToken.kind)) {
    return memberRootOf(node.left)
  } else if (
    (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
    isStep(node.operator)
  ) {
    return memberRootOf(node.operand)
  } else if (ts.isDeleteExpression(node)) {
    return memberRootOf(node.expression)
  } else if (ts.isCallExpression(node)) {
    return calledWriteRootOf(node)
  } else {
    return Option.none()
  }
}

type Write = Readonly<{ name: string; at: number }>

const writesOf = (source: Source): ReadonlyArray<Write> =>
  Array.getSomes(
    Array.map(source.nodes, node =>
      Option.map(writtenRootOf(node), name => ({ name, at: node.getStart() })),
    ),
  )

const isScope = (node: ts.Node): boolean =>
  ts.isBlock(node) ||
  ts.isSourceFile(node) ||
  ts.isModuleBlock(node) ||
  ts.isCaseClause(node) ||
  ts.isDefaultClause(node)

const scopeOf = (node: ts.Node): ts.Node =>
  isScope(node.parent) ? node.parent : scopeOf(node.parent)

const isMadeHere = (
  node: ts.Node,
): node is ts.VariableDeclaration & Readonly<{ name: ts.Identifier }> =>
  ts.isVariableDeclaration(node) &&
  ts.isIdentifier(node.name) &&
  node.initializer !== undefined &&
  (ts.isObjectLiteralExpression(unwrapped(node.initializer)) ||
    ts.isArrayLiteralExpression(unwrapped(node.initializer)))

const writtenObjectCount = (source: Source): number => {
  const writes = writesOf(source)
  return countWhere(source, node => {
    if (isMadeHere(node)) {
      const scope = scopeOf(node)
      return Array.some(
        writes,
        write =>
          write.name === node.name.text &&
          write.at >= scope.getStart() &&
          write.at < scope.getEnd(),
      )
    } else {
      return false
    }
  })
}

/**
 * Held state: each `useState`, `useRef`, `useReducer`, Svelte `$state`
 * and `writable`, each Effect `Ref.make`, each `let` or `var` name, each
 * `Map` or `Set` made in the file, and each object or array made in the
 * file and written to later.
 *
 * @example
 * ```typescript
 * heldState.count(sourceOf('a.ts', 'const held = {}; held.wait = 3')) // 1
 * heldState.count(sourceOf('a.ts', 'const seen = { wait: 3 }')) // 0
 * ```
 */
export const heldState: Counter = {
  kind: 'heldState',
  count: source =>
    countWhere(source, isStateCall) +
    countWhere(source, isCollection) +
    reassignableCount(source) +
    writtenObjectCount(source),
}

// LISTENERS

const LISTEN_NAMES = ['addEventListener', 'addListener', 'fromEventListener']

const EMITTER_CALLS = ['on', 'once']

const OBSERVER = /Observer$/

const JSX_HANDLER = /^on[A-Z]/

const HTML_HANDLER = /^On[A-Z]/

const SVELTE_HANDLER = /\son:?[A-Za-z]+(?:\|[A-Za-z]+)*=/g

const EMITTER_ARGUMENTS = 2

const isEmitterCall = (node: ts.Node): boolean =>
  ts.isCallExpression(node) &&
  ts.isPropertyAccessExpression(node.expression) &&
  Array.contains(EMITTER_CALLS, node.expression.name.text) &&
  node.arguments.length >= EMITTER_ARGUMENTS &&
  Option.exists(Array.head(node.arguments), ts.isStringLiteralLike)

const isObserver = (node: ts.Node): boolean =>
  ts.isNewExpression(node) &&
  Option.exists(lastNameOf(node.expression), name => OBSERVER.test(name))

const isJsxHandler = (node: ts.Node): boolean =>
  ts.isJsxAttribute(node) &&
  ts.isIdentifier(node.name) &&
  JSX_HANDLER.test(node.name.text)

const isHtmlHandler = (node: ts.Node): boolean =>
  ts.isCallExpression(node) &&
  Option.exists(lastNameOf(node.expression), name => HTML_HANDLER.test(name))

const isListener = (node: ts.Node): boolean =>
  isUseOf(LISTEN_NAMES)(node) ||
  isEmitterCall(node) ||
  isObserver(node) ||
  isJsxHandler(node) ||
  isHtmlHandler(node)

/**
 * Listeners: each `addEventListener`, `addListener` and
 * `Stream.fromEventListener`, each `.on('data', ...)` on an emitter, each
 * observer made (`new ResizeObserver`), each JSX handler (`onScroll={...}`),
 * each `foldkit/html` handler (`OnClick(...)`), and each handler in Svelte
 * markup (`onclick={...}`).
 *
 * @example
 * ```typescript
 * listeners.count(sourceOf('a.ts', "window.addEventListener('wheel', left)")) // 1
 * ```
 */
export const listeners: Counter = {
  kind: 'listeners',
  count: source =>
    countWhere(source, isListener) +
    Array.fromIterable(source.markup.matchAll(SVELTE_HANDLER)).length,
}

// NUMBERS

const PLAIN_NUMBERS = [0, 1]

const PLAIN_BIG_NUMBERS = ['0n', '1n']

const isRuleNumber = (node: ts.Node): boolean => {
  if (ts.isNumericLiteral(node)) {
    return !Array.contains(PLAIN_NUMBERS, Number(node.text))
  } else if (ts.isBigIntLiteral(node)) {
    return !Array.contains(PLAIN_BIG_NUMBERS, node.text)
  } else {
    return false
  }
}

/**
 * Numbers: every number written in the file other than 0 and 1, named or
 * inline. `maximumJumps = 5` is a rule's number with no unit in its name.
 *
 * @example
 * ```typescript
 * numbers.count(sourceOf('a.ts', 'const maximumJumps = 5; const first = 0')) // 1
 * ```
 */
export const numbers: Counter = {
  kind: 'numbers',
  count: source => countWhere(source, isRuleNumber),
}

// DOM

const DOM_MODULES = [
  'foldkit/html',
  'foldkit/dom',
  'foldkit/mount',
  'foldkit/render',
  'foldkit/file',
  '@floating-ui/dom',
]

const ROOT_MODULE = 'foldkit'

const ROOT_DOM_NAMES = ['Html', 'Mount', 'Dom', 'Render', 'File']

const isDomModule = (specifier: string): boolean =>
  Array.some(
    DOM_MODULES,
    name => specifier === name || String.startsWith(`${name}/`)(specifier),
  )

const moduleOf = (
  node: ts.ImportDeclaration | ts.ExportDeclaration,
): Option.Option<string> =>
  Option.map(
    Option.filter(
      Option.fromNullishOr(node.moduleSpecifier),
      ts.isStringLiteralLike,
    ),
    specifier => specifier.text,
  )

const isFrom = (
  node: ts.ImportDeclaration | ts.ExportDeclaration,
  isWanted: (specifier: string) => boolean,
): boolean => Option.exists(moduleOf(node), isWanted)

const namedImportsOf = (
  node: ts.ImportDeclaration,
): ReadonlyArray<ts.ImportSpecifier> => {
  const bindings = node.importClause?.namedBindings
  if (bindings !== undefined && ts.isNamedImports(bindings)) {
    return bindings.elements
  } else {
    return []
  }
}

const isRootDomName = (specifier: ts.ImportSpecifier): boolean =>
  Array.contains(
    ROOT_DOM_NAMES,
    (specifier.propertyName ?? specifier.name).text,
  )

const rootDomImportsOf = (
  node: ts.ImportDeclaration,
): ReadonlyArray<ts.ImportSpecifier> => {
  if (isFrom(node, specifier => specifier === ROOT_MODULE)) {
    return Array.filter(namedImportsOf(node), isRootDomName)
  } else {
    return []
  }
}

const isDynamicDomImport = (node: ts.Node): boolean =>
  ts.isCallExpression(node) &&
  node.expression.kind === ts.SyntaxKind.ImportKeyword &&
  Option.exists(
    Array.head(node.arguments),
    argument => ts.isStringLiteralLike(argument) && isDomModule(argument.text),
  )

const domImportCountOf = (node: ts.Node): number => {
  if (ts.isImportDeclaration(node)) {
    return isFrom(node, isDomModule) ? 1 : rootDomImportsOf(node).length
  } else if (ts.isExportDeclaration(node)) {
    return isFrom(node, isDomModule) ? 1 : 0
  } else {
    return isDynamicDomImport(node) ? 1 : 0
  }
}

/**
 * Imports of the DOM's modules: each import or re-export of
 * `foldkit/html`, `foldkit/dom`, `foldkit/mount`, `foldkit/render`,
 * `foldkit/file` or `@floating-ui/dom`, and each of `Html`, `Mount`,
 * `Dom`, `Render` and `File` taken from the `foldkit` root.
 *
 * @example
 * ```typescript
 * domImports.count(sourceOf('a.ts', "import { html } from 'foldkit/html'")) // 1
 * ```
 */
export const domImports: Counter = {
  kind: 'domImports',
  count: source =>
    Array.reduce(
      source.nodes,
      0,
      (count, node) => count + domImportCountOf(node),
    ),
}

const localNamesOf = (node: ts.ImportDeclaration): ReadonlyArray<string> => {
  const clause = node.importClause
  if (clause === undefined) {
    return []
  } else {
    const bindings = clause.namedBindings
    return [
      ...Array.fromNullishOr(clause.name?.text),
      ...(bindings !== undefined && ts.isNamespaceImport(bindings)
        ? [bindings.name.text]
        : []),
      ...Array.map(namedImportsOf(node), specifier => specifier.name.text),
    ]
  }
}

const domNamesOf = (source: Source): ReadonlyArray<string> =>
  Array.dedupe(
    Array.flatMap(source.nodes, node => {
      if (ts.isImportDeclaration(node) && isFrom(node, isDomModule)) {
        return localNamesOf(node)
      } else if (ts.isImportDeclaration(node)) {
        return Array.map(
          rootDomImportsOf(node),
          specifier => specifier.name.text,
        )
      } else {
        return []
      }
    }),
  )

const isMemberName = (node: ts.Identifier): boolean =>
  (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) ||
  (ts.isQualifiedName(node.parent) && node.parent.right === node)

const isMention =
  (names: ReadonlyArray<string>) =>
  (node: ts.Node): boolean =>
    ts.isIdentifier(node) &&
    Array.contains(names, node.text) &&
    !isNameOf(node) &&
    !isMemberName(node)

/**
 * Uses of what the DOM's modules gave: each mention of a name imported
 * from them, past the import itself. `h.div(...)` twice is two.
 *
 * @example
 * ```typescript
 * domUses.count(sourceOf('a.ts', "import { html } from 'foldkit/html'; html(); html()")) // 2
 * ```
 */
export const domUses: Counter = {
  kind: 'domUses',
  count: source => countWhere(source, isMention(domNamesOf(source))),
}

/**
 * Mentions of the page's `document`.
 *
 * @example
 * ```typescript
 * documentUses.count(sourceOf('a.ts', "document.getElementById('menu')")) // 1
 * ```
 */
export const documentUses: Counter = {
  kind: 'document',
  count: source => countWhere(source, isMention(['document'])),
}

/**
 * Mentions of the page's `window`.
 *
 * @example
 * ```typescript
 * windowUses.count(sourceOf('a.ts', 'window.scrollTo(0, 0)')) // 1
 * ```
 */
export const windowUses: Counter = {
  kind: 'window',
  count: source => countWhere(source, isMention(['window'])),
}

// COUNT

/**
 * Counts one file's text with each counter, by kind.
 *
 * @example
 * ```typescript
 * countsOf([timers, numbers], 'a.ts', 'setTimeout(tick, 250)')
 * // { timers: 1, numbers: 1 }
 * ```
 */
export const countsOf = (
  counters: ReadonlyArray<Counter>,
  filePath: string,
  text: string,
): Counts => {
  const source = sourceOf(filePath, text)
  return Record.fromEntries(
    Array.map(counters, counter => [counter.kind, counter.count(source)]),
  )
}
