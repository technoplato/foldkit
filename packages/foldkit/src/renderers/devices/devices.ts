import { Device } from '../device.js'
import type { DeviceShellNode, UiNode } from '../types.js'

export { Device }

/** Optional chrome copy. The shell does not own product buttons. */
export type DeviceChrome = Readonly<{
  readonly time?: string
  readonly title?: string
}>

/** Wraps a product tree in Device chrome. */
export const wrapDevice = (
  device: Device,
  product: UiNode,
  chrome: DeviceChrome = {},
): DeviceShellNode => ({
  _tag: 'DeviceShell',
  device,
  time: chrome.time ?? '9:41',
  ...(chrome.title === undefined ? {} : { title: chrome.title }),
  children: [product],
})

/** Watch chrome around a product tree. */
export const Watch = (
  product: UiNode,
  chrome: DeviceChrome = {},
): DeviceShellNode => wrapDevice('watch', product, chrome)

/** Phone chrome around a product tree. */
export const Phone = (
  product: UiNode,
  chrome: DeviceChrome = {},
): DeviceShellNode => wrapDevice('phone', product, chrome)

/** Tablet chrome around a product tree. */
export const Tablet = (
  product: UiNode,
  chrome: DeviceChrome = {},
): DeviceShellNode => wrapDevice('tablet', product, chrome)

/** Computer chrome around a product tree. */
export const Computer = (
  product: UiNode,
  chrome: DeviceChrome = {},
): DeviceShellNode => wrapDevice('computer', product, chrome)

/** TV chrome around a product tree. */
export const Tv = (
  product: UiNode,
  chrome: DeviceChrome = {},
): DeviceShellNode => wrapDevice('tv', product, chrome)
