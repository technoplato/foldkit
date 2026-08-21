import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import {
  AccountBalance,
  AdapterTestFundingMethod,
  AssetAmount,
  AssetDescriptor,
  AtomicUnits,
  BalanceSnapshot,
  ChainDescriptor,
  NativeAsset,
  NetworkDescriptor,
  PortfolioSnapshot,
  ReceivingInstruction,
  WalletAccount,
} from 'wallet-core-example'

import { BitMatrix, Decoder, Encoder } from '@nuintun/qrcode'

import {
  AvailableReceivingQr,
  type AvailableReceivingQr as AvailableReceivingQrType,
  type ReceivingQrProjectionInput,
  encodeQrDataUrl,
  freshWalletHostOrigin,
  inspectingWalletRuntimeMode,
  liveWalletRuntimeMode,
  portableWalletRouteOrigin,
  projectReceivingQr,
  receivingQrTextLines,
  receivingQrUnavailableLabel,
} from './receivingQr.js'

const chainId = 'ethereum'
const networkId = 'ethereum:sepolia'
const assetId = 'ethereum:sepolia:eth'
const accountId = 'wallet-1-ethereum-sepolia'
const address = '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01'
const portableUri = `${chainId}:${address}@11155111`
const gifDataUrlPrefix = 'data:image/gif;base64,'
const atomicUnits = S.decodeUnknownSync(AtomicUnits)('1')

const chain = ChainDescriptor.make({
  chainId,
  displayName: 'Ethereum',
})
const network = NetworkDescriptor.make({
  networkId,
  chainId,
  displayName: 'Ethereum Sepolia',
  environment: 'Testnet',
  capabilities: ['Transfer', 'TestFunding'],
  testFundingMethod: AdapterTestFundingMethod.make({}),
})
const asset = AssetDescriptor.make({
  assetId,
  networkId,
  displayName: 'Ether',
  symbol: 'ETH',
  atomicUnitName: 'wei',
  suggestedTestTransferAtomicUnits: atomicUnits,
  decimalPlaces: 18,
  kind: NativeAsset.make({}),
})
const account = WalletAccount.make({
  accountId,
  chainId,
  networkId,
  address,
  displayName: 'Ethereum Sepolia',
})
const instruction = ReceivingInstruction.make({
  accountId,
  assetId,
  destinationAddress: address,
  maybeMemo: Option.none(),
  portableUri,
})
const balance = AccountBalance.make({
  accountId,
  amount: AssetAmount.make({
    assetId,
    atomicUnits,
    observedAt: 1_785_129_600_000,
  }),
})

const portfolioWith = (
  receivingInstruction: typeof ReceivingInstruction.Type = instruction,
  walletAccount: typeof WalletAccount.Type = account,
  dataSource: 'Fixture' | 'Testnet' | 'Live' = 'Testnet',
): typeof PortfolioSnapshot.Type =>
  PortfolioSnapshot.make({
    dataSource,
    chains: [chain],
    networks: [network],
    assets: [asset],
    accounts: [walletAccount],
    balanceSnapshot: BalanceSnapshot.make({
      observedAt: 1_785_129_600_000,
      balances: [balance],
      unavailableAccountIds: [],
    }),
    receivingInstructions: [receivingInstruction],
  })

const inputWith = (
  overrides: Partial<ReceivingQrProjectionInput> = {},
): ReceivingQrProjectionInput => ({
  hostOrigin: freshWalletHostOrigin,
  runtimeMode: liveWalletRuntimeMode,
  portfolio: portfolioWith(),
  account,
  instruction,
  ...overrides,
})

const inputForCarrier = (carrier: string): ReceivingQrProjectionInput => {
  const nextInstruction = ReceivingInstruction.make({
    ...instruction,
    portableUri: carrier,
  })
  return inputWith({
    portfolio: portfolioWith(nextInstruction),
    instruction: nextInstruction,
  })
}

