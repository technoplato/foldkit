import type { LazyNode, UiNode } from './types.js'

type LazyCacheEntry = Readonly<{
  readonly fn: unknown
  readonly args: ReadonlyArray<unknown>
  readonly resolved: UiNode
  readonly subCache: LazyCache
}>

/**
 * Per-entry resolution cache for `Lazy` nodes, owned by one bound Program
 * instance (never shared globally). Entries are matched by tree path plus any
 * explicit `key` so list insertions or reorderings do not thrash siblings.
 */
export type LazyCache = ReadonlyMap<string, LazyCacheEntry>

const argsEqual = (
  previous: ReadonlyArray<unknown>,
  next: ReadonlyArray<unknown>,
): boolean => {
  if (previous.length !== next.length) {
    return false
  }

  for (let index = 0; index < previous.length; index++) {
    if (!Object.is(previous.at(index), next.at(index))) {
      return false
    }
  }

  return true
}

/**
 * Evaluates a `LazyNode` without caching, unwrapping nested `Lazy` nodes until
 * a concrete `UiNode` is reached. Used by direct helpers and painters when a
 * caller passes an unresolved tree outside `Interaction.bind`.
 */
export const resolveLazyNode = (node: LazyNode): UiNode => {
  let current: UiNode = node.build()
  while (current._tag === 'Lazy') {
    current = current.build()
  }
  return current
}

const resolveChildren = (
  children: ReadonlyArray<UiNode>,
  parentPath: string,
  previousCache: LazyCache | undefined,
  nextCache: Map<string, LazyCacheEntry>,
): ReadonlyArray<UiNode> => {
  let isUnchanged = true
  const resolved: Array<UiNode> = []

  for (let index = 0; index < children.length; index++) {
    const child = children.at(index)
    if (child === undefined) {
      continue
    }

    const segment =
      child._tag === 'Lazy' && child.key !== undefined
        ? `k:${child.key}`
        : index.toString()
    const childPath = `${parentPath}/${segment}`
    const nextChild = resolveNode(child, childPath, previousCache, nextCache)
    if (nextChild !== child) {
      isUnchanged = false
    }
    resolved.push(nextChild)
  }

  return isUnchanged ? children : resolved
}

const resolveNode = (
  node: UiNode,
  path: string,
  previousCache: LazyCache | undefined,
  nextCache: Map<string, LazyCacheEntry>,
): UiNode => {
  if (node._tag === 'Lazy') {
    const cached = previousCache?.get(path)
    if (
      cached !== undefined &&
      cached.fn === node.fn &&
      argsEqual(cached.args, node.args)
    ) {
      nextCache.set(path, cached)
      return cached.resolved
    }

    const subCache = new Map<string, LazyCacheEntry>()
    const raw = node.build()
    const resolved = resolveNode(raw, '', cached?.subCache, subCache)
    nextCache.set(path, {
      fn: node.fn,
      args: node.args,
      resolved,
      subCache,
    })
    return resolved
  }

  if (
    node._tag === 'Row' ||
    node._tag === 'Column' ||
    node._tag === 'Box' ||
    node._tag === 'DeviceShell'
  ) {
    const children = resolveChildren(
      node.children,
      path,
      previousCache,
      nextCache,
    )
    if (children === node.children) {
      return node
    }
    return { ...node, children }
  }

  return node
}

/**
 * Resolves every `Lazy` node in `root` against `previousCache`, returning a
 * concrete `UiNode` tree with no remaining `Lazy` nodes and the updated cache
 * for the next render. When a `Lazy` node at the same `(path, key)` has the
 * same `fn` and pairwise `Object.is`-equal `args`, `build` is not called and
 * the exact previous resolved `UiNode` object is returned.
 *
 * @example
 * ```typescript
 * const first = resolveLazyTree(tree)
 * const second = resolveLazyTree(nextTree, first.cache)
 * ```
 */
export const resolveLazyTree = (
  root: UiNode,
  previousCache?: LazyCache,
): Readonly<{ readonly node: UiNode; readonly cache: LazyCache }> => {
  const nextCache = new Map<string, LazyCacheEntry>()
  const rootPath =
    root._tag === 'Lazy' && root.key !== undefined ? `k:${root.key}` : ''
  const node = resolveNode(root, rootPath, previousCache, nextCache)
  return { node, cache: nextCache }
}
