import { Array, Option, String } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  Counter,
  type Destination,
  type Model,
  SessionSettings,
  menu,
  menuEntry,
  model,
  navigation,
  sessionEntry,
} from '../test/apps/navigationCounter.js'
import {
  type BrowserWindow,
  browserHistoryDriver,
  windowUri,
} from './browserHistory.js'
import {
  type CarrierDiagnostic,
  type CarrierDriver,
  type CarrierPlan,
  type CarrierSnapshot,
  type CarrierSource,
  backOneEntry,
  carrierMove,
  classifyCarrierChange,
  launch,
  layersOf,
  openWhenReady,
  planOf,
  runCarrier,
} from './carrier.js'
import { type KeyedRoute, keyedStackDriver } from './keyedStack.js'
import {
  History,
  Launch,
  Link,
  type Message,
  NavigatedBack,
  OpenedUri,
  type UriVia,
} from './message.js'
import {
  Dialog,
  type NavigationStack,
  Push,
  stackAtRoot,
  stackWithEntries,
} from './structure.js'
import { applyMessage } from './transition.js'
import { canonicalUri, parseStack, printStack } from './uri.js'

// FIXTURES

const REPORT_TIMEOUT_MS = 5
const EXPECTATION_TIMEOUT_MS = 50

const atRoot = stackAtRoot<Destination>(Counter())
const atSession = stackWithEntries<Destination>(Counter(), [sessionEntry])
const atSessionMenu = (query: string) =>
  stackWithEntries<Destination>(Counter(), [sessionEntry, menuEntry(query)])
const atMenu = (query: string) =>
  stackWithEntries<Destination>(Counter(), [menuEntry(query)])

const planAt = (uri: string, current: Model = model()) =>
  Option.getOrThrow(planOf(navigation, current, parseStack(navigation, uri)))

const printed = (stack: NavigationStack<Destination>): string =>
  Option.getOrThrow(printStack(navigation, stack))

const snapshotOf = (
  keys: ReadonlyArray<string>,
  uri: string,
): CarrierSnapshot => ({ keys, uri, maybePosition: Option.none() })

const settle = async (ms = 0): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms)
}

// PROGRAM

type FakeProgram = Readonly<{
  source: CarrierSource<Destination>
  facts: Array<Message>
  stack: () => NavigationStack<Destination>
  move: (stack: NavigationStack<Destination>) => void
  follow: (isFollowing: boolean) => void
  setReady: (isReady: boolean) => void
  refuseBack: () => void
  ignoreLaunch: () => void
}>

