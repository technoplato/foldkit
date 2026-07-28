import { Array, Match as M, Option } from 'effect'
import { type Document, type Html, html } from 'foldkit/html'
import {
  ComposedTransfer,
  CurrencyValue,
  type Message,
  type Model,
  RequestedChallengeSignature,
  RequestedSignedTransactionSubmission,
  RequestedWalletRefresh,
  type TransactionPreview,
  type TransactionState,
  currencyValueLabel,
  makeWalletTestChallenge,
  networkLabel,
  primaryReceivingInstruction,
  primaryWalletAccount,
  primaryWalletBalance,
  shortenedAddress,
  transferDraftFromInput,
} from 'wallet-core-example'

const presetTransferAtomicUnits = '10000000000000'

const maybePreviewForTransaction = (
  transaction: TransactionState,
): Option.Option<TransactionPreview> =>
  M.value(transaction).pipe(
    M.withReturnType<Option.Option<TransactionPreview>>(),
    M.tagsExhaustive({
      IdleTransaction: () => Option.none(),
      PreviewingTransaction: () => Option.none(),
      PreviewedTransaction: ({ preview }) => Option.some(preview),
      SubmittingTransaction: ({ preview }) => Option.some(preview),
      SubmittedTransaction: ({ preview }) => Option.some(preview),
      FailedTransactionPreview: () => Option.none(),
      FailedTransactionSubmission: ({ preview }) => Option.some(preview),
    }),
  )

const transactionStatus = (transaction: TransactionState): string =>
  M.value(transaction).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      IdleTransaction: () => 'Ready',
      PreviewingTransaction: () => 'Preparing preview…',
      PreviewedTransaction: () => 'Check before sending',
      SubmittingTransaction: () => 'Sending…',
      SubmittedTransaction: () => 'Sent',
      FailedTransactionPreview: () => 'Preview failed',
      FailedTransactionSubmission: () => 'Send failed',
    }),
  )

const walletHero = (model: Model): Html => {
  const h = html<Message>()
  const maybeAccount = primaryWalletAccount(model)
  const maybeBalance = primaryWalletBalance(model)
  const balanceLabel = Option.match(maybeBalance, {
    onNone: () =>
      model.portfolio._tag === 'LoadingPortfolio' ? 'Loading…' : '—',
    onSome: balance => currencyValueLabel(balance.value),
  })
  const accountLabel = Option.match(maybeAccount, {
    onNone: () => 'Sepolia test wallet',
    onSome: account =>
      `${networkLabel(account.network)} · ${shortenedAddress(account.address)}`,
  })
  return h.header(
    [h.Class('wallet-hero cardboard-panel')],
    [
      h.div(
        [h.Class('wallet-heading-row')],
        [
          h.div(
            [],
            [
              h.p([h.Class('cardboard-eyebrow')], ['Test money']),
              h.h1([h.Class('cardboard-embossed')], ['Wallet']),
            ],
          ),
          h.button(
            [
              h.Type('button'),
              h.Class('cardboard-button'),
              h.OnClick(RequestedWalletRefresh.make({})),
            ],
            ['Refresh'],
          ),
        ],
      ),
      h.div(
        [h.Class('wallet-balance')],
        [
          h.p([], ['Available balance']),
          h.strong([h.Class('cardboard-embossed')], [balanceLabel]),
          h.small([], [accountLabel]),
        ],
      ),
    ],
  )
}

const maybeDemoTransfer = (model: Model) =>
  Option.flatMap(primaryWalletAccount(model), account =>
    Option.flatMap(primaryWalletBalance(model), balance =>
      transferDraftFromInput({
        transferId: 'foldkit-demo-transfer',
        accountId: account.accountId,
        network: account.network,
        destinationAddress: account.address,
        value: CurrencyValue.make({
          currency: balance.value.currency,
          atomicUnits: presetTransferAtomicUnits,
          decimalPlaces: balance.value.decimalPlaces,
          observedAt: balance.value.observedAt,
        }),
        maybeMessage: Option.some('Shared Foldkit Wallet demo'),
      }),
    ),
  )

const sendButton = (model: Model): Html => {
  const h = html<Message>()
  if (model.transaction._tag === 'PreviewedTransaction') {
    return h.button(
      [
        h.Type('button'),
        h.Class('cardboard-button primary'),
        h.OnClick(
          RequestedSignedTransactionSubmission.make({
            previewId: model.transaction.preview.previewId,
          }),
        ),
      ],
      ['Confirm send'],
    )
  }
  const maybeDraft = maybeDemoTransfer(model)
  const isBusy =
    model.transaction._tag === 'PreviewingTransaction' ||
    model.transaction._tag === 'SubmittingTransaction'
  if (Option.isNone(maybeDraft) || isBusy) {
    return h.button(
      [h.Type('button'), h.Class('cardboard-button primary'), h.Disabled(true)],
      ['Preview send'],
    )
  }
  return h.button(
    [
      h.Type('button'),
      h.Class('cardboard-button primary'),
      h.OnClick(ComposedTransfer.make({ draft: maybeDraft.value })),
    ],
    ['Preview send'],
  )
}

