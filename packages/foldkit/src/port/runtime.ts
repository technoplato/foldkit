import { Cause, Exit, Function, Option, Schema } from 'effect'

import {
  type Inbound,
  type Outbound,
  type Ports,
  type __PortChannels,
  __makeInboundChannel,
} from './port.js'

/** Host-side handle for one inbound Port. */
export type InboundPortHandle<Encoded> = Readonly<{
  send: (value: Encoded) => Exit.Exit<void, Schema.SchemaError>
}>

/** Host-side handle for one outbound Port. */
export type OutboundPortHandle<Encoded> = Readonly<{
  subscribe: (listener: (value: Encoded) => void) => () => void
}>

/** One inbound handle for every declared inbound Port. */
export type InboundPortHandles<InboundPorts> =
  InboundPorts extends Readonly<Record<string, Inbound<any, any>>>
    ? {
        readonly [Name in keyof InboundPorts]: InboundPorts[Name] extends Inbound<
          any,
          infer Encoded
        >
          ? InboundPortHandle<Encoded>
          : never
      }
    : Readonly<Record<never, never>>

/** One outbound handle for every declared outbound Port. */
export type OutboundPortHandles<OutboundPorts> =
  OutboundPorts extends Readonly<Record<string, Outbound<any, any>>>
    ? {
        readonly [Name in keyof OutboundPorts]: OutboundPorts[Name] extends Outbound<
          any,
          infer Encoded
        >
          ? OutboundPortHandle<Encoded>
          : never
      }
    : Readonly<Record<never, never>>

/** Typed host handles for a Program's declared Ports. */
export type PortHandles<P extends Ports | undefined> = P extends Ports
  ? InboundPortHandles<P['inbound']> & OutboundPortHandles<P['outbound']>
  : Readonly<Record<never, never>>

/** Engine-owned channels and handles for one Program runtime. */
export type PortRuntime<P extends Ports | undefined> = Readonly<{
  channels: __PortChannels
  handles: PortHandles<P>
  inboundName: (port: unknown) => Option.Option<string>
  shutdown: () => void
}>

/** @internal Renderer-facing Port handles with their generic shape erased. */
export type PortBindingHandles = Readonly<Record<string, unknown>>

/** @internal A host bridge that can bind to one scoped runtime. */
export type PortHandleBinding = Readonly<{
  bind: (handles: PortBindingHandles) => void
  unbind: () => void
}>

/**
 * A stable host-facing handle that can bind to a scoped Program runtime after
 * the host has already received its Ports API.
 *
 * The bridge never owns Port channels. It buffers Schema-valid inbound values
 * until a Program runtime binds its engine-owned handles, and relays outbound
 * values to listeners registered by the host.
 */
export type PortHandleBridge<P extends Ports | undefined> = Readonly<{
  handles: PortHandles<P>
  bind: (handles: PortBindingHandles) => void
  unbind: () => void
  dispose: () => void
}>

type UnknownInboundPortHandle = Readonly<{
  send: (value: unknown) => Exit.Exit<void, Schema.SchemaError>
}>

type UnknownOutboundPortHandle = Readonly<{
  subscribe: (listener: (value: unknown) => void) => () => void
}>

type UnknownPortHandles = Readonly<
  Record<string, UnknownInboundPortHandle | UnknownOutboundPortHandle>
>

const validatePorts = (ports: Ports): void => {
  const inboundEntries = Object.entries(ports.inbound ?? {})
  const outboundEntries = Object.entries(ports.outbound ?? {})
  const inboundNames = new Set(inboundEntries.map(([name]) => name))
  outboundEntries.forEach(([name]) => {
    if (inboundNames.has(name)) {
      throw new Error(
        `[foldkit] Port name "${name}" appears in both inbound and outbound. ` +
          'Port names share one namespace on the runtime handle, so each ' +
          'name must be unique across both records.',
      )
    }
  })

  const seenPorts = new Set<unknown>()
  const allEntries = [...inboundEntries, ...outboundEntries]
  allEntries.forEach(([name, port]) => {
    if (seenPorts.has(port)) {
      throw new Error(
        `[foldkit] The Port registered as "${name}" is also registered under ` +
          'another name. Each entry in the Ports record needs its own ' +
          'Port.inbound or Port.outbound value.',
      )
    }
    seenPorts.add(port)
  })
}