const makeProgram = (
  initial: NavigationStack<Destination> = atRoot,
): FakeProgram => {
  let current = model({ navigation: initial })
  let isReady = true
  let isRefusingBack = false
  let isIgnoringLaunch = false
  const facts: Array<Message> = []
  const listeners = new Set<() => void>()
  const notify = (): void => {
    listeners.forEach(listener => listener())
  }
  const isIgnored = (message: Message): boolean =>
    (message._tag === 'NavigatedBack' && isRefusingBack) ||
    (message._tag === 'OpenedUri' &&
      message.via._tag === 'Launch' &&
      isIgnoringLaunch)
  const dispatch = (message: Message): boolean => {
    if (!isReady) {
      return false
    }
    facts.push(message)
    if (!isIgnored(message)) {
      current = {
        ...current,
        navigation: applyMessage(
          navigation,
          current,
          current.navigation,
          message,
        ),
      }
      notify()
    }
    return true
  }
  return {
    source: {
      navigation: () =>
        isReady
          ? planOf(navigation, current, current.navigation)
          : Option.none(),
      canonicalUri: uri => canonicalUri(navigation, uri),
      openUri: (uri: string, via: UriVia) => dispatch(OpenedUri({ uri, via })),
      navigateBack: (uri: string) => dispatch(NavigatedBack({ uri })),
      subscribe: listener => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
    facts,
    stack: () => current.navigation,
    move: stack => {
      current = { ...current, navigation: stack }
      notify()
    },
    follow: isFollowing => {
      current = { ...current, isFollowing }
      notify()
    },
    setReady: nextIsReady => {
      isReady = nextIsReady
      notify()
    },
    refuseBack: () => {
      isRefusingBack = true
    },
    ignoreLaunch: () => {
      isIgnoringLaunch = true
    },
  }
}

// BROWSER

type HistoryEntry = Readonly<{ uri: string; state: unknown }>

type FakeBrowser = Readonly<{
  window: BrowserWindow
  uri: () => string
  uris: () => ReadonlyArray<string>
  index: () => number
  go: (delta: number) => void
}>

const makeBrowser = (launchUri: string): FakeBrowser => {
  let entries: Array.NonEmptyReadonlyArray<HistoryEntry> = [
    { uri: launchUri, state: null },
  ]
  let index = 0
  const listeners = new Set<() => void>()
  const current = (): HistoryEntry =>
    Option.getOrThrow(Array.get(entries, index))
  const pathname = (): string =>
    Option.match(String.indexOf('?')(current().uri), {
      onNone: () => current().uri,
      onSome: queryIndex => current().uri.slice(0, queryIndex),
    })
  const search = (): string =>
    Option.match(String.indexOf('?')(current().uri), {
      onNone: () => '',
      onSome: queryIndex => current().uri.slice(queryIndex),
    })
  const go = (delta: number): void => {
    setTimeout(() => {
      const nextIndex = Math.max(0, Math.min(entries.length - 1, index + delta))
      if (nextIndex !== index) {
        index = nextIndex
        listeners.forEach(listener => listener())
      }
    }, 0)
  }
  const window: BrowserWindow = {
    location: {
      get pathname() {
        return pathname()
      },
      get search() {
        return search()
      },
    },
    history: {
      get state() {
        return current().state
      },
      pushState: (state, _unused, uri) => {
        entries = Array.append(Array.take(entries, index + 1), { uri, state })
        index += 1
      },
      replaceState: (state, _unused, uri) => {
        entries = Array.map(entries, (entry, entryIndex) =>
          entryIndex === index ? { uri, state } : entry,
        )
      },
      go,
    },
    addEventListener: (_type, listener) => {
      listeners.add(listener)
    },
    removeEventListener: (_type, listener) => {
      listeners.delete(listener)
    },
  }
  return {
    window,
    uri: () => current().uri,
    uris: () => Array.map(entries, entry => entry.uri),
    index: () => index,
    go,
  }
}

const runOnBrowser = (
  program: FakeProgram,
  browser: FakeBrowser,
  onDiagnostic: (diagnostic: CarrierDiagnostic) => void = () => {},
) =>
  runCarrier(
    program.source,
    browserHistoryDriver<Destination>(browser.window),
    {
      launchUri: Option.some(windowUri(browser.window)),
      reportTimeoutMs: REPORT_TIMEOUT_MS,
      expectationTimeoutMs: EXPECTATION_TIMEOUT_MS,
      onDiagnostic,
    },
  )

// NATIVE

type FakeNativeStack = Readonly<{
  keys: () => ReadonlyArray<string>
  resets: () => number
  userPop: () => void
  driver: CarrierDriver<Destination>
}>

const makeNativeStack = (
  initial: Array.NonEmptyReadonlyArray<KeyedRoute>,
): FakeNativeStack => {
  let routes = initial
  let resetCount = 0
  const listeners = new Set<() => void>()
  const emitSoon = (): void => {
    setTimeout(() => listeners.forEach(listener => listener()), 0)
  }
  return {
    keys: () => Array.map(routes, route => route.key),
    resets: () => resetCount,
    userPop: () => {
      routes = Array.match(Array.initNonEmpty(routes), {
        onEmpty: () => routes,
        onNonEmpty: beneath => beneath,
      })
      emitSoon()
    },
    driver: keyedStackDriver<Destination>({
      routes: () => routes,
      reset: next => {
        routes = next
        resetCount += 1
        emitSoon()
      },
      subscribe: listener => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    }),
  }
}

const runOnNative = (program: FakeProgram, native: FakeNativeStack) =>
  runCarrier(program.source, native.driver, {
    reportTimeoutMs: REPORT_TIMEOUT_MS,
    expectationTimeoutMs: EXPECTATION_TIMEOUT_MS,
  })

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// PLAN

describe('planOf', () => {
  it('lists every entry root first, keyed by its path, styled by its declaration', () => {
    const current = model({ navigation: atSessionMenu('re') })
    expect(planOf(navigation, current, current.navigation)).toEqual(
      Option.some({
        entries: [
          {
            key: '/counter',
            uri: '/counter',
            destination: Counter(),
            maybeStyle: Option.none(),
            maybeTitle: Option.some('Counter'),
          },
          {
            key: '/counter/session',
            uri: '/counter/session',
            destination: SessionSettings(),
            maybeStyle: Option.some(Push()),
            maybeTitle: Option.some('Session'),
          },
          {
            key: '/counter/session/menu',
            uri: '/counter/session/menu?q=re',
            destination: menu('re'),
            maybeStyle: Option.some(Dialog()),
            maybeTitle: Option.some('Actions'),
          },
        ],
        uri: '/counter/session/menu?q=re',
        history: 'Record',
      }),
    )
  })

  it('replaces instead of recording while following someone', () => {
    expect(planAt('/counter', model({ isFollowing: true })).history).toBe(
      'Replace',
    )
  })
})

describe('layersOf', () => {
  it('paints the deepest pushed entry with every presented entry over it', () => {
    const { base, overlays } = layersOf(planAt('/counter/session/menu'))
    expect(base.key).toBe('/counter/session')
    expect(overlays.map(entry => entry.key)).toEqual(['/counter/session/menu'])
  })

  it('paints the root alone when nothing is presented', () => {
    const { base, overlays } = layersOf(planAt('/counter'))
    expect(base.key).toBe('/counter')
    expect(overlays).toEqual([])
  })
})

// MOVE

describe('carrierMove', () => {
  it.each<[string, string, CarrierSnapshot, string]>([
    [
      'same keys and URI',
      'Unchanged',
      snapshotOf(['/counter'], '/counter'),
      '/counter',
    ],
    [
      'same keys with a new query',
      'Reconfigure',
      snapshotOf(['/counter', '/counter/menu'], '/counter/menu?q=r'),
      '/counter/menu?q=re',
    ],
    [
      'a deeper plan',
      'Push',
      snapshotOf(['/counter'], '/counter'),
      '/counter/session/menu',
    ],
    [
      'a shallower plan',
      'Pop',
      snapshotOf(['/counter', '/counter/session'], '/counter/session'),
      '/counter',
    ],
    [
      'a swapped top',
      'Replace',
      snapshotOf(['/counter', '/counter/session'], '/counter/session'),
      '/counter/menu',
    ],
    [
      'a fresh entry',
      'Reset',
      snapshotOf([], '/counter/session'),
      '/counter/session',
    ],
    [
      'another root',
      'Reset',
      snapshotOf(['/elsewhere'], '/elsewhere'),
      '/counter',
    ],
  ])('%s is %s', (_label, expected, snapshot, uri) => {
    expect(carrierMove(snapshot, planAt(uri))._tag).toBe(expected)
  })

  it('pushes only the entries above the shared prefix', () => {
    expect(
      carrierMove(
        snapshotOf(['/counter'], '/counter'),
        planAt('/counter/session/menu'),
      ),
    ).toMatchObject({
      _tag: 'Push',
      entries: [{ key: '/counter/session' }, { key: '/counter/session/menu' }],
    })
  })
})

describe('classifyCarrierChange', () => {
  it('is no fact when the carrier shows the plan', () => {
    expect(
      classifyCarrierChange(
        snapshotOf(['/counter'], '/counter'),
        planAt('/counter'),
        History(),
      ),
    ).toEqual(Option.none())
  })

  it('is NavigatedBack naming the entry when the carrier shows a strict prefix', () => {
    expect(
      classifyCarrierChange(
        snapshotOf(['/counter'], '/counter'),
        planAt('/counter/session/menu'),
        History(),
      ),
    ).toEqual(Option.some(NavigatedBack({ uri: '/counter' })))
  })

  it('is OpenedUri for anything else, carrying how it arrived', () => {
    expect(
      classifyCarrierChange(
        snapshotOf([], '/counter/session'),
        planAt('/counter'),
        Link(),
      ),
    ).toEqual(Option.some(OpenedUri({ uri: '/counter/session', via: Link() })))
  })
})

describe('openWhenReady', () => {
  it('waits for Ready, then sends the URI once', () => {
    const program = makeProgram()
    program.setReady(false)
    openWhenReady(program.source, '/counter/session', Link())
    expect(program.facts).toEqual([])
    program.setReady(true)
    program.move(atRoot)
    expect(program.facts).toEqual([
      OpenedUri({ uri: '/counter/session', via: Link() }),
    ])
  })

  it('launches through the launch rule and drops a URI stopped while waiting', () => {
    const program = makeProgram()
    expect(openWhenReady(program.source, '/counter/', Launch())).toBeDefined()
    expect(program.facts).toEqual([])
    program.setReady(false)
    const stop = openWhenReady(program.source, '/counter/session', Launch())
    stop()
    program.setReady(true)
    expect(program.facts).toEqual([])
  })
})

describe('launch and backOneEntry', () => {
  it('opens a launch URI only when the plan does not already show it', () => {
    const program = makeProgram()
    expect(launch(program.source, '/counter/')).toBe(false)
    expect(launch(program.source, '/counter/session')).toBe(true)
    expect(program.facts).toEqual([
      OpenedUri({ uri: '/counter/session', via: Launch() }),
    ])
  })

  it('goes back to the entry beneath the top, and not past the root', () => {
    const program = makeProgram(atSessionMenu(''))
    expect(backOneEntry(program.source)).toBe(true)
    expect(printed(program.stack())).toBe('/counter/session')
    expect(backOneEntry(program.source)).toBe(true)
    expect(backOneEntry(program.source)).toBe(false)
    expect(printed(program.stack())).toBe('/counter')
  })
})

// BROWSER CARRIER

describe('runCarrier on browser history', () => {
  it('adopts a launch at the Program URI without a fact and records each push', async () => {
    const program = makeProgram()
    const browser = makeBrowser('/counter')
    runOnBrowser(program, browser)
    program.move(atSession)
    program.move(atSessionMenu(''))
    program.move(atSessionMenu('r'))
    await settle()
    expect(browser.uris()).toEqual([
      '/counter',
      '/counter/session',
      '/counter/session/menu?q=r',
    ])
    expect(program.facts).toEqual([])
  })

  it('reports browser Back as NavigatedBack naming the entry returned to', async () => {
    const program = makeProgram()
    const browser = makeBrowser('/counter')
    runOnBrowser(program, browser)
    program.move(atSessionMenu('r'))
    browser.go(-1)
    await settle()
    expect(program.facts).toEqual([NavigatedBack({ uri: '/counter/session' })])
    expect(printed(program.stack())).toBe('/counter/session')
  })

  it('walks back through real entries when the Program pops', async () => {
    const program = makeProgram()
    const browser = makeBrowser('/counter')
    runOnBrowser(program, browser)
    program.move(atSession)
    program.move(atRoot)
    await settle()
    expect(browser.index()).toBe(0)
    expect(browser.uris()).toEqual(['/counter', '/counter/session'])
    expect(program.facts).toEqual([])
  })

  it('applies a remote move that lands during our own Back once the Back arrives', async () => {
    const program = makeProgram()
    const browser = makeBrowser('/counter')
    runOnBrowser(program, browser)
    program.move(atSession)
    program.move(atRoot)
    program.move(atMenu(''))
    await settle()
    expect(browser.uri()).toBe('/counter/menu')
    expect(printed(program.stack())).toBe('/counter/menu')
    expect(program.facts).toEqual([])
  })

  it('seeds a cold deep link that arrives while Starting, so Back reaches the root', async () => {
    const program = makeProgram()
    program.setReady(false)
    const browser = makeBrowser('/counter/session')
    runOnBrowser(program, browser)
    program.setReady(true)
    await settle()
    expect(browser.uris()).toEqual(['/counter', '/counter/session'])
    browser.go(-1)
    await settle()
    expect(printed(program.stack())).toBe('/counter')
  })

  it('rewrites a non-canonical launch to its canonical spelling', async () => {
    const program = makeProgram()
    const browser = makeBrowser('/counter/menu?q=re&utm_source=mail')
    runOnBrowser(program, browser)
    await settle()
    expect(browser.uri()).toBe('/counter/menu?q=re')
    expect(printed(program.stack())).toBe('/counter/menu?q=re')
  })

  it('keeps an unknown path and lets Back reach the root', async () => {
    const program = makeProgram()
    const browser = makeBrowser('/counter/bogus/deeper')
    runOnBrowser(program, browser)
    await settle()
    expect(browser.uri()).toBe('/counter/bogus/deeper')
    browser.go(-1)
    await settle()
    expect(printed(program.stack())).toBe('/counter')
  })

  it('corrects the browser after the Program refuses a Back', async () => {
    const program = makeProgram()
    const browser = makeBrowser('/counter')
    runOnBrowser(program, browser)
    program.move(atSession)
    program.refuseBack()
    browser.go(-1)
    await settle(REPORT_TIMEOUT_MS)
    expect(browser.uri()).toBe('/counter/session')
    expect(printed(program.stack())).toBe('/counter/session')
  })

  it('keeps correcting a Program that refuses Back again and again', async () => {
    const program = makeProgram()
    const browser = makeBrowser('/counter')
    runOnBrowser(program, browser)
    program.move(atSession)
    program.refuseBack()
    await settle()
    for (const _attempt of [1, 2, 3, 4]) {
      browser.go(-1)
      await settle(REPORT_TIMEOUT_MS)
      await settle()
    }
    expect(browser.uri()).toBe('/counter/session')
  })

  it('lands two quick Backs from three deep at the root', async () => {
    const program = makeProgram()
    const browser = makeBrowser('/counter')
    runOnBrowser(program, browser)
    program.move(atSessionMenu(''))
    browser.go(-1)
    browser.go(-1)
    await settle()
    expect(printed(program.stack())).toBe('/counter')
  })

  it('reports Forward into a recorded entry as OpenedUri via History', async () => {
    const program = makeProgram()
    const browser = makeBrowser('/counter')
    runOnBrowser(program, browser)
    program.move(atSession)
    program.move(atRoot)
    await settle()
    browser.go(1)
    await settle()
    expect(program.facts).toEqual([
      OpenedUri({ uri: '/counter/session', via: History() }),
    ])
    expect(printed(program.stack())).toBe('/counter/session')
  })

  it('replaces instead of recording while following someone', async () => {
    const program = makeProgram()
    const browser = makeBrowser('/counter')
    runOnBrowser(program, browser)
    program.follow(true)
    program.move(atSession)
    program.move(atSessionMenu(''))
    await settle()
    expect(browser.uris()).toEqual(['/counter/session/menu'])
  })

  it('shows the shared stack when the Program ignores the launch', async () => {
    const program = makeProgram(atSession)
    program.ignoreLaunch()
    const browser = makeBrowser('/counter/menu')
    runOnBrowser(program, browser)
    await settle(REPORT_TIMEOUT_MS)
    expect(program.facts).toEqual([
      OpenedUri({ uri: '/counter/menu', via: Launch() }),
    ])
    expect(browser.uris()).toEqual(['/counter', '/counter/session'])
  })

  it('stops writing and reporting once stopped', async () => {
    const program = makeProgram()
    const browser = makeBrowser('/counter')
    const stop = runOnBrowser(program, browser)
    stop()
    program.move(atSession)
    browser.go(-1)
    await settle()
    expect(browser.uris()).toEqual(['/counter'])
    expect(program.facts).toEqual([])
  })
})

describe('runCarrier diagnostics', () => {
  const stuckDriver = (
    perform: CarrierDriver<Destination>['perform'],
  ): CarrierDriver<Destination> => ({
    name: 'stuck',
    read: () => snapshotOf(['/counter'], '/counter'),
    perform,
    subscribe: () => () => {},
  })

  it('gives up after three writes toward one plan that never take', () => {
    const program = makeProgram(atSession)
    const diagnostics: Array<CarrierDiagnostic> = []
    const perform = vi.fn(() => Option.none())
    runCarrier(program.source, stuckDriver(perform), {
      onDiagnostic: diagnostic => diagnostics.push(diagnostic),
    })
    expect(perform).toHaveBeenCalledTimes(3)
    expect(diagnostics).toEqual([
      { _tag: 'GaveUpCorrecting', uri: '/counter/session' },
    ])
  })

  it('reports an expectation that never arrives and tries again', async () => {
    const program = makeProgram(atSession)
    const diagnostics: Array<CarrierDiagnostic> = []
    const perform = vi.fn((_move, plan: CarrierPlan<Destination>) =>
      Option.some({
        label: `write ${plan.uri}`,
        isMetBy: () => false,
      }),
    )
    runCarrier(program.source, stuckDriver(perform), {
      expectationTimeoutMs: EXPECTATION_TIMEOUT_MS,
      onDiagnostic: diagnostic => diagnostics.push(diagnostic),
    })
    await settle(EXPECTATION_TIMEOUT_MS)
    expect(diagnostics).toEqual([
      { _tag: 'ExpectationExpired', label: 'write /counter/session' },
    ])
    expect(perform).toHaveBeenCalledTimes(2)
  })
})

// NATIVE CARRIER

describe('runCarrier on a keyed native stack', () => {
  const rootRoute: KeyedRoute = { key: '/counter', uri: '/counter' }

  it('leaves a stack that already shows the plan alone, then resets once per move', async () => {
    const program = makeProgram()
    const native = makeNativeStack([rootRoute])
    runOnNative(program, native)
    await settle()
    expect(native.resets()).toBe(0)
    program.move(atSession)
    await settle()
    expect(native.keys()).toEqual(['/counter', '/counter/session'])
    expect(native.resets()).toBe(1)
  })

  it('reports a swipe back as NavigatedBack', async () => {
    const program = makeProgram()
    const native = makeNativeStack([rootRoute])
    runOnNative(program, native)
    program.move(atSession)
    await settle()
    native.userPop()
    await settle()
    expect(program.facts).toEqual([NavigatedBack({ uri: '/counter' })])
    expect(printed(program.stack())).toBe('/counter')
  })

  it('reports a swipe made before our reset landed against the newest plan', async () => {
    const program = makeProgram()
    const native = makeNativeStack([rootRoute])
    runOnNative(program, native)
    program.move(atSession)
    await settle()
    program.move(atSessionMenu(''))
    native.userPop()
    await settle()
    expect(printed(program.stack())).toBe('/counter/session')
    expect(native.keys()).toEqual(['/counter', '/counter/session'])
  })

  it('undoes a swipe the Program refuses', async () => {
    const program = makeProgram()
    const native = makeNativeStack([rootRoute])
    runOnNative(program, native)
    program.move(atSessionMenu('x'))
    await settle()
    program.refuseBack()
    native.userPop()
    await settle(REPORT_TIMEOUT_MS)
    await settle()
    expect(native.keys()).toEqual([
      '/counter',
      '/counter/session',
      '/counter/session/menu',
    ])
  })
})
