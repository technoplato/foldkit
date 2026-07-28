import { Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { BlockExplorerConfirmation } from './explorer.js'

describe('BlockExplorerConfirmation', () => {
  it('accepts an adapter-provided explorer link without a chain union', () => {
    expect(
      S.decodeUnknownSync(BlockExplorerConfirmation)({
        label: 'Explorer',
        transactionId: 'transaction-1',
        url: 'https://explorer.example/transaction-1',
      }),
    ).toEqual({
      label: 'Explorer',
      transactionId: 'transaction-1',
      url: 'https://explorer.example/transaction-1',
    })
  })
})
