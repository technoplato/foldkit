import { Array, Match as M, Option, Schema as S } from 'effect'
import {
  PortfolioSnapshot,
  ReceivingInstruction,
  WalletAccount,
  isPortfolioSnapshotConsistent,
} from 'wallet-core-example'

import { Byte, Charset, Encoder } from '@nuintun/qrcode'

const qrModuleSize = 6
const qrQuietZoneModules = 4
const maximumCarrierCharacters = 1_024
const maximumCachedReceivingQrArtifacts = 16
const printableAsciiPattern = /^[\x21-\x7e]+$/u
const numericChainReferencePattern = /^[0-9]+$/u
const encoder = new Encoder({ level: 'H' })

const EncodedReceivingQrArtifact = S.Struct({
  dataUrl: S.String,
  modules: S.Array(S.Array(S.Boolean)),
})
type EncodedReceivingQrArtifact = typeof EncodedReceivingQrArtifact.Type
const encodedReceivingQrArtifacts = new Map<
  string,
  EncodedReceivingQrArtifact
>()

/** The Wallet is running directly in a fresh host-owned navigation context. */
export const FreshWalletHostOrigin = S.TaggedStruct('FreshWalletHostOrigin', {})
/** The Wallet is running directly in a fresh host-owned navigation context. */
export type FreshWalletHostOrigin = typeof FreshWalletHostOrigin.Type

/** The Wallet was reconstructed from a portable state or replay route. */
export const PortableWalletRouteOrigin = S.TaggedStruct(
  'PortableWalletRouteOrigin',
  {},
)
/** The Wallet was reconstructed from a portable state or replay route. */
export type PortableWalletRouteOrigin = typeof PortableWalletRouteOrigin.Type

/** The finite source of the currently rendered Wallet navigation state. */
export const ReceivingQrHostOrigin = S.Union([
  FreshWalletHostOrigin,
  PortableWalletRouteOrigin,
])
/** The finite source of the currently rendered Wallet navigation state. */
export type ReceivingQrHostOrigin = typeof ReceivingQrHostOrigin.Type

/** A live Wallet occurrence that may present a scannable receiving address. */
export const LiveWalletRuntimeMode = S.TaggedStruct('LiveWalletRuntimeMode', {})
/** A live Wallet occurrence that may present a scannable receiving address. */
export type LiveWalletRuntimeMode = typeof LiveWalletRuntimeMode.Type

/** A Wallet occurrence inspecting recorded state without live custody. */
export const InspectingWalletRuntimeMode = S.TaggedStruct(
  'InspectingWalletRuntimeMode',
  {},
)
/** A Wallet occurrence inspecting recorded state without live custody. */
export type InspectingWalletRuntimeMode =
  typeof InspectingWalletRuntimeMode.Type

/** The finite execution mode relevant to receiving-address presentation. */
export const ReceivingQrRuntimeMode = S.Union([
  LiveWalletRuntimeMode,
  InspectingWalletRuntimeMode,
])
/** The finite execution mode relevant to receiving-address presentation. */
export type ReceivingQrRuntimeMode = typeof ReceivingQrRuntimeMode.Type

/** A reusable marker for a directly opened Wallet host. */
export const freshWalletHostOrigin = FreshWalletHostOrigin.make({})

/** A reusable marker for a Wallet reconstructed from a portable route. */
export const portableWalletRouteOrigin = PortableWalletRouteOrigin.make({})

/** A reusable marker for a live Wallet occurrence. */
export const liveWalletRuntimeMode = LiveWalletRuntimeMode.make({})

/** A reusable marker for a replay or state-inspection occurrence. */
export const inspectingWalletRuntimeMode = InspectingWalletRuntimeMode.make({})

/** Every public value required to project one receiving instruction as a QR. */
export const ReceivingQrProjectionInput = S.Struct({
  hostOrigin: ReceivingQrHostOrigin,
  runtimeMode: ReceivingQrRuntimeMode,
  portfolio: PortfolioSnapshot,
  account: WalletAccount,
  instruction: ReceivingInstruction,
})
/** Every public value required to project one receiving instruction as a QR. */
export type ReceivingQrProjectionInput = typeof ReceivingQrProjectionInput.Type

