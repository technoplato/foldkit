import {
  type Model,
  type Navigation,
  CounterDetail,
  CounterFactAlert,
  CounterList,
  LoadingCounterFact,
} from 'counters-core-example'
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  type WebRouterPort,
  navInstructionsToStack,
  navigationBridgeFor,
  observeNavigation,
  reactRouterNavigationBridge,
  tanstackNavigationBridge,
} from './routerBridge.js'

// FIXTURES

const list: Navigation = CounterList.make({})

const detail = (counterId: string): Navigation =>
  CounterDetail.make({
    counterId,
    maybeMode: Option.none(),
    presentationId: 'detail-test',
  })

const detailWithFact = (counterId: string): Navigation =>
  CounterDetail.make({
    counterId,
    maybeMode: Option.some(
      CounterFactAlert.make({
        requestId: 'fact-test',
        status: LoadingCounterFact.make({}),
      }),
    ),
    presentationId: 'detail-test',
  })

/** Records every port call in order for assertion. */
const recorder = (): { calls: Array<string>; port: WebRouterPort } => {
  const calls: Array<string> = []
  return {
    calls,
    port: {
      pushPath: path => calls.push(`push ${path}`),
      back: () => calls.push('back'),
      presentPath: (path, style) => calls.push(`present ${path} ${style._tag}`),
      replacePath: path => calls.push(`replace ${path}`),
      dismiss: () => calls.push('dismiss'),
    },
  }
}

// LAWS

describe('navInstructionsToStack', () => {
  it('same state yields no instructions', () => {
    expect(navInstructionsToStack(list, list)).toEqual([])
    expect(navInstructionsToStack(detail('counter-c1'), detail('counter-c1'))).toEqual([])
  })

  it('list -> detail is a Push with the canonical detail path', () => {
    expect(navInstructionsToStack(list, detail('counter-c1'))).toEqual([
      {
        _tag: 'Push',
        destination: '/counters/counter-c1',
        style: { _tag: 'Push' },
      },
    ])
  })

  it('detail -> list pops after dismissing any presentation', () => {
    expect(navInstructionsToStack(detailWithFact('counter-c1'), list)).toEqual([
      { _tag: 'Pop' },
      { _tag: 'Pop' },
    ])
  })

  it('opening the fact alert presents a dialog over the detail', () => {
    const instructions = navInstructionsToStack(
      detail('counter-c1'),
      detailWithFact('counter-c1'),
    )
    expect(instructions).toEqual([
      {
        _tag: 'Push',
        destination: '/counters/counter-c1/fact',
        style: { _tag: 'Dialog' },
      },
    ])
  })
})

describe('plugin parity across web routers', () => {
  const transitions: ReadonlyArray<[Navigation, Navigation]> = [
    [list, detail('counter-c1')],
    [detail('counter-c1'), detailWithFact('counter-c1')],
    [detailWithFact('counter-c1'), detail('counter-c1')],
    [detail('counter-c1'), list],
    [list, detail('counter-c2')],
  ]

  it('tanstack and react-router produce identical call sequences', () => {
    for (const [before, next] of transitions) {
      const tanstack = recorder()
      const react = recorder()
      tanstackNavigationBridge(tanstack.port).apply(before, next)
      reactRouterNavigationBridge(react.port).apply(before, next)
      expect(tanstack.calls).toEqual(react.calls)
    }
  })

  it('performs every fed transition through the injected plugin policy', () => {
    const seen: Array<string> = []
    const spyPlugin = {
      id: 'spy',
      toNativeCalls: (
        instruction:
          | { readonly _tag: 'SetRoot'; readonly root: string }
          | {
              readonly _tag: 'Push'
              readonly destination: string
              readonly style: { readonly _tag: string }
            }
          | { readonly _tag: 'Pop' }
          | {
              readonly _tag: 'ReplaceTop'
              readonly entry: {
                readonly destination: string
                readonly style: { readonly _tag: string }
              }
            },
      ) => {
        seen.push(instruction._tag)
        return [{ _tag: 'Back' as const }]
      },
    }
    const { calls, port } = recorder()
    const bridge = navigationBridgeFor(spyPlugin, port)
    bridge.apply(list, detail('counter-c1'))
    expect(seen).toEqual(['Push'])
    expect(calls).toEqual(['back'])
  })

  it('navigationBridgeFor honors the injected plugin policy', () => {
    // Both bridges route through createNavigationAdapter; a custom plugin
    // must be able to observe every instruction.
    const seen: Array<string> = []
    const spyPlugin = {
      id: 'spy',
      toNativeCalls: (
        instruction:
          | { readonly _tag: 'SetRoot'; readonly root: string }
          | {
              readonly _tag: 'Push'
              readonly destination: string
              readonly style: { readonly _tag: string }
            }
          | { readonly _tag: 'Pop' }
          | {
              readonly _tag: 'ReplaceTop'
              readonly entry: {
                readonly destination: string
                readonly style: { readonly _tag: string }
              }
            },
      ) => {
        seen.push(instruction._tag)
        return [{ _tag: 'Back' as const }]
      },
    }
    const { calls, port } = recorder()
    const bridge = navigationBridgeFor(spyPlugin, port)
    bridge.apply(list, list) // first observation roots silently
    bridge.apply(list, detail('counter-c1'))
    expect(seen).toEqual(['Push'])
    expect(calls).toEqual(['back'])
  })
})

describe('observeNavigation', () => {
  it("seeds from readModel and feeds every later model's navigation", () => {
    const listeners: Array<(model: Model) => void> = []
    const navigationOf = (counterId: string | null): Navigation =>
      counterId === null ? list : detail(counterId)
    let current: Model = {
      navigation: navigationOf(null),
    } as unknown as Model
    const source = {
      readModel: (): Model => current,
      subscribe: (listener: (model: Model) => void): (() => void) => {
        listeners.push(listener)
        return () => undefined
      },
    }
    const { calls, port } = recorder()
    const stop = observeNavigation(source, tanstackNavigationBridge(port))
    // Seeded silently:
    expect(calls).toEqual([])
    current = { navigation: navigationOf('counter-c1') } as unknown as Model
    for (const listener of listeners) listener(current)
    expect(calls).toEqual(['push /counters/counter-c1'])
    current = { navigation: navigationOf(null) } as unknown as Model
    for (const listener of listeners) listener(current)
    expect(calls).toEqual([
      'push /counters/counter-c1',
      'back',
    ])
    stop()
  })
})
