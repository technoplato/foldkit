import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  type NativeCall,
  createNavigationAdapter,
  reactNavigationPlugin,
  reactRouterPlugin,
  tanstackRouterPlugin,
} from './plugin.js'
import {
  Dialog,
  Push as PushStyle,
  Sheet,
  type StackInstruction,
  pop,
  presented,
  push,
  replaceTop,
  setRoot,
} from './structure.js'

type Destination = Readonly<{ readonly path: string }>

const destination = (path: string): Destination => ({ path })

const print = (destination: Destination): string => destination.path

const detail = destination('/counters/counter-a1')
const fact = destination('/counters/counter-a1/fact')
const remove = destination('/counters/counter-a1/delete')

const recorder = (): { readonly calls: Array<NativeCall> } => ({
  calls: [],
})

const emitInto = (calls: Array<NativeCall>) => (call: NativeCall) => {
  calls.push(call)
}

const tagsOf = (calls: ReadonlyArray<NativeCall>): ReadonlyArray<string> =>
  calls.map(call => call._tag)

describe('tanstackRouterPlugin', () => {
  it('pushes plain entries and presents styled entries as paths', () => {
    const plugin = tanstackRouterPlugin<Destination>()
    expect(plugin.toNativeCalls(push(detail, PushStyle()), print)).toEqual([
      { _tag: 'PushPath', path: '/counters/counter-a1' },
    ])
    expect(plugin.toNativeCalls(push(fact, Sheet()), print)).toEqual([
      {
        _tag: 'PresentPath',
        path: '/counters/counter-a1/fact',
        style: Sheet(),
      },
    ])
    expect(plugin.toNativeCalls(pop(), print)).toEqual([{ _tag: 'Back' }])
    expect(
      plugin.toNativeCalls(setRoot(destination('/counters')), print),
    ).toEqual([{ _tag: 'ReplacePath', path: '/counters' }])
  })

  it('swaps a styled top entry as dismiss then present', () => {
    const plugin = tanstackRouterPlugin<Destination>()
    const instructions: ReadonlyArray<StackInstruction<Destination>> = [
      replaceTop(presented(remove, Dialog())),
    ]
    expect(plugin.toNativeCalls(instructions[0]!, print)).toEqual([
      { _tag: 'Dismiss' },
      {
        _tag: 'PresentPath',
        path: '/counters/counter-a1/delete',
        style: Dialog(),
      },
    ])
  })

  it('drives the full scenario through the adapter', () => {
    const recorded = recorder()
    const adapter = createNavigationAdapter(
      tanstackRouterPlugin<Destination>(),
      print,
      emitInto(recorded.calls),
    )
    adapter.apply([
      push(detail, PushStyle()),
      push(fact, Dialog()),
      replaceTop(presented(remove, Dialog())),
      pop(),
      pop(),
    ])
    expect(tagsOf(recorded.calls)).toEqual([
      'PushPath',
      'PresentPath',
      'Dismiss',
      'PresentPath',
      'Back',
      'Back',
    ])
  })

  it('reactRouterPlugin shares the web policy under its own id', () => {
    const plugin = reactRouterPlugin<Destination>()
    expect(plugin.id).toBe('react-router')
    expect(plugin.toNativeCalls(push(fact, Sheet()), print)).toEqual([
      {
        _tag: 'PresentPath',
        path: '/counters/counter-a1/fact',
        style: Sheet(),
      },
    ])
  })
})

describe('reactNavigationPlugin', () => {
  const parsePath = (
    path: string,
  ): Option.Option<{
    route: string
    params: Readonly<Record<string, string>>
    destination: Destination
  }> => {
    if (path === '/counters') {
      return Option.some({
        route: 'CounterList',
        params: {},
        destination: destination('/counters'),
      })
    }
    const segments = path.split('/').filter(segment => segment !== '')
    if (segments[0] !== 'counters') {
      return Option.none()
    }
    const counterId = segments[1]
    if (counterId === undefined) {
      return Option.none()
    }
    const kind = segments[2]
    if (kind === undefined) {
      return Option.some({
        route: 'CounterDetail',
        params: { counterId },
        destination: destination(path),
      })
    }
    if (kind === 'fact') {
      return Option.some({
        route: 'CounterFactAlert',
        params: { counterId },
        destination: destination(path),
      })
    }
    if (kind === 'delete') {
      return Option.some({
        route: 'DeleteCounterConfirmation',
        params: { counterId },
        destination: destination(path),
      })
    }
    return Option.none()
  }

  it('emits named pushes and styled presentations from printed paths', () => {
    const plugin = reactNavigationPlugin<Destination>({ parsePath })
    expect(plugin.toNativeCalls(push(detail, PushStyle()), print)).toEqual([
      {
        _tag: 'NamedPush',
        route: 'CounterDetail',
        params: { counterId: 'counter-a1' },
      },
    ])
    expect(plugin.toNativeCalls(push(fact, Sheet()), print)).toEqual([
      {
        _tag: 'NamedPresent',
        route: 'CounterFactAlert',
        params: { counterId: 'counter-a1' },
        presentation: 'modal',
      },
    ])
    expect(plugin.toNativeCalls(push(remove, Dialog()), print)).toEqual([
      {
        _tag: 'NamedPresent',
        route: 'DeleteCounterConfirmation',
        params: { counterId: 'counter-a1' },
        presentation: 'transparentModal',
      },
    ])
  })

  it('keeps back and dismiss platform-neutral', () => {
    const plugin = reactNavigationPlugin<Destination>({ parsePath })
    expect(plugin.toNativeCalls(pop(), print)).toEqual([{ _tag: 'Back' }])
  })
})
