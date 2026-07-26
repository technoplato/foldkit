import { Exit, Option, Schema as S } from 'effect'
import { describe, expect, it, vi } from 'vitest'

import { inbound, outbound } from './port.js'
import { makePortHandleBridge, makePortRuntime } from './runtime.js'

describe('PortHandleBridge', () => {
  it('buffers Schema-valid inbound values until engine handles bind', () => {
    const ports = {
      inbound: {
        changedStep: inbound(S.NumberFromString.check(S.isFinite())),
      },
    }
    const bridge = makePortHandleBridge(ports)
    const validExit = bridge.handles.changedStep.send('5')
    const invalidExit = bridge.handles.changedStep.send('nope')

    expect(Exit.isSuccess(validExit)).toBe(true)
    expect(Exit.isFailure(invalidExit)).toBe(true)

    const runtime = makePortRuntime(ports)
    const values: Array<unknown> = []
    const maybeChannel = runtime.channels.lookupInbound(
      ports.inbound.changedStep,
    )
    expect(Option.isSome(maybeChannel)).toBe(true)
    if (Option.isSome(maybeChannel)) {
      maybeChannel.value.attach(value => values.push(value))
    }

    bridge.bind(runtime.handles)

    expect(values).toStrictEqual([5])
  })

  it('relays outbound values to listeners registered before binding', async () => {
    const ports = {
      outbound: { changedCount: outbound(S.Number) },
    }
    const bridge = makePortHandleBridge(ports)
    const listener = vi.fn()
    bridge.handles.changedCount.subscribe(listener)

    const runtime = makePortRuntime(ports)
    bridge.bind(runtime.handles)
    const maybeDeliver = runtime.channels.lookupOutbound(
      ports.outbound.changedCount,
    )
    expect(Option.isSome(maybeDeliver)).toBe(true)
    if (Option.isSome(maybeDeliver)) {
      maybeDeliver.value(42)
    }
    await Promise.resolve()

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith(42)
  })

  it('unbinds from one runtime and flushes pending sends into the next', () => {
    const ports = { inbound: { changedStep: inbound(S.Number) } }
    const firstRuntime = makePortRuntime(ports)
    const bridge = makePortHandleBridge(ports)
    bridge.bind(firstRuntime.handles)
    bridge.unbind()

    expect(Exit.isSuccess(bridge.handles.changedStep.send(7))).toBe(true)

    const secondRuntime = makePortRuntime(ports)
    const values: Array<unknown> = []
    const maybeChannel = secondRuntime.channels.lookupInbound(
      ports.inbound.changedStep,
    )
    if (Option.isSome(maybeChannel)) {
      maybeChannel.value.attach(value => values.push(value))
    }
    bridge.bind(secondRuntime.handles)

    expect(values).toStrictEqual([7])
  })

  it('makes handles inert after disposal', () => {
    const ports = {
      inbound: { changedStep: inbound(S.Number) },
      outbound: { changedCount: outbound(S.Number) },
    }
    const bridge = makePortHandleBridge(ports)
    const listener = vi.fn()
    bridge.handles.changedCount.subscribe(listener)
    bridge.dispose()

    expect(Exit.isSuccess(bridge.handles.changedStep.send(3))).toBe(true)

    const runtime = makePortRuntime(ports)
    bridge.bind(runtime.handles)
    const maybeDeliver = runtime.channels.lookupOutbound(
      ports.outbound.changedCount,
    )
    if (Option.isSome(maybeDeliver)) {
      maybeDeliver.value(3)
    }

    expect(listener).not.toHaveBeenCalled()
  })
})