const expectUnavailableReason = (
  input: ReceivingQrProjectionInput,
  reason:
    | 'PortableRoute'
    | 'ReplayInspection'
    | 'FixturePortfolio'
    | 'InconsistentInstruction'
    | 'InvalidCarrier'
    | 'EncodingFailed',
): void => {
  const projection = projectReceivingQr(input)
  expect(projection._tag).toBe('UnavailableReceivingQr')
  if (projection._tag === 'UnavailableReceivingQr') {
    expect(projection.reason).toBe(reason)
  }
}

const expectAvailable = (
  projection: ReturnType<typeof projectReceivingQr>,
): AvailableReceivingQrType => {
  expect(projection._tag).toBe('AvailableReceivingQr')
  if (projection._tag === 'UnavailableReceivingQr') {
    throw new Error(`QR unavailable: ${projection.reason}`)
  }
  return projection
}

const decodeProjection = (
  projection: AvailableReceivingQrType,
): ReturnType<Decoder['decode']> => {
  const matrix = new BitMatrix(Array.length(projection.modules))
  Array.forEach(projection.modules, (row, y) =>
    Array.forEach(row, (isSet, x) => {
      if (isSet) {
        matrix.set(x, y)
      }
    }),
  )
  return new Decoder().decode(matrix)
}

