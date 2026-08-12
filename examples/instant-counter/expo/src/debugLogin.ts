import { Array, Option } from 'effect'

import { multipleCountersV3DebugLoginLoopbackPort } from 'instant-counter-example/v3-client'

/** Inputs used to reach the headless Alice/Bob mint from a native Client. */
export type MultipleCountersV3NativeDebugLoginTarget = Readonly<{
  maybeMetroHost: Option.Option<string>
  platform: string
}>

/** Inputs used to build the native debug-login mint URL. */
export type MultipleCountersV3NativeDebugLoginUrlInput =
  MultipleCountersV3NativeDebugLoginTarget &
    Readonly<{
      originOverride: Option.Option<string>
      port?: number
    }>

const loopbackHosts: ReadonlyArray<string> = ['127.0.0.1', 'localhost']

const hostFromMetro = (metroHost: string): string => {
  const [hostAndPort] = metroHost.split('/')
  if (hostAndPort === undefined || hostAndPort.length === 0) {
    return '127.0.0.1'
  }
  const [host] = hostAndPort.split(':')
  if (host === undefined || host.length === 0) {
    return '127.0.0.1'
  }
  return host
}

/** Chooses the laptop host a native Processor can use to mint Alice or Bob. */
export const resolveMultipleCountersV3NativeDebugLoginHost = (
  input: MultipleCountersV3NativeDebugLoginTarget,
): string => {
  const host = Option.match(input.maybeMetroHost, {
    onNone: () => '127.0.0.1',
    onSome: hostFromMetro,
  })
  if (input.platform === 'android' && Array.contains(loopbackHosts, host)) {
    return '10.0.2.2'
  }
  if (host === 'localhost') {
    return '127.0.0.1'
  }
  return host
}

const originWithoutTrailingSlash = (origin: string): string => {
  if (origin.endsWith('/')) {
    return origin.slice(0, origin.length - 1)
  }
  return origin
}

/** Builds the headless mint URL for one native Instant Client. */
export const multipleCountersV3NativeDebugLoginUrl = (
  input: MultipleCountersV3NativeDebugLoginUrlInput,
): string => {
  if (Option.isSome(input.originOverride)) {
    return `${originWithoutTrailingSlash(input.originOverride.value)}/magic-code`
  }
  const host = resolveMultipleCountersV3NativeDebugLoginHost(input)
  const port = input.port ?? multipleCountersV3DebugLoginLoopbackPort
  return `http://${host}:${port.toString()}/magic-code`
}