/** The exhaustive reason a receiving QR was withheld. */
export const ReceivingQrUnavailableReason = S.Literals([
  'PortableRoute',
  'ReplayInspection',
  'FixturePortfolio',
  'InconsistentInstruction',
  'InvalidCarrier',
  'EncodingFailed',
])
/** The exhaustive reason a receiving QR was withheld. */
export type ReceivingQrUnavailableReason =
  typeof ReceivingQrUnavailableReason.Type

/** A validated QR projection safe for visual and text renderers. */
export const AvailableReceivingQr = S.TaggedStruct('AvailableReceivingQr', {
  payload: S.String,
  dataUrl: S.String,
  modules: S.Array(S.Array(S.Boolean)),
})
/** A validated QR projection safe for visual and text renderers. */
export type AvailableReceivingQr = typeof AvailableReceivingQr.Type

/** A fail-closed QR projection carrying one renderer-neutral reason. */
export const UnavailableReceivingQr = S.TaggedStruct('UnavailableReceivingQr', {
  reason: ReceivingQrUnavailableReason,
})
/** A fail-closed QR projection carrying one renderer-neutral reason. */
export type UnavailableReceivingQr = typeof UnavailableReceivingQr.Type

/** The complete renderer-neutral receiving QR projection. */
export const ReceivingQrProjection = S.Union([
  AvailableReceivingQr,
  UnavailableReceivingQr,
])
/** The complete renderer-neutral receiving QR projection. */
export type ReceivingQrProjection = typeof ReceivingQrProjection.Type

const hasSameMemo = (
  first: Option.Option<string>,
  second: Option.Option<string>,
): boolean => {
  if (Option.isNone(first)) {
    return Option.isNone(second)
  }
  return Option.isSome(second) && first.value === second.value
}

const isExactAccountMember = (
  portfolio: PortfolioSnapshot,
  account: WalletAccount,
): boolean =>
  Array.some(
    portfolio.accounts,
    candidate =>
      candidate.accountId === account.accountId &&
      candidate.chainId === account.chainId &&
      candidate.networkId === account.networkId &&
      candidate.address === account.address &&
      candidate.displayName === account.displayName,
  )

const isExactInstructionMember = (
  portfolio: PortfolioSnapshot,
  instruction: ReceivingInstruction,
): boolean =>
  Array.some(
    portfolio.receivingInstructions,
    candidate =>
      candidate.accountId === instruction.accountId &&
      candidate.assetId === instruction.assetId &&
      candidate.destinationAddress === instruction.destinationAddress &&
      hasSameMemo(candidate.maybeMemo, instruction.maybeMemo) &&
      candidate.portableUri === instruction.portableUri,
  )

const isInstructionConsistent = (
  portfolio: PortfolioSnapshot,
  account: WalletAccount,
  instruction: ReceivingInstruction,
): boolean => {
  if (
    !isPortfolioSnapshotConsistent(portfolio) ||
    !isExactAccountMember(portfolio, account) ||
    !isExactInstructionMember(portfolio, instruction) ||
    instruction.accountId !== account.accountId ||
    instruction.destinationAddress !== account.address
  ) {
    return false
  }
  const maybeAsset = Array.findFirst(
    portfolio.assets,
    asset => asset.assetId === instruction.assetId,
  )
  const maybeNetwork = Array.findFirst(
    portfolio.networks,
    network => network.networkId === account.networkId,
  )
  const maybeChain = Array.findFirst(
    portfolio.chains,
    chain => chain.chainId === account.chainId,
  )
  if (
    Option.isNone(maybeAsset) ||
    Option.isNone(maybeNetwork) ||
    Option.isNone(maybeChain)
  ) {
    return false
  }
  return (
    maybeAsset.value.networkId === account.networkId &&
    maybeNetwork.value.chainId === account.chainId
  )
}

