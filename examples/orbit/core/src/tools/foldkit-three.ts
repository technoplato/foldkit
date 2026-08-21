/**
 * FoldKit × Three.js — scored challenge (foldkit-three / three-vending)
 * Same core. 3JS host only renders. Degree if that holds.
 * Spec: no live wallets. Play credits or observed SOL Devnet payment.
 */

export type HostId = 'foldkit' | 'cli' | 'tui' | 'headless' | 'three'

export type Sku = {
  id: string
  pricePlay: number
}

export const FIRST_SKU: Sku = {
  id: 'clip-14.28',
  pricePlay: 1428,
}

export const KNOPHY_ASR = {
  heard: ['nofi', 'nofee', 'nophy', 'knophi'],
  means: 'Knophy',
  site: 'knophy.com',
  hosts: ['vending.knophy.com', 'store.knophy.com'],
  not: 'nofi.com',
} as const

export function acceptsHost(host: string): host is HostId {
  return (
    host === 'foldkit' ||
    host === 'cli' ||
    host === 'tui' ||
    host === 'headless' ||
    host === 'three'
  )
}

export function countersPass(s: {
  sameCore: boolean
  hosts: HostId[]
  counterCount: number
  threeRendersOnly: boolean
}): boolean {
  return (
    s.sameCore &&
    s.counterCount >= 2 &&
    s.hosts.includes('three') &&
    s.threeRendersOnly
  )
}

export function vendingPass(s: {
  sameCore: boolean
  threeRendersOnly: boolean
  keypad: boolean
  sku: boolean
  price: boolean
  firstSkuIsClip1428: boolean
  vendOnPaymentOrCode: boolean
}): boolean {
  return (
    s.sameCore &&
    s.threeRendersOnly &&
    s.keypad &&
    s.sku &&
    s.price &&
    s.firstSkuIsClip1428 &&
    s.vendOnPaymentOrCode
  )
}

export function degreeAwarded(s: {
  coreInFoldkit: boolean
  threeRendersOnly: boolean
  counters: boolean
  vending: boolean
}): boolean {
  return s.coreInFoldkit && s.threeRendersOnly && s.counters && s.vending
}
