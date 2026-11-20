import { Context } from 'effect'
import { afterEach, beforeEach, expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import { MountTracker } from '../mount/index.js'
import { Dispatch } from '../runtime/index.js'
import { h } from '../snabbdom/index.js'
import { type VNode, dedupeSharedVNodes, memoizedVNodes } from '../vdom.js'
import {
  type BoundaryRegistry,
  abandonRender,
  beginRender,
  clearKeyedLazyCaches,
  createBoundaryRegistry,
  endRender,
} from './boundary.js'
import { createKeyedLazy, createLazy } from './lazy.js'
import {
  type DispatchSync,
  clearRuntime,
  setRuntime,
} from './runtimeSingleton.js'

const noOpDispatchSync: DispatchSync = () => {}

const noOpDispatchService = Dispatch.of({
  dispatchAsync: () =>
    /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
    Promise.resolve() as unknown as ReturnType<
      typeof Dispatch.Service.dispatchAsync
    >,
  dispatchSync: noOpDispatchSync,
})

const noOpContext = Context.make(Dispatch, noOpDispatchService).pipe(
  Context.add(MountTracker, {
    started: () => {},
    ended: () => {},
  }),
)

const pushNoOpRuntime = (): void => {
  setRuntime(noOpDispatchSync, noOpContext)
}

const asVNode = (child: VNode | string | undefined): VNode => {
  if (child === undefined || typeof child === 'string') {
    throw new Error('expected a VNode')
  }
  return child
}

describe('memoized views dedupe shared consts', () => {
  let registry: BoundaryRegistry

  beforeEach(() => {
    registry = createBoundaryRegistry()
    setRuntime(noOpDispatchSync, noOpContext, registry)
    beginRender(registry)
  })

  afterEach(() => {
    clearRuntime()
  })

  it('clones a const reused at two positions inside one memoized view', () => {
    const icon = h('span', {}, ['icon'])
    const view = () => h('div', {}, [icon, icon])
    const lazy = createLazy()

    const result = lazy(view, [])

    expect(asVNode(result!.children?.[0])).toBe(icon)
    expect(asVNode(result!.children?.[1])).not.toBe(icon)
  })

  it('clones a const shared across two memoized slots in one render', () => {
    const icon = h('span', {}, ['icon'])
    const rowView = (label: string) =>
      h('div', {}, [icon, h('span', {}, [label])])
    const lazyRows = createKeyedLazy()

    const rowA = lazyRows('a', rowView, ['a'])
    const rowB = lazyRows('b', rowView, ['b'])
    const tree = dedupeSharedVNodes(
      h('ul', {}, [rowA!, rowB!]),
      registry.dedupeSeen,
    )

    const iconA = asVNode(asVNode(tree.children?.[0]).children?.[0])
    const iconB = asVNode(asVNode(tree.children?.[1]).children?.[0])
    expect(iconA).toBe(icon)
    expect(iconB).not.toBe(icon)
  })

  it('clones a const that moves to a different memoized slot across renders', () => {
    const icon = h('span', {}, ['icon'])
    // A prior render patched the icon, recording its live DOM node on .elm.
    icon.elm = document.createElement('span')
    const rowView = (isShown: boolean) => h('div', {}, isShown ? [icon] : [])
    const lazyRows = createKeyedLazy()

    const rowB = lazyRows('b', rowView, [true])

    const iconInB = asVNode(rowB!.children?.[0])
    expect(iconInB).not.toBe(icon)
    expect(iconInB.elm).toBeUndefined()
  })

  it('keeps a memoized result identical on a cache hit so the short-circuit survives', () => {
    const view = (label: string) => h('div', {}, [h('span', {}, [label])])
    const lazy = createLazy()

    const first = lazy(view, ['x'])
    beginRender(registry)
    const second = lazy(view, ['x'])

    expect(second).toBe(first)
    const tree = dedupeSharedVNodes(
      h('div', {}, [second!]),
      registry.dedupeSeen,
    )
    expect(asVNode(tree.children?.[0])).toBe(first)
  })

  it('clones a const shared between a memoized view and a plain sibling', () => {
    const icon = h('span', {}, ['icon'])
    const memoizedView = () => h('div', {}, [icon])
    const lazy = createLazy()

    const memoized = lazy(memoizedView, [])
    const tree = dedupeSharedVNodes(
      h('section', {}, [memoized!, h('div', {}, [icon])]),
      registry.dedupeSeen,
    )

    expect(asVNode(asVNode(tree.children?.[0]).children?.[0])).toBe(icon)
    expect(asVNode(asVNode(tree.children?.[1]).children?.[0])).not.toBe(icon)
  })

  it('clones a plain-sibling const even when the memoized view is a cache hit', () => {
    const icon = h('span', {}, ['icon'])
    const memoizedView = () => h('div', {}, [icon])
    const lazy = createLazy()

    lazy(memoizedView, [])
    // A prior render patched the icon, recording its live DOM node on .elm.
    icon.elm = document.createElement('span')

    beginRender(registry)
    const memoized = lazy(memoizedView, [])
    const tree = dedupeSharedVNodes(
      h('section', {}, [memoized!, h('div', {}, [icon])]),
      registry.dedupeSeen,
    )

    const plainIcon = asVNode(asVNode(tree.children?.[1]).children?.[0])
    expect(plainIcon).not.toBe(icon)
    expect(plainIcon.elm).toBeUndefined()
  })
})

describe('createLazy', () => {
  beforeEach(() => {
    pushNoOpRuntime()
  })
  afterEach(() => {
    clearRuntime()
  })

  it('calls the view function on first render', () => {
    let callCount = 0
    const viewFn = (label: string) => {
      callCount++
      return h('div', {}, [label])
    }

    const lazy = createLazy()
    lazy(viewFn, ['hello'])

    expect(callCount).toBe(1)
  })

  it('returns cached VNode when function and args are the same reference', () => {
    let callCount = 0
    const viewFn = (label: string) => {
      callCount++
      return h('div', {}, [label])
    }

    const lazy = createLazy()
    const firstVNode = lazy(viewFn, ['hello'])
    const secondVNode = lazy(viewFn, ['hello'])

    expect(callCount).toBe(1)
    expect(secondVNode).toBe(firstVNode)
  })

  it('records its result so dedupeSharedVNodes preserves the cached identity', () => {
    const viewFn = (label: string) => h('div', {}, [label])

    const lazy = createLazy()
    const vnode = lazy(viewFn, ['hello'])

    expect(vnode).not.toBeNull()
    expect(memoizedVNodes.has(vnode!)).toBe(true)

    vnode!.elm = document.createElement('div')
    const tree = h('section', {}, [vnode!])
    const result = dedupeSharedVNodes(tree)

    expect(result.children?.[0]).toBe(vnode)
  })

  it('recomputes when args change by reference', () => {
    let callCount = 0
    const viewFn = (count: number) => {
      callCount++
      return h('div', {}, [`count: ${count}`])
    }

    const lazy = createLazy()
    const firstVNode = lazy(viewFn, [1])
    const secondVNode = lazy(viewFn, [2])

    expect(callCount).toBe(2)
    expect(secondVNode).not.toBe(firstVNode)
  })

  it('recomputes when function reference changes', () => {
    let callCount = 0
    const makeViewFn = () => (label: string) => {
      callCount++
      return h('div', {}, [label])
    }

    const lazy = createLazy()
    lazy(makeViewFn(), ['hello'])
    lazy(makeViewFn(), ['hello'])

    expect(callCount).toBe(2)
  })

  it('returns cached VNode when multiple args are the same reference', () => {
    let callCount = 0
    const viewFn = (label: string, count: number) => {
      callCount++
      return h('div', {}, [`${label}: ${count}`])
    }

    const lazy = createLazy()
    lazy(viewFn, ['hello', 42])
    lazy(viewFn, ['hello', 42])

    expect(callCount).toBe(1)
  })

  it('recomputes when any arg in the array changes', () => {
    let callCount = 0
    const viewFn = (label: string, count: number) => {
      callCount++
      return h('div', {}, [`${label}: ${count}`])
    }

    const lazy = createLazy()
    lazy(viewFn, ['hello', 1])
    lazy(viewFn, ['hello', 2])

    expect(callCount).toBe(2)
  })

  it('uses referential equality for object args', () => {
    let callCount = 0
    const viewFn = (model: Readonly<{ value: number }>) => {
      callCount++
      return h('div', {}, [`${model.value}`])
    }

    const model = { value: 1 }
    const lazy = createLazy()
    lazy(viewFn, [model])
    lazy(viewFn, [model])

    expect(callCount).toBe(1)
  })

  it('recomputes when object arg is a new reference with same value', () => {
    let callCount = 0
    const viewFn = (model: Readonly<{ value: number }>) => {
      callCount++
      return h('div', {}, [`${model.value}`])
    }

    const lazy = createLazy()
    lazy(viewFn, [{ value: 1 }])
    lazy(viewFn, [{ value: 1 }])

    expect(callCount).toBe(2)
  })

  it('independent lazy instances do not share cache', () => {
    let callCount = 0
    const viewFn = (label: string) => {
      callCount++
      return h('div', {}, [label])
    }

    const lazyA = createLazy()
    const lazyB = createLazy()
    lazyA(viewFn, ['hello'])
    lazyB(viewFn, ['hello'])

    expect(callCount).toBe(2)
  })

  it('handles null VNode from view function', () => {
    let callCount = 0
    const viewFn = () => {
      callCount++
      return null
    }

    const lazy = createLazy()
    const firstResult = lazy(viewFn, [])
    const secondResult = lazy(viewFn, [])

    expect(callCount).toBe(1)
    expect(firstResult).toBeNull()
    expect(secondResult).toBeNull()
  })

  it('recomputes when dispatch changes between renders', () => {
    let callCount = 0
    const viewFn = (label: string) => {
      callCount++
      return h('div', {}, [label])
    }

    const otherDispatchSync: DispatchSync = () => {}
    const otherContext = Context.make(Dispatch, noOpDispatchService).pipe(
      Context.add(MountTracker, {
        started: () => {},
        ended: () => {},
      }),
    )

    const lazy = createLazy()
    lazy(viewFn, ['hello'])
    clearRuntime()
    setRuntime(otherDispatchSync, otherContext)
    lazy(viewFn, ['hello'])

    expect(callCount).toBe(2)
  })
})

describe('createKeyedLazy', () => {
  beforeEach(() => {
    pushNoOpRuntime()
  })
  afterEach(() => {
    clearRuntime()
  })

  it('calls the view function on first render for each key', () => {
    let callCount = 0
    const viewFn = (label: string) => {
      callCount++
      return h('div', {}, [label])
    }

    const lazy = createKeyedLazy()
    lazy('a', viewFn, ['hello'])
    lazy('b', viewFn, ['world'])

    expect(callCount).toBe(2)
  })

  it('caches independently per key', () => {
    let callCount = 0
    const viewFn = (label: string) => {
      callCount++
      return h('div', {}, [label])
    }

    const lazy = createKeyedLazy()
    lazy('a', viewFn, ['hello'])
    lazy('b', viewFn, ['world'])
    lazy('a', viewFn, ['hello'])
    lazy('b', viewFn, ['world'])

    expect(callCount).toBe(2)
  })

  it('caches PropertyKeys by identity', () => {
    let callCount = 0
    const viewFn = (label: string) => {
      callCount++
      return h('div', {}, [label])
    }

    const firstSymbol = Symbol('1')
    const secondSymbol = Symbol('1')
    const lazy = createKeyedLazy()
    lazy(1, viewFn, ['number'])
    lazy('1', viewFn, ['string'])
    lazy(firstSymbol, viewFn, ['first symbol'])
    lazy(secondSymbol, viewFn, ['second symbol'])
    lazy(1, viewFn, ['number'])
    lazy('1', viewFn, ['string'])
    lazy(firstSymbol, viewFn, ['first symbol'])
    lazy(secondSymbol, viewFn, ['second symbol'])

    expect(callCount).toBe(4)
  })

  it('recomputes only the key whose args changed', () => {
    const calls: Array<string> = []
    const viewFn = (label: string) => {
      calls.push(label)
      return h('div', {}, [label])
    }

    const lazy = createKeyedLazy()
    lazy('a', viewFn, ['hello'])
    lazy('b', viewFn, ['world'])
    lazy('a', viewFn, ['hello'])
    lazy('b', viewFn, ['changed'])

    expect(calls).toStrictEqual(['hello', 'world', 'changed'])
  })

  it('returns cached VNode reference on cache hit', () => {
    const viewFn = (label: string) => h('div', {}, [label])

    const lazy = createKeyedLazy()
    const first = lazy('a', viewFn, ['hello'])
    const second = lazy('a', viewFn, ['hello'])

    expect(second).toBe(first)
  })

  it('returns different VNode references on cache miss', () => {
    const viewFn = (active: boolean) => h('div', {}, [String(active)])

    const lazy = createKeyedLazy()
    const first = lazy('a', viewFn, [false])
    const second = lazy('a', viewFn, [true])

    expect(second).not.toBe(first)
  })

  it('recomputes when dispatch changes between renders', () => {
    let callCount = 0
    const viewFn = (label: string) => {
      callCount++
      return h('div', {}, [label])
    }

    const otherDispatchSync: DispatchSync = () => {}
    const otherContext = Context.make(Dispatch, noOpDispatchService).pipe(
      Context.add(MountTracker, {
        started: () => {},
        ended: () => {},
      }),
    )

    const lazy = createKeyedLazy()
    lazy('a', viewFn, ['hello'])
    clearRuntime()
    setRuntime(otherDispatchSync, otherContext)
    lazy('a', viewFn, ['hello'])

    expect(callCount).toBe(2)
  })

  it('evicts entries absent from a completed render by default', () => {
    let calls = 0
    const rowView = (label: string) => {
      calls += 1
      return h('div', {}, [label])
    }
    const registry = createBoundaryRegistry()
    clearRuntime()
    setRuntime(noOpDispatchSync, noOpContext, registry)

    const lazyRows = createKeyedLazy()
    beginRender(registry)
    const firstA = lazyRows('a', rowView, ['alpha'])
    lazyRows('b', rowView, ['beta'])
    endRender(registry)
    expect(calls).toBe(2)

    // Render without key 'b': 'a' hits cache, 'b' is evicted on endRender.
    beginRender(registry)
    const secondA = lazyRows('a', rowView, ['alpha'])
    endRender(registry)
    expect(secondA).toBe(firstA)
    expect(calls).toBe(2)

    // Rendering 'b' again recomputes because it was evicted.
    beginRender(registry)
    lazyRows('a', rowView, ['alpha'])
    lazyRows('b', rowView, ['beta'])
    endRender(registry)
    expect(calls).toBe(3)
  })

  it('retains absent entries when configured with evict: None', () => {
    let calls = 0
    const rowView = (label: string) => {
      calls += 1
      return h('div', {}, [label])
    }
    const registry = createBoundaryRegistry()
    clearRuntime()
    setRuntime(noOpDispatchSync, noOpContext, registry)

    const lazyRows = createKeyedLazy({ evict: 'None' })
    beginRender(registry)
    lazyRows('a', rowView, ['alpha'])
    const firstB = lazyRows('b', rowView, ['beta'])
    endRender(registry)

    beginRender(registry)
    lazyRows('a', rowView, ['alpha'])
    endRender(registry)

    beginRender(registry)
    const secondB = lazyRows('b', rowView, ['beta'])
    endRender(registry)
    expect(secondB).toBe(firstB)
    expect(calls).toBe(2)
  })

  it('preserves nested keyed-lazy entries beneath a cached createLazy parent', () => {
    let rowCalls = 0
    const rowView = (label: string) => {
      rowCalls += 1
      return h('span', {}, [label])
    }
    const registry = createBoundaryRegistry()
    clearRuntime()
    setRuntime(noOpDispatchSync, noOpContext, registry)

    const lazyParent = createLazy()
    const lazyRows = createKeyedLazy()
    const parentView = (label: string) =>
      h('div', {}, [lazyRows('row-1', rowView, [label])])

    beginRender(registry)
    lazyParent(parentView, ['hello'])
    endRender(registry)
    expect(rowCalls).toBe(1)

    // Parent hits cache; nested 'row-1' must NOT be evicted.
    beginRender(registry)
    lazyParent(parentView, ['hello'])
    endRender(registry)
    expect(rowCalls).toBe(1)

    // Parent misses (new arg), nested 'row-1' still cached with same label!
    const parentViewTwo = (label: string, _version: number) =>
      h('div', {}, [lazyRows('row-1', rowView, [label])])
    beginRender(registry)
    lazyParent(parentViewTwo, ['hello', 2])
    endRender(registry)
    expect(rowCalls).toBe(1)
  })

  it('rolls back cache writes on abandonRender without evicting prior entries', () => {
    let calls = 0
    const rowView = (label: string) => {
      calls += 1
      return h('div', {}, [label])
    }
    const registry = createBoundaryRegistry()
    clearRuntime()
    setRuntime(noOpDispatchSync, noOpContext, registry)

    const lazyRows = createKeyedLazy()
    beginRender(registry)
    const firstA = lazyRows('a', rowView, ['v1'])
    endRender(registry)
    expect(calls).toBe(1)

    // Partial render updates 'a' to 'v2' and adds 'b', then fails and abandons.
    beginRender(registry)
    lazyRows('a', rowView, ['v2'])
    lazyRows('b', rowView, ['new'])
    abandonRender(registry)
    expect(calls).toBe(3)

    // Next render sees 'a' restored to 'v1' (cache hit!) and 'b' rolled back (recomputed).
    beginRender(registry)
    const afterRollbackA = lazyRows('a', rowView, ['v1'])
    lazyRows('b', rowView, ['new'])
    endRender(registry)
    expect(afterRollbackA).toBe(firstA)
    expect(calls).toBe(4)
  })

  it('isolates evicting caches per runtime BoundaryRegistry and clears them on teardown', () => {
    let calls = 0
    const rowView = (label: string) => {
      calls += 1
      return h('div', {}, [label])
    }
    const registryOne = createBoundaryRegistry()
    const registryTwo = createBoundaryRegistry()
    const lazyRows = createKeyedLazy()

    clearRuntime()
    setRuntime(noOpDispatchSync, noOpContext, registryOne)
    beginRender(registryOne)
    const oneA = lazyRows('a', rowView, ['alpha'])
    endRender(registryOne)
    clearRuntime()

    // Runtime two renders only 'b'; runtime one's 'a' stays intact.
    setRuntime(noOpDispatchSync, noOpContext, registryTwo)
    beginRender(registryTwo)
    lazyRows('b', rowView, ['beta'])
    endRender(registryTwo)
    clearRuntime()

    setRuntime(noOpDispatchSync, noOpContext, registryOne)
    beginRender(registryOne)
    const oneAAgain = lazyRows('a', rowView, ['alpha'])
    endRender(registryOne)
    expect(oneAAgain).toBe(oneA)
    expect(calls).toBe(2)

    // Teardown clears runtime one's cache.
    clearKeyedLazyCaches(registryOne)
    beginRender(registryOne)
    lazyRows('a', rowView, ['alpha'])
    endRender(registryOne)
    expect(calls).toBe(3)
  })
})