const isExactAddressComponent = (
  carrier: URL,
  destinationAddress: string,
): boolean => {
  const isExactComponent = (component: string): boolean => {
    if (component === destinationAddress) {
      return true
    }
    try {
      return decodeURIComponent(component) === destinationAddress
    } catch {
      return false
    }
  }
  const isExactEip681Component = (component: string): boolean => {
    const addressPrefix = `${destinationAddress}@`
    if (component.startsWith(addressPrefix)) {
      return numericChainReferencePattern.test(
        component.slice(addressPrefix.length),
      )
    }
    try {
      const decodedComponent = decodeURIComponent(component)
      return (
        decodedComponent.startsWith(addressPrefix) &&
        numericChainReferencePattern.test(
          decodedComponent.slice(addressPrefix.length),
        )
      )
    } catch {
      return false
    }
  }
  return (
    isExactComponent(carrier.pathname) ||
    isExactEip681Component(carrier.pathname) ||
    isExactComponent(carrier.host) ||
    isExactComponent(carrier.hash.slice(1)) ||
    Array.some(
      Array.fromIterable(carrier.searchParams.values()),
      value => value === destinationAddress,
    )
  )
}

const isValidCarrier = (
  portableUri: string,
  chainId: string,
  destinationAddress: string,
): boolean => {
  if (
    portableUri.startsWith('/wallet/receive') ||
    portableUri.length === 0 ||
    portableUri.length > maximumCarrierCharacters ||
    !printableAsciiPattern.test(portableUri)
  ) {
    return false
  }
  try {
    const carrier = new URL(portableUri)
    return (
      carrier.href === portableUri &&
      carrier.protocol === `${chainId}:` &&
      isExactAddressComponent(carrier, destinationAddress)
    )
  } catch {
    return false
  }
}

const modulesFromEncodedQr = (
  encoded: ReturnType<Encoder['encode']>,
): ReadonlyArray<ReadonlyArray<boolean>> =>
  Array.makeBy(encoded.size, y =>
    Array.makeBy(encoded.size, x => encoded.get(x, y) === 1),
  )

const copiedModules = (
  modules: ReadonlyArray<ReadonlyArray<boolean>>,
): ReadonlyArray<ReadonlyArray<boolean>> =>
  Array.map(modules, row => Array.copy(row))

const projectionFromEncodedArtifact = (
  payload: string,
  artifact: EncodedReceivingQrArtifact,
): AvailableReceivingQr =>
  AvailableReceivingQr.make({
    payload,
    dataUrl: artifact.dataUrl,
    modules: copiedModules(artifact.modules),
  })

const cacheEncodedArtifact = (
  payload: string,
  artifact: EncodedReceivingQrArtifact,
): void => {
  if (encodedReceivingQrArtifacts.size >= maximumCachedReceivingQrArtifacts) {
    const maybeOldestPayload = Array.head(
      Array.fromIterable(encodedReceivingQrArtifacts.keys()),
    )
    if (Option.isSome(maybeOldestPayload)) {
      encodedReceivingQrArtifacts.delete(maybeOldestPayload.value)
    }
  }
  encodedReceivingQrArtifacts.set(payload, artifact)
}

/** Encodes one public QR payload as a PNG data URL. */
export const encodeQrDataUrl = (payload: string): Option.Option<string> => {
  const cachedArtifact = encodedReceivingQrArtifacts.get(payload)
  if (cachedArtifact !== undefined) {
    return Option.some(cachedArtifact.dataUrl)
  }
  try {
    const encoded = encoder.encode(new Byte(payload, Charset.UTF_8))
    const artifact = EncodedReceivingQrArtifact.make({
      dataUrl: encoded.toDataURL(qrModuleSize, {
        margin: qrModuleSize * qrQuietZoneModules,
      }),
      modules: modulesFromEncodedQr(encoded),
    })
    cacheEncodedArtifact(payload, artifact)
    return Option.some(artifact.dataUrl)
  } catch {
    return Option.none()
  }
}