describe('projectReceivingQr', () => {
  it('encodes the exact receiving carrier at level H without changing bytes', () => {
    const first = expectAvailable(projectReceivingQr(inputWith()))
    const second = expectAvailable(projectReceivingQr(inputWith()))

    const decoded = decodeProjection(first)
    const gif = atob(first.dataUrl.slice(gifDataUrlPrefix.length))
    const expectedPixelSize = (Array.length(first.modules) + 8) * 6

    expect(first.payload).toBe(portableUri)
    expect(decoded.content).toBe(portableUri)
    expect(decoded.level).toBe('H')
    expect(first.dataUrl.startsWith(gifDataUrlPrefix)).toBe(true)
    expect(gif.charCodeAt(6) + gif.charCodeAt(7) * 256).toBe(expectedPixelSize)
    expect(gif.charCodeAt(8) + gif.charCodeAt(9) * 256).toBe(expectedPixelSize)
    expect(Array.isReadonlyArrayNonEmpty(first.modules)).toBe(true)
    expect(first.modules).toEqual(second.modules)
    expect(first.dataUrl).toBe(second.dataUrl)
  })

  it('encodes once across repeated calls and balance-only portfolio updates', () => {
    const cachedInput = inputForCarrier(
      `${chainId}:${address}@11155111?cache=balance-refresh`,
    )
    const nextBalance = AccountBalance.make({
      ...balance,
      amount: AssetAmount.make({
        ...balance.amount,
        atomicUnits: S.decodeUnknownSync(AtomicUnits)('2'),
        observedAt: balance.amount.observedAt + 1,
      }),
    })
    const nextPortfolio = PortfolioSnapshot.make({
      ...cachedInput.portfolio,
      balanceSnapshot: BalanceSnapshot.make({
        observedAt: cachedInput.portfolio.balanceSnapshot.observedAt + 1,
        balances: [nextBalance],
        unavailableAccountIds: [],
      }),
    })
    const encode = vi.spyOn(Encoder.prototype, 'encode')
    try {
      const first = expectAvailable(projectReceivingQr(cachedInput))
      const second = expectAvailable(projectReceivingQr(cachedInput))
      const afterBalanceUpdate = expectAvailable(
        projectReceivingQr({
          ...cachedInput,
          portfolio: nextPortfolio,
        }),
      )

      expect(encode).toHaveBeenCalledTimes(1)
      expect(first.dataUrl).toBe(second.dataUrl)
      expect(second.dataUrl).toBe(afterBalanceUpdate.dataUrl)
      expect(first.modules).toEqual(second.modules)
      expect(first.modules).not.toBe(second.modules)
    } finally {
      encode.mockRestore()
    }
  })

  it('validates a changed portfolio before consulting a cached artifact', () => {
    const cachedInput = inputForCarrier(
      `${chainId}:${address}@11155111?cache=validation-order`,
    )
    expectAvailable(projectReceivingQr(cachedInput))

    expectUnavailableReason(
      {
        ...cachedInput,
        portfolio: PortfolioSnapshot.make({
          ...cachedInput.portfolio,
          accounts: [],
        }),
      },
      'InconsistentInstruction',
    )
  })

  it('encodes different payloads separately', () => {
    const firstInput = inputForCarrier(
      `${chainId}:${address}@11155111?cache=payload-one`,
    )
    const secondInput = inputForCarrier(
      `${chainId}:${address}@11155111?cache=payload-two`,
    )
    const encode = vi.spyOn(Encoder.prototype, 'encode')
    try {
      expectAvailable(projectReceivingQr(firstInput))
      expectAvailable(projectReceivingQr(secondInput))
      expect(encode).toHaveBeenCalledTimes(2)
    } finally {
      encode.mockRestore()
    }
  })

  it('accepts an exact address before one numeric EIP-681 chain reference', () => {
    const productionInstruction = ReceivingInstruction.make({
      ...instruction,
      portableUri: `${chainId}:${address}@11155111?value=1`,
    })
    const projection = expectAvailable(
      projectReceivingQr(
        inputWith({
          portfolio: portfolioWith(productionInstruction),
          instruction: productionInstruction,
        }),
      ),
    )

    expect(decodeProjection(projection).content).toBe(
      productionInstruction.portableUri,
    )
  })

  it('preserves an encoded exact address component byte for byte', () => {
    const encodedAddress = `%30${address.slice(1)}`
    const encodedInstruction = ReceivingInstruction.make({
      ...instruction,
      portableUri: `${chainId}:${encodedAddress}@11155111`,
    })
    const projection = expectAvailable(
      projectReceivingQr(
        inputWith({
          portfolio: portfolioWith(encodedInstruction),
          instruction: encodedInstruction,
        }),
      ),
    )

    expect(decodeProjection(projection).content).toBe(
      encodedInstruction.portableUri,
    )
  })

  it('accepts live portfolio data through the same projection', () => {
    const portfolio = portfolioWith(instruction, account, 'Live')
    const projection = expectAvailable(
      projectReceivingQr(inputWith({ portfolio })),
    )

    expect(decodeProjection(projection).content).toBe(portableUri)
  })

  it('fails closed in portable, replay, fixture, consistency, and carrier order', () => {
    const inconsistentAccount = WalletAccount.make({
      ...account,
      address: `${address}0`,
    })
    const invalidInstruction = ReceivingInstruction.make({
      ...instruction,
      portableUri: '/wallet/receive/fixture',
    })

    expectUnavailableReason(
      inputWith({
        hostOrigin: portableWalletRouteOrigin,
        runtimeMode: inspectingWalletRuntimeMode,
        portfolio: portfolioWith(
          invalidInstruction,
          inconsistentAccount,
          'Fixture',
        ),
        account: inconsistentAccount,
        instruction: invalidInstruction,
      }),
      'PortableRoute',
    )
    expectUnavailableReason(
      inputWith({
        runtimeMode: inspectingWalletRuntimeMode,
        portfolio: portfolioWith(
          invalidInstruction,
          inconsistentAccount,
          'Fixture',
        ),
        account: inconsistentAccount,
        instruction: invalidInstruction,
      }),
      'ReplayInspection',
    )
    expectUnavailableReason(
      inputWith({
        portfolio: portfolioWith(
          invalidInstruction,
          inconsistentAccount,
          'Fixture',
        ),
        account: inconsistentAccount,
        instruction: invalidInstruction,
      }),
      'FixturePortfolio',
    )
    expectUnavailableReason(
      inputWith({
        portfolio: portfolioWith(invalidInstruction),
        instruction,
      }),
      'InconsistentInstruction',
    )
    expectUnavailableReason(
      inputWith({
        portfolio: portfolioWith(invalidInstruction),
        instruction: invalidInstruction,
      }),
      'InvalidCarrier',
    )
  })

  it('rejects accounts and instructions that are not exact portfolio members', () => {
    const renamedAccount = WalletAccount.make({
      ...account,
      displayName: 'Renamed outside the portfolio',
    })
    const changedInstruction = ReceivingInstruction.make({
      ...instruction,
      maybeMemo: Option.some('memo'),
    })

    expectUnavailableReason(
      inputWith({ account: renamedAccount }),
      'InconsistentInstruction',
    )
    expectUnavailableReason(
      inputWith({ instruction: changedInstruction }),
      'InconsistentInstruction',
    )
  })

  it('rejects account, asset, network, chain, and destination inconsistencies', () => {
    const mismatchedAccount = WalletAccount.make({
      ...account,
      chainId: 'other-chain',
    })
    const mismatchedInstruction = ReceivingInstruction.make({
      ...instruction,
      destinationAddress: `${address}0`,
    })
    const mismatchedAsset = AssetDescriptor.make({
      ...asset,
      networkId: 'ethereum:mainnet',
    })
    const mismatchedNetwork = NetworkDescriptor.make({
      ...network,
      chainId: 'other-chain',
    })

    expectUnavailableReason(
      inputWith({
        portfolio: portfolioWith(instruction, mismatchedAccount),
        account: mismatchedAccount,
      }),
      'InconsistentInstruction',
    )
    expectUnavailableReason(
      inputWith({
        portfolio: portfolioWith(mismatchedInstruction),
        instruction: mismatchedInstruction,
      }),
      'InconsistentInstruction',
    )
    expectUnavailableReason(
      inputWith({
        portfolio: PortfolioSnapshot.make({
          ...portfolioWith(),
          assets: [mismatchedAsset],
        }),
      }),
      'InconsistentInstruction',
    )
    expectUnavailableReason(
      inputWith({
        portfolio: PortfolioSnapshot.make({
          ...portfolioWith(),
          networks: [mismatchedNetwork],
        }),
      }),
      'InconsistentInstruction',
    )
  })

  it('rejects every invalid carrier invariant without encoding it', () => {
    const invalidCarriers: ReadonlyArray<
      Readonly<{ name: string; value: string }>
    > = [
      { name: 'fixture route', value: `/wallet/receive/${accountId}` },
      { name: 'relative carrier', value: address },
      { name: 'whitespace', value: `${chainId}:${address} wallet` },
      { name: 'control character', value: `${chainId}:${address}\n` },
      { name: 'wrong scheme', value: `bitcoin:${address}` },
      { name: 'normalized representation', value: `${chainId}:/../${address}` },
      {
        name: 'address only appears inside another component',
        value: `${chainId}:not-${address}`,
      },
      {
        name: 'non-numeric EIP-681 chain reference',
        value: `${chainId}:${address}@sepolia`,
      },
      {
        name: 'multiple EIP-681 chain references',
        value: `${chainId}:${address}@11155111@1`,
      },
      {
        name: 'over maximum length',
        value: `${chainId}:${address}${'a'.repeat(1_024)}`,
      },
    ]

    Array.forEach(invalidCarriers, invalidCarrier => {
      const invalidReceivingInstruction = ReceivingInstruction.make({
        ...instruction,
        portableUri: invalidCarrier.value,
      })
      expectUnavailableReason(
        inputWith({
          portfolio: portfolioWith(invalidReceivingInstruction),
          instruction: invalidReceivingInstruction,
        }),
        'InvalidCarrier',
      )
    })
  })

  it('accepts exactly 1,024 carrier characters and rejects one more', () => {
    const boundaryAddress = `0x${'a'.repeat(1_013)}`
    const boundaryAccount = WalletAccount.make({
      ...account,
      address: boundaryAddress,
    })
    const boundaryInstruction = ReceivingInstruction.make({
      ...instruction,
      destinationAddress: boundaryAddress,
      portableUri: `${chainId}:${boundaryAddress}`,
    })

    const boundaryProjection = expectAvailable(
      projectReceivingQr(
        inputWith({
          portfolio: portfolioWith(
            boundaryInstruction,
            boundaryAccount,
            'Testnet',
          ),
          account: boundaryAccount,
          instruction: boundaryInstruction,
        }),
      ),
    )
    expect(boundaryProjection.payload.length).toBe(1_024)

    const overBoundaryAddress = `${boundaryAddress}a`
    const overBoundaryAccount = WalletAccount.make({
      ...account,
      address: overBoundaryAddress,
    })
    const overBoundaryInstruction = ReceivingInstruction.make({
      ...instruction,
      destinationAddress: overBoundaryAddress,
      portableUri: `${chainId}:${overBoundaryAddress}`,
    })
    expectUnavailableReason(
      inputWith({
        portfolio: portfolioWith(
          overBoundaryInstruction,
          overBoundaryAccount,
          'Testnet',
        ),
        account: overBoundaryAccount,
        instruction: overBoundaryInstruction,
      }),
      'InvalidCarrier',
    )
  })

  it('fails closed when the QR encoder rejects a valid carrier', () => {
    const encoderFailureInput = inputForCarrier(
      `${chainId}:${address}@11155111?cache=encoder-failure`,
    )
    const encoderFailure = vi
      .spyOn(Encoder.prototype, 'encode')
      .mockImplementationOnce(() => {
        throw new Error('expected encoder failure')
      })
    try {
      expectUnavailableReason(encoderFailureInput, 'EncodingFailed')
      expectAvailable(projectReceivingQr(encoderFailureInput))
      expect(encoderFailure).toHaveBeenCalledTimes(2)
    } finally {
      encoderFailure.mockRestore()
    }
  })

  it('evicts the oldest encoded artifact after sixteen retained payloads', () => {
    const inputs = Array.makeBy(17, index =>
      inputForCarrier(
        `${chainId}:${address}@11155111?cache=eviction-${index.toString()}`,
      ),
    )
    const firstInput = Option.getOrThrow(Array.head(inputs))
    const encode = vi.spyOn(Encoder.prototype, 'encode')
    try {
      Array.forEach(inputs, input => {
        expectAvailable(projectReceivingQr(input))
      })
      expectAvailable(projectReceivingQr(firstInput))
      expect(encode).toHaveBeenCalledTimes(18)
    } finally {
      encode.mockRestore()
    }
  })
})

