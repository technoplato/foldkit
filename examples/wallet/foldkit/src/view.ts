import { Array, Match as M, Option } from 'effect'
import { type Document, type Html, html } from 'foldkit/html'
import {
  ChangedTransferRecipient,
  type Message,
  type Model,
  RequestedChallengeSignature,
  RequestedSignedTransactionSubmission,
  RequestedTransferPreview,
  RequestedWalletCreation,
  RequestedWalletRefresh,
  SelectedWalletNetworkMode,
  type TransactionPreview,
  type TransactionState,
  type WalletCreationState,
  type WalletNetworkMode,
  type WalletProfile,
  activeWalletAccounts,
  assetAmountLabel,
  assetAmountLabelForModel,
  makeWalletTestChallenge,
  primaryReceivingInstruction,
  primaryWalletAccount,
  primaryWalletAsset,
  primaryWalletBalance,
  primaryWalletNetwork,
  shortenedAddress,
  transferRecipientInput,
  walletDemoTransferAtomicUnits,
} from 'wallet-core-example'

const maybePreviewForTransaction = (
  transaction: TransactionState,
): Option.Option<TransactionPreview> =>
  M.value(transaction).pipe(
    M.withReturnType<Option.Option<TransactionPreview>>(),
    M.tagsExhaustive({
      IdleTransaction: () => Option.none(),
      ValidatingTransfer: () => Option.none(),
      InvalidTransfer: () => Option.none(),
      PreviewingTransaction: () => Option.none(),
      PreviewedTransaction: ({ preview }) => Option.some(preview),
      SubmittingTransaction: ({ preview }) => Option.some(preview),
      SubmittedTransaction: ({ preview }) => Option.some(preview),
      FailedTransactionPreview: () => Option.none(),
      FailedTransferValidation: () => Option.none(),
      FailedTransactionSubmission: ({ preview }) => Option.some(preview),
    }),
  )

const transactionStatus = (transaction: TransactionState): string =>
  M.value(transaction).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      IdleTransaction: () => 'Ready',
      ValidatingTransfer: () => 'Validating recipient…',
      InvalidTransfer: () => 'Recipient needs attention',
      PreviewingTransaction: () => 'Preparing preview…',
      PreviewedTransaction: () => 'Check before sending',
      SubmittingTransaction: () => 'Sending…',
      SubmittedTransaction: () => 'Sent',
      FailedTransactionPreview: () => 'Preview failed',
      FailedTransferValidation: () => 'Validation failed',
      FailedTransactionSubmission: () => 'Send failed',
    }),
  )

const walletCreationLabel = (walletCreation: WalletCreationState): string =>
  M.value(walletCreation).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      ReadyToCreateWallet: () => 'Create wallet',
      CreatingWallet: () => 'Creating…',
      FailedWalletCreation: () => 'Try again',
    }),
  )

const networkModeButton = (
  model: Model,
  networkMode: WalletNetworkMode,
): Html => {
  const h = html<Message>()
  const className =
    model.walletNetworkMode === networkMode
      ? 'wallet-network-option selected'
      : 'wallet-network-option'
  return h.button(
    [
      h.Type('button'),
      h.Class(className),
      h.AriaPressed(String(model.walletNetworkMode === networkMode)),
      h.OnClick(SelectedWalletNetworkMode.make({ networkMode })),
    ],
    [networkMode],
  )
}

const walletProfileCard = (model: Model, wallet: WalletProfile): Html => {
  const h = html<Message>()
  return h.article(
    [h.Class('wallet-profile'), h.Key(wallet.walletId)],
    [
      h.div(
        [h.Class('wallet-profile-heading')],
        [
          h.div(
            [],
            [
              h.p([h.Class('cardboard-eyebrow')], ['Multi-chain wallet']),
              h.h3([], [wallet.displayName]),
            ],
          ),
          h.span([], [model.walletNetworkMode]),
        ],
      ),
      h.ul(
        [h.Class('wallet-chain-list')],
        Array.map(
          activeWalletAccounts(wallet, model.walletNetworkMode),
          account =>
            h.li(
              [h.Key(account.accountId)],
              [
                h.div(
                  [],
                  [
                    h.strong([], [account.chain]),
                    h.span([], [account.networkName]),
                  ],
                ),
                h.code([], [shortenedAddress(account.address)]),
                h.small([], [account.detail]),
              ],
            ),
        ),
      ),
    ],
  )
}