/** Projects one validated receiving instruction without retaining host state. */
export const projectReceivingQr = (
  input: ReceivingQrProjectionInput,
): ReceivingQrProjection => {
  if (input.hostOrigin._tag === 'PortableWalletRouteOrigin') {
    return UnavailableReceivingQr.make({ reason: 'PortableRoute' })
  }
  if (input.runtimeMode._tag === 'InspectingWalletRuntimeMode') {
    return UnavailableReceivingQr.make({ reason: 'ReplayInspection' })
  }
  if (input.portfolio.dataSource === 'Fixture') {
    return UnavailableReceivingQr.make({ reason: 'FixturePortfolio' })
  }
  if (
    !isInstructionConsistent(input.portfolio, input.account, input.instruction)
  ) {
    return UnavailableReceivingQr.make({ reason: 'InconsistentInstruction' })
  }
  if (
    !isValidCarrier(
      input.instruction.portableUri,
      input.account.chainId,
      input.instruction.destinationAddress,
    )
  ) {
    return UnavailableReceivingQr.make({ reason: 'InvalidCarrier' })
  }
  const cachedArtifact = encodedReceivingQrArtifacts.get(
    input.instruction.portableUri,
  )
  if (cachedArtifact !== undefined) {
    return projectionFromEncodedArtifact(
      input.instruction.portableUri,
      cachedArtifact,
    )
  }
  try {
    const encoded = encoder.encode(
      new Byte(input.instruction.portableUri, Charset.UTF_8),
    )
    const artifact = EncodedReceivingQrArtifact.make({
      dataUrl: encoded.toDataURL(qrModuleSize, {
        margin: qrModuleSize * qrQuietZoneModules,
      }),
      modules: modulesFromEncodedQr(encoded),
    })
    cacheEncodedArtifact(input.instruction.portableUri, artifact)
    return projectionFromEncodedArtifact(
      input.instruction.portableUri,
      artifact,
    )
  } catch {
    return UnavailableReceivingQr.make({ reason: 'EncodingFailed' })
  }
}

const terminalModuleCharacter = (
  isTopSet: boolean,
  isBottomSet: boolean,
): string => {
  if (isTopSet && isBottomSet) {
    return '█'
  } else if (isTopSet) {
    return '▀'
  } else if (isBottomSet) {
    return '▄'
  } else {
    return ' '
  }
}

const moduleAt = (
  modules: ReadonlyArray<ReadonlyArray<boolean>>,
  x: number,
  y: number,
): boolean => {
  const maybeRow = Array.get(modules, y)
  if (Option.isNone(maybeRow)) {
    return false
  }
  return Option.getOrElse(Array.get(maybeRow.value, x), () => false)
}

/** Renders a QR matrix as compact two-module-high terminal text. */
export const receivingQrTextLines = (
  projection: AvailableReceivingQr,
): ReadonlyArray<string> => {
  const moduleCount = Array.length(projection.modules)
  const paddedModuleCount = moduleCount + qrQuietZoneModules * 2
  return Array.makeBy(Math.ceil(paddedModuleCount / 2), lineIndex =>
    Array.join(
      Array.makeBy(paddedModuleCount, columnIndex => {
        const moduleX = columnIndex - qrQuietZoneModules
        const topModuleY = lineIndex * 2 - qrQuietZoneModules
        const bottomModuleY = topModuleY + 1
        return terminalModuleCharacter(
          moduleAt(projection.modules, moduleX, topModuleY),
          moduleAt(projection.modules, moduleX, bottomModuleY),
        )
      }),
      '',
    ),
  )
}

/** Formats a fail-closed QR reason consistently across every host. */
export const receivingQrUnavailableLabel = (
  reason: ReceivingQrUnavailableReason,
): string =>
  M.value(reason).pipe(
    M.withReturnType<string>(),
    M.when(
      'PortableRoute',
      () => 'Not a scannable QR. Open this Wallet directly to receive funds.',
    ),
    M.when(
      'ReplayInspection',
      () => 'Not a scannable QR. Replay inspection cannot receive funds.',
    ),
    M.when(
      'FixturePortfolio',
      () =>
        'Not a scannable QR. Fixture wallet addresses cannot receive funds.',
    ),
    M.when(
      'InconsistentInstruction',
      () => 'Not a scannable QR. The receiving instruction is inconsistent.',
    ),
    M.when(
      'InvalidCarrier',
      () => 'Not a scannable QR. The receiving address carrier is invalid.',
    ),
    M.when('EncodingFailed', () => 'Not a scannable QR. QR encoding failed.'),
    M.exhaustive,
  )