const sendMoney = (model: Model): Html => {
  const h = html<Message>()
  const maybePreview = maybePreviewForTransaction(model.transaction)
  const preview = Option.match(maybePreview, {
    onNone: () =>
      h.p(
        [h.Class('wallet-help')],
        ['Preview a fixed test transfer before anything is signed.'],
      ),
    onSome: transactionPreview =>
      h.div(
        [h.Class('wallet-preview')],
        [
          h.div(
            [],
            [
              h.span([], ['To']),
              h.strong(
                [],
                [shortenedAddress(transactionPreview.draft.destinationAddress)],
              ),
            ],
          ),
          h.div(
            [],
            [
              h.span([], ['Network fee']),
              h.strong(
                [],
                [currencyValueLabel(transactionPreview.estimatedFee)],
              ),
            ],
          ),
          h.div(
            [],
            [
              h.span([], ['Balance after']),
              h.strong(
                [],
                [currencyValueLabel(transactionPreview.resultingBalance)],
              ),
            ],
          ),
        ],
      ),
  })
  return h.section(
    [h.Class('wallet-send cardboard-panel')],
    [
      h.div(
        [h.Class('wallet-section-heading')],
        [
          h.div(
            [],
            [
              h.p([h.Class('cardboard-eyebrow')], ['Send']),
              h.h2([], ['0.00001 ETH']),
            ],
          ),
          h.span(
            [h.Class('wallet-status')],
            [transactionStatus(model.transaction)],
          ),
        ],
      ),
      preview,
      h.div([h.Class('wallet-action-row')], [sendButton(model)]),
    ],
  )
}

const activity = (model: Model): Html => {
  const h = html<Message>()
  const entries = Array.match(model.observedTransactions, {
    onEmpty: () => [h.p([h.Class('wallet-empty')], ['Nothing sent yet.'])],
    onNonEmpty: transactions => [
      h.ul(
        [],
        Array.map(transactions, transaction =>
          h.li(
            [h.Key(transaction.transactionId)],
            [
              h.span([], [transaction.status]),
              h.strong([], [currencyValueLabel(transaction.value)]),
              h.small([], [shortenedAddress(transaction.transactionId)]),
            ],
          ),
        ),
      ),
    ],
  })
  return h.section(
    [h.Class('wallet-activity cardboard-panel')],
    [h.p([h.Class('cardboard-eyebrow')], ['Recent activity']), ...entries],
  )
}

const accountDetails = (model: Model): Html => {
  const h = html<Message>()
  const maybeAccount = primaryWalletAccount(model)
  const maybeReceiving = primaryReceivingInstruction(model)
  return h.section(
    [h.Class('wallet-detail-section')],
    [
      h.h3([], ['Account']),
      ...Option.match(maybeAccount, {
        onNone: () => [h.p([], ['Account data is not loaded.'])],
        onSome: account => [
          h.p([], [account.displayName]),
          h.code([], [account.address]),
        ],
      }),
      ...Option.match(maybeReceiving, {
        onNone: () => [],
        onSome: instruction => [
          h.h3([], ['Receive']),
          h.code([], [instruction.portableUri]),
        ],
      }),
    ],
  )
}

const proofDetails = (model: Model): Html => {
  const h = html<Message>()
  const maybeAccount = primaryWalletAccount(model)
  const button = Option.match(maybeAccount, {
    onNone: () =>
      h.button(
        [h.Type('button'), h.Class('cardboard-button'), h.Disabled(true)],
        ['Sign test challenge'],
      ),
    onSome: account =>
      h.button(
        [
          h.Type('button'),
          h.Class('cardboard-button'),
          h.OnClick(
            RequestedChallengeSignature.make({
              challenge: makeWalletTestChallenge(
                'foldkit-demo-challenge',
                account.accountId,
              ),
            }),
          ),
        ],
        ['Sign test challenge'],
      ),
  })
  return h.section(
    [h.Class('wallet-detail-section')],
    [h.h3([], ['Proof']), h.p([], [model.signature._tag]), button],
  )
}

const advancedDetails = (model: Model): Html => {
  const h = html<Message>()
  return h.details(
    [h.Class('wallet-details cardboard-panel')],
    [
      h.summary([], ['Account, proof, and replay']),
      h.div(
        [h.Class('wallet-detail-grid')],
        [
          accountDetails(model),
          proofDetails(model),
          h.section(
            [h.Class('wallet-detail-section')],
            [
              h.h3([], ['Replay']),
              h.p(
                [],
                [
                  'Open the Foldkit DevTools badge to inspect the authoritative Program journal.',
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  )
}

/** Renders the complete public Wallet Model with ordinary Foldkit HTML. */
export const view = (model: Model): Document => {
  const h = html<Message>()
  return {
    title: 'Wallet | Foldkit',
    body: h.main(
      [h.Class('wallet-shell cardboard-surface')],
      [
        h.div(
          [h.Class('wallet-stack')],
          [
            walletHero(model),
            sendMoney(model),
            activity(model),
            advancedDetails(model),
          ],
        ),
      ],
    ),
  }
}