const walletHome = (model: Model): Html => {
  const h = html<Message>()
  const creationButtonAttributes = [
    h.Type('button'),
    h.Class('cardboard-button primary'),
    h.Disabled(model.walletCreation._tag === 'CreatingWallet'),
    h.OnClick(RequestedWalletCreation.make({})),
  ]
  const creationFailure =
    model.walletCreation._tag === 'FailedWalletCreation'
      ? [
          h.p(
            [h.Class('wallet-validation'), h.Role('alert')],
            [
              `Wallet creation failed (${model.walletCreation.code}). No secret key entered the Model or replay journal.`,
            ],
          ),
        ]
      : []
  const profiles = Array.match(model.wallets, {
    onEmpty: () =>
      h.div(
        [h.Class('wallet-home-empty')],
        [
          h.strong([], ['No wallets yet.']),
          h.p(
            [],
            [
              'Create one wallet with Bitcoin, Ethereum, Solana, and Sui accounts.',
            ],
          ),
        ],
      ),
    onNonEmpty: wallets =>
      h.div(
        [h.Class('wallet-profile-list')],
        Array.map(wallets, wallet => walletProfileCard(model, wallet)),
      ),
  })
  return h.section(
    [h.Class('wallet-home cardboard-panel')],
    [
      h.div(
        [h.Class('wallet-heading-row')],
        [
          h.div(
            [],
            [
              h.p([h.Class('cardboard-eyebrow')], ['Session-only custody']),
              h.h2([], ['Your wallets']),
            ],
          ),
          h.button(creationButtonAttributes, [
            walletCreationLabel(model.walletCreation),
          ]),
        ],
      ),
      h.div(
        [h.Class('wallet-network-control')],
        [
          h.div(
            [],
            [
              h.strong([], ['Network mode']),
              h.span([], ['Switches every wallet and chain together.']),
            ],
          ),
          h.div(
            [
              h.Class('wallet-network-switch'),
              h.AriaLabel('Wallet network mode'),
            ],
            [
              networkModeButton(model, 'Devnet'),
              networkModeButton(model, 'Testnet'),
            ],
          ),
        ],
      ),
      ...creationFailure,
      profiles,
    ],
  )
}