/** Creates one Program runtime's Port channels and typed host handles. */
export const makePortRuntime = <P extends Ports | undefined>(
  ports: P | undefined,
): PortRuntime<P> => {
  if (ports === undefined) {
    return {
      channels: {
        isConfigured: false,
        lookupInbound: () => Option.none(),
        lookupOutbound: () => Option.none(),
      },
      /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
      handles: {} as PortHandles<P>,
      inboundName: () => Option.none(),
      shutdown: Function.constVoid,
    }
  }

  validatePorts(ports)
  let isDisposed = false
  const inboundChannelsByPort = new Map<
    Inbound<any, any>,
    ReturnType<typeof __makeInboundChannel>
  >()
  const inboundNamesByPort = new Map<unknown, string>()
  const outboundPorts = new Set<Outbound<any, any>>()
  const listenersByPort = new Map<
    Outbound<any, any>,
    Set<(encodedValue: unknown) => void>
  >()
  const handles: Record<string, unknown> = {}

  Object.entries(ports.inbound ?? {}).forEach(([name, port]) => {
    const channel = __makeInboundChannel()
    inboundChannelsByPort.set(port, channel)
    inboundNamesByPort.set(port, name)
    handles[name] = {
      send: (value: unknown): Exit.Exit<void, Schema.SchemaError> => {
        if (isDisposed) {
          return Exit.void
        }
        const decodeExit = Schema.decodeUnknownExit(port.schema)(value)
        Exit.match(decodeExit, {
          onFailure: cause => {
            console.error(
              `[foldkit] Inbound port "${name}" rejected a value:`,
              Cause.squash(cause),
            )
          },
          onSuccess: decodedValue => channel.deliver(decodedValue),
        })
        return Exit.asVoid(decodeExit)
      },
    }
  })

  Object.entries(ports.outbound ?? {}).forEach(([name, port]) => {
    outboundPorts.add(port)
    handles[name] = {
      subscribe: (listener: (encodedValue: unknown) => void): (() => void) => {
        if (isDisposed) {
          return Function.constVoid
        }
        const listeners = listenersByPort.get(port) ?? new Set()
        listenersByPort.set(port, listeners)
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    }
  })

  const channels: __PortChannels = {
    isConfigured: true,
    lookupInbound: port =>
      Option.fromNullishOr(inboundChannelsByPort.get(port)),
    lookupOutbound: port =>
      outboundPorts.has(port)
        ? Option.some(encodedValue => {
            if (isDisposed) {
              return
            }
            queueMicrotask(() => {
              if (isDisposed) {
                return
              }
              const listeners = listenersByPort.get(port) ?? new Set()
              listeners.forEach(listener => {
                try {
                  listener(encodedValue)
                } catch (error) {
                  console.error(
                    '[foldkit] An outbound port listener threw:',
                    error,
                  )
                }
              })
            })
          })
        : Option.none(),
  }

  const shutdown = (): void => {
    isDisposed = true
    listenersByPort.forEach(listeners => listeners.clear())
    listenersByPort.clear()
  }

  return {
    channels,
    /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
    handles: handles as PortHandles<P>,
    inboundName: port => Option.fromNullishOr(inboundNamesByPort.get(port)),
    shutdown,
  }
}

/**
 * Creates stable host handles that bind to the engine-owned handles of one
 * scoped Program runtime.
 */
export const makePortHandleBridge = <P extends Ports | undefined>(
  ports: P,
): PortHandleBridge<P> => {
  if (ports === undefined) {
    return {
      /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
      handles: {} as PortHandles<P>,
      bind: Function.constVoid,
      unbind: Function.constVoid,
      dispose: Function.constVoid,
    }
  }

  validatePorts(ports)
  let isDisposed = false
  let maybeRuntimeHandles = Option.none<UnknownPortHandles>()
  const pendingInboundSends: Array<Readonly<{ name: string; value: unknown }>> =
    []
  const listenersByName = new Map<
    string,
    Set<(encodedValue: unknown) => void>
  >()
  const outboundUnsubscribers = new Map<string, () => void>()
  const handles: Record<string, unknown> = {}

  Object.entries(ports.inbound ?? {}).forEach(([name, port]) => {
    handles[name] = {
      send: (value: unknown): Exit.Exit<void, Schema.SchemaError> => {
        if (isDisposed) {
          return Exit.void
        }
        if (Option.isSome(maybeRuntimeHandles)) {
          const runtimeHandle = maybeRuntimeHandles.value[name]
          if (runtimeHandle !== undefined && 'send' in runtimeHandle) {
            return runtimeHandle.send(value)
          }
        }

        const decodeExit = Schema.decodeUnknownExit(port.schema)(value)
        Exit.match(decodeExit, {
          onFailure: cause => {
            console.error(
              `[foldkit] Inbound port "${name}" rejected a value:`,
              Cause.squash(cause),
            )
          },
          onSuccess: () => {
            pendingInboundSends.push({ name, value })
          },
        })
        return Exit.asVoid(decodeExit)
      },
    }
  })

  Object.entries(ports.outbound ?? {}).forEach(([name]) => {
    handles[name] = {
      subscribe: (listener: (encodedValue: unknown) => void): (() => void) => {
        if (isDisposed) {
          return Function.constVoid
        }
        const listeners = listenersByName.get(name) ?? new Set()
        listenersByName.set(name, listeners)
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    }
  })

  const unbind = (): void => {
    outboundUnsubscribers.forEach(unsubscribe => unsubscribe())
    outboundUnsubscribers.clear()
    maybeRuntimeHandles = Option.none()
  }

  const bind = (runtimeHandles: PortBindingHandles): void => {
    if (isDisposed) {
      return
    }
    unbind()
    /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
    const unknownRuntimeHandles = runtimeHandles as UnknownPortHandles
    maybeRuntimeHandles = Option.some(unknownRuntimeHandles)

    Object.entries(ports.outbound ?? {}).forEach(([name]) => {
      const runtimeHandle = unknownRuntimeHandles[name]
      if (runtimeHandle !== undefined && 'subscribe' in runtimeHandle) {
        outboundUnsubscribers.set(
          name,
          runtimeHandle.subscribe(encodedValue => {
            const listeners = listenersByName.get(name) ?? new Set()
            listeners.forEach(listener => {
              try {
                listener(encodedValue)
              } catch (error) {
                console.error(
                  '[foldkit] An outbound port listener threw:',
                  error,
                )
              }
            })
          }),
        )
      }
    })

    const pendingSends = pendingInboundSends.splice(0)
    pendingSends.forEach(({ name, value }) => {
      const runtimeHandle = unknownRuntimeHandles[name]
      if (runtimeHandle !== undefined && 'send' in runtimeHandle) {
        runtimeHandle.send(value)
      }
    })
  }

  const dispose = (): void => {
    if (isDisposed) {
      return
    }
    isDisposed = true
    unbind()
    pendingInboundSends.length = 0
    listenersByName.forEach(listeners => listeners.clear())
    listenersByName.clear()
  }

  return {
    /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
    handles: handles as PortHandles<P>,
    bind,
    unbind,
    dispose,
  }
}
