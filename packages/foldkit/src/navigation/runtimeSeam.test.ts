import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  type HistoryPort,
  makeUriSync,
  sameStack,
} from './runtimeSeam.js'
import {
  type NavigationStack,
  presented,
  stackAtRoot,
  stackWithEntries,
} from './structure.js'

// FIXTURE
//
// A tiny destination union where the detail destination carries a
// transient presentation id that must never reach the printed URI.

type Destination = Readonly<{ readonly path: string }>

interface AppModel {
  readonly root: string
  readonly stack: NavigationStack<Destination>
}

const dest = (path: string): Destination => ({ path })

const navigation = {
  printDestination: (destination: Destination): string => destination.path,
  printStack: (stack: NavigationStack<Destination>): string => {
    if (stack.presented._tag === 'NothingPresented') {
      return stack.root.path
    }
    // Destinations carry absolute paths; the deepest one is canonical.
    const entries = stack.presented.entries
    return entries[entries.length - 1]?.destination.path ?? stack.root.path
  },
  parseUri: (uri: string) => {
    if (uri === '/home') {
      return Option.some(stackAtRoot(dest('/home')))
    }
    const detail = /^\/home\/detail\/(\w+)$/u.exec(uri)
    if (detail !== null && detail[1] !== undefined) {
      return Option.some(
        stackWithEntries(dest('/home'), [
          presented(dest(`/home/detail/${detail[1]}`), { _tag: 'Push' }),
        ]),
      )
    }
    return Option.none()
  },
  stackOf: (model: unknown): NavigationStack<Destination> =>
    (model as AppModel).stack,
  withStack: (model: unknown, stack: NavigationStack<Destination>): unknown => ({
    ...(model as AppModel),
    stack,
  }),
}

const model = (detailId?: string): AppModel => ({
  root: '/home',
  stack:
    detailId === undefined
      ? stackAtRoot(dest('/home'))
      : stackWithEntries(dest('/home'), [
          presented(dest(`/home/detail/${detailId}`), { _tag: 'Push' }),
        ]),
})

/** Records history moves in order for assertion. */
const recorder = (): { calls: Array<string>; port: HistoryPort } => {
  const calls: Array<string> = []
  return {
    calls,
    port: {
      push: path => calls.push(`push ${path}`),
      replace: path => calls.push(`replace ${path}`),
      back: () => calls.push('back'),
    },
  }
}

describe('makeUriSync.apply', () => {
  it('performs no moves when both models project the same stack', () => {
    const { calls, port } = recorder()
    const sync = makeUriSync(navigation, port)
    sync.apply(model(), model())
    expect(calls).toEqual([])
  })

  it('pushes once when the stack gains one presented entry', () => {
    const { calls, port } = recorder()
    const sync = makeUriSync(navigation, port)
    sync.apply(model(), model('d1'))
    expect(calls).toEqual(['push /home/detail/d1'])
  })

  it('goes back when the stack returns to its root', () => {
    const { calls, port } = recorder()
    const sync = makeUriSync(navigation, port)
    sync.apply(model('d1'), model())
    expect(calls).toEqual(['back'])
  })
})

describe('makeUriSync.open', () => {
  it('parses and writes the stack back canonically', () => {
    const sync = makeUriSync(navigation, recorder().port)
    const opened = sync.open('/home/detail/d1', model())
    expect(Option.isSome(opened)).toBe(true)
    if (Option.isSome(opened)) {
      const next = opened.value.model as AppModel
      expect(next.stack.presented._tag).toBe('PresentingEntries')
    }
  })

  it('rejects unparseable URIs', () => {
    const sync = makeUriSync(navigation, recorder().port)
    expect(Option.isNone(sync.open('/nowhere', model()))).toBe(true)
  })

  it('rejects non-canonical spellings', () => {
    // /home/detail/ is not a canonical route of this Program.
    expect(Option.isNone(sync_openNonCanonical())).toBe(true)
  })

  const sync_openNonCanonical = (): ReturnType<
    ReturnType<typeof makeUriSync>['open']
  > => makeUriSync(navigation, recorder().port).open('//home/', model())
})

describe('sameStack', () => {
  it('compares by value, not reference', () => {
    expect(sameStack(model().stack, model().stack)).toBe(true)
    expect(sameStack(model().stack, model('d1').stack)).toBe(false)
  })
})