const walletHero = (model: Model): Html => {
  const h = html<Message>()
  const maybeAccount = primaryWalletAccount(model)
  const maybeBalance = primaryWalletBalance(model)
  const balanceLabel = Option.match(maybeBalance, {
    onNone: () =>
      model.portfolio._tag === 'LoadingPortfolio' ? 'Loading…' : '—',
    onSome: balance => assetAmountLabelForModel(model, balance.amount),
  })
  const accountLabel = Option.match(maybeAccount, {
    onNone: () => 'Sepolia test wallet',
    onSome: account => {
      const networkName = Option.match(primaryWalletNetwork(model), {
        onNone: () => account.networkId,
        onSome: network => network.displayName,
      })
      return `${networkName} · ${shortenedAddress(account.address)}`
    },
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
  const isBusy =
    model.transaction._tag === 'ValidatingTransfer' ||
    model.transaction._tag === 'PreviewingTransaction' ||
    model.transaction._tag === 'SubmittingTransaction'
  if (
    Option.isNone(primaryWalletBalance(model)) ||
    model.transferRecipient._tag === 'EmptyTransferRecipient' ||
    isBusy
  ) {
    return h.button(
      [h.Type('button'), h.Class('cardboard-button primary'), h.Disabled(true)],
      ['Preview send'],
    )
  }
  return h.button(
    [
      h.Type('button'),
      h.Class('cardboard-button primary'),
      h.OnClick(RequestedTransferPreview.make({})),
    ],
    ['Preview send'],
  )
}

const submittedTransactionConfirmation = (
  model: Model,
): ReadonlyArray<Html> => {
  const h = html<Message>()
  if (model.transaction._tag !== 'SubmittedTransaction') {
    return []
  }
  const maybeConfirmation =
    model.transaction.submission.maybeExplorerConfirmation
  const explorerConfirmation = Option.isSome(maybeConfirmation)
    ? [
        h.span([], [`Confirm it on ${maybeConfirmation.value.label}.`]),
        h.a(
          [
            h.Href(maybeConfirmation.value.url),
            h.Target('_blank'),
            h.Rel('noopener noreferrer'),
          ],
          [`View on ${maybeConfirmation.value.label}`],
        ),
      ]
    : []
  return [
    h.div(
      [h.Class('wallet-confirmation'), h.Role('status')],
      [
        h.strong([], ['Transaction submitted']),
        ...explorerConfirmation,
        h.code([], [model.transaction.submission.transactionId]),
      ],
    ),
  ]
}

const sendMoney = (model: Model): Html => {
  const h = html<Message>()
  const maybePreview = maybePreviewForTransaction(model.transaction)
  const networkName = Option.match(primaryWalletNetwork(model), {
    onNone: () => 'selected network',
    onSome: network => network.displayName,
  })
  const exampleAddress = Option.match(primaryWalletAccount(model), {
    onNone: () => 'Recipient address',
    onSome: account => account.address,
  })
  const transferAmount = Option.match(primaryWalletAsset(model), {
    onNone: () => walletDemoTransferAtomicUnits,
    onSome: asset =>
      assetAmountLabel(
        {
          assetId: asset.assetId,
          atomicUnits: walletDemoTransferAtomicUnits,
          observedAt: 0,
        },
        asset,
      ),
  })
  const recipientField = h.label(
    [h.Class('wallet-recipient'), h.For('wallet-recipient')],
    [
      h.span([], [`Recipient on ${networkName}`]),
      h.input([
        h.Id('wallet-recipient'),
        h.Type('text'),
        h.Placeholder(exampleAddress),
        h.Spellcheck(false),
        h.Value(transferRecipientInput(model.transferRecipient)),
        h.Disabled(model.transaction._tag === 'SubmittingTransaction'),
        h.OnInput(value => ChangedTransferRecipient.make({ value })),
      ]),
    ],
  )
  const validation =
    model.transferRecipient._tag === 'InvalidTransferRecipient'
      ? [
          h.div(
            [h.Class('wallet-validation'), h.Role('alert')],
            [
              h.p([], [model.transferRecipient.guidance.summary]),
              h.ul(
                [],
                Array.map(model.transferRecipient.guidance.details, detail =>
                  h.li([h.Key(detail)], [detail]),
                ),
              ),
            ],
          ),
        ]
      : []
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
                [
                  shortenedAddress(
                    transactionPreview.transfer.recipient.displayAddress,
                  ),
                ],
              ),
            ],
          ),
          h.div(
            [],
            [
              h.span([], ['Network fee']),
              h.strong(
                [],
                [
                  assetAmountLabelForModel(
                    model,
                    transactionPreview.estimatedFee,
                  ),
                ],
              ),
            ],
          ),
          h.div(
            [],
            [
              h.span([], ['Balance after']),
              h.strong(
                [],
                [
                  assetAmountLabelForModel(
                    model,
                    transactionPreview.resultingBalance,
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
  })
  const confirmation = submittedTransactionConfirmation(model)
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
              h.h2([], [transferAmount]),
            ],
          ),
          h.span(
            [h.Class('wallet-status')],
            [transactionStatus(model.transaction)],
          ),
        ],
      ),
      recipientField,
      ...validation,
      preview,
      ...confirmation,
      h.div([h.Class('wallet-action-row')], [sendButton(model)]),
    ],
  )
}

const activity = (model: Model): Html => {
  const h = html<Message>()
  const entries = Array.match(model.transactions, {
    onEmpty: () => [h.p([h.Class('wallet-empty')], ['Nothing sent yet.'])],
    onNonEmpty: transactions => [
      h.ul(
        [],
        Array.map(transactions, transaction =>
          h.li(
            [h.Key(transaction.transactionId)],
            [
              h.span([], [transaction.status]),
              h.strong(
                [],
                [assetAmountLabelForModel(model, transaction.amount)],
              ),
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
            walletHome(model),
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