describe('receivingQrTextLines', () => {
  it('packs two module rows into block characters with a four-module quiet zone', () => {
    const projection = AvailableReceivingQr.make({
      payload: 'ethereum:0x1',
      dataUrl: 'data:image/gif;base64,AA==',
      modules: [
        [false, true],
        [true, true],
      ],
    })

    expect(receivingQrTextLines(projection)).toEqual([
      '          ',
      '          ',
      '    ▄█    ',
      '          ',
      '          ',
    ])
  })

  it('renders a decodable projection at the expected padded width', () => {
    const projection = expectAvailable(projectReceivingQr(inputWith()))
    const lines = receivingQrTextLines(projection)
    const expectedWidth = Array.length(projection.modules) + 8

    expect(Array.every(lines, line => line.length === expectedWidth)).toBe(true)
    expect(Array.take(lines, 2)).toEqual([
      ' '.repeat(expectedWidth),
      ' '.repeat(expectedWidth),
    ])
    expect(Array.last(lines)).toEqual(Option.some(' '.repeat(expectedWidth)))
  })
})

describe('encodeQrDataUrl', () => {
  it('encodes a Solana Pay URI as a PNG data URL', () => {
    const maybeDataUrl = encodeQrDataUrl(
      'solana:C5DLCjAX2UGrVDvoz8M4TYBCWSyUL9451GzG62SfQuih?amount=0.001',
    )
    expect(Option.isSome(maybeDataUrl)).toBe(true)
    if (Option.isSome(maybeDataUrl)) {
      expect(maybeDataUrl.value.startsWith('data:image/')).toBe(true)
    }
  })
})

describe('receivingQrUnavailableLabel', () => {
  it('uses an explicit non-scannable label for every reason', () => {
    const reasons = [
      'PortableRoute',
      'ReplayInspection',
      'FixturePortfolio',
      'InconsistentInstruction',
      'InvalidCarrier',
      'EncodingFailed',
    ] satisfies ReadonlyArray<Parameters<typeof receivingQrUnavailableLabel>[0]>

    Array.forEach(reasons, reason => {
      expect(receivingQrUnavailableLabel(reason)).toMatch(
        /^Not a scannable QR\./u,
      )
    })
    expect(new Set(Array.map(reasons, receivingQrUnavailableLabel)).size).toBe(
      Array.length(reasons),
    )
  })
})
