import { Array, Match as M, Option } from 'effect'
import { type Document, type Html, html } from 'foldkit/html'
import {
  ChangedTransferAmount,
  ChangedTransferRecipient,
  type Message,
  type Model,
  RequestedChallengeSignature,
  RequestedClipboardCopy,
  RequestedNextTransactionHistoryPage,
  RequestedSignedTransactionSubmission,
  RequestedTestFunding,
  RequestedTransactionHistoryReload,
  RequestedTransferPreview,
  RequestedWalletCreation,
  RequestedWalletProfilesReload,
  RequestedWalletRefresh,
  ResumedTransactionObservation,
  SelectedSendNetwork,
  SelectedWalletNetworkMode,
  type TransactionPreview,
  type TransactionState,
  type WalletCreationState,
  type WalletNetworkMode,
  type WalletProfile,
  activeWalletAccounts,
  assetAmountLabelForModel,
  availableSendNetworkSelections,
  clipboardCopyFailureMessage,
  clipboardCopyLabel,
  clipboardCopyRequestForAddress,
  isPrimaryWalletBalanceUnavailable,
  isSameClipboardCopyRequest,
  makeWalletTestChallenge,
  networkForId,
  primaryReceivingInstruction,
  primaryWalletAccount,
  primaryWalletAsset,
  primaryWalletBalance,
  primaryWalletNetwork,
  primaryWalletTestFundingMethod,
  sendNetworkSelectionIdentity,
  sendNetworkSelectionLabel,
  shortenedAddress,
  transferAmountInput,
  transferRecipientInput,
  walletDataSourceDetail,
  walletDataSourceLabel,
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

const transferAmountFailure = (model: Model): Option.Option<string> => {
  if (model.transferAmount._tag !== 'InvalidTransferAmount') {
    return Option.none()
  }
  return Option.some(
    M.value(model.transferAmount.code).pipe(
      M.withReturnType<string>(),
      M.when(
        'AssetUnavailable',
        () => 'Select an asset before entering an amount.',
      ),
      M.when(
        'InvalidFormat',
        () =>
          'Enter a positive decimal amount using digits and one decimal point.',
      ),
      M.when(
        'TooManyDecimalPlaces',
        () =>
          'This amount has more decimal places than the selected asset supports.',
      ),
      M.when('MustBePositive', () => 'The amount must be greater than zero.'),
      M.exhaustive,
    ),
  )
}

const selectedNetworkHasCapability = (
  model: Model,
  capability: 'TestFunding' | 'TransactionHistory',
): boolean => {
  if (
    model.portfolio._tag !== 'LoadedPortfolio' ||
    Option.isNone(model.maybeSendNetworkSelection)
  ) {
    return false
  }
  const maybeNetwork = networkForId(
    model.portfolio.snapshot.networks,
    model.maybeSendNetworkSelection.value.networkId,
  )
  return (
    Option.isSome(maybeNetwork) &&
    Array.contains(maybeNetwork.value.capabilities, capability)
  )
}

const walletNetworkModeFromValue = (
  value: string,
  current: WalletNetworkMode,
): WalletNetworkMode => {
  if (value === 'Devnet') {
    return 'Devnet'
  } else if (value === 'Testnet') {
    return 'Testnet'
  } else if (value === 'Live') {
    return 'Live'
  } else {
    return current
  }
}

const walletCreationLabel = (walletCreation: WalletCreationState): string =>
  M.value(walletCreation).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      ReadyToCreateWallet: () => 'Create wallet',
      CreatingWallet: () => 'Creating…',
      FailedWalletCreation: () => 'Try again',
    }),
  )

const copyAddressControl = (
  model: Model,
  address: string,
  copyId: string,
): Html => {
  const h = html<Message>()
  const request = clipboardCopyRequestForAddress(address, copyId)
  const maybeFailure = clipboardCopyFailureMessage(model.clipboardCopy, request)
  const isCopying =
    model.clipboardCopy._tag === 'CopyingToClipboard' &&
    isSameClipboardCopyRequest(model.clipboardCopy.request, request)
  const failure = Option.isSome(maybeFailure)
    ? [
        h.small(
          [h.Class('wallet-copy-error'), h.Role('alert')],
          [maybeFailure.value],
        ),
      ]
    : []
  return h.div(
    [h.Class('wallet-copy-control')],
    [
      h.button(
        [
          h.Type('button'),
          h.Class('wallet-copy-button'),
          h.AriaLive('polite'),
          h.Disabled(isCopying),
          h.OnClick(RequestedClipboardCopy.make({ request })),
        ],
        [clipboardCopyLabel(model.clipboardCopy, request)],
      ),
      ...failure,
    ],
  )
}

const networkModePicker = (model: Model): Html => {
  const h = html<Message>()
  return h.select(
    [
      h.Class('wallet-select'),
      h.AriaLabel('Wallet network mode'),
      h.Value(model.walletNetworkMode),
      h.OnChange(value =>
        SelectedWalletNetworkMode.make({
          networkMode: walletNetworkModeFromValue(
            value,
            model.walletNetworkMode,
          ),
        }),
      ),
    ],
    [
      h.option([h.Value('Devnet')], ['Devnet']),
      h.option([h.Value('Testnet')], ['Testnet']),
      h.option([h.Value('Live')], ['Live']),
    ],
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
          activeWalletAccounts(
            wallet,
            model.portfolio._tag === 'LoadedPortfolio'
              ? model.portfolio.snapshot.networks
              : [],
            model.walletNetworkMode,
          ),
          account =>
            h.li(
              [h.Key(account.accountId)],
              [
                h.div(
                  [],
                  [
                    h.strong([], [account.displayName]),
                    h.span([], [account.networkName]),
                  ],
                ),
                h.div(
                  [h.Class('wallet-address-line')],
                  [
                    h.code([], [shortenedAddress(account.address)]),
                    copyAddressControl(
                      model,
                      account.address,
                      `profile:${wallet.walletId}:${account.accountId}`,
                    ),
                  ],
                ),
                h.small([], [account.chainId]),
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
    h.Disabled(
      model.walletProfileLoading._tag !== 'LoadedWalletProfiles' ||
        model.walletCreation._tag === 'CreatingWallet',
    ),
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
  const profiles = (() => {
    if (model.walletProfileLoading._tag === 'LoadingWalletProfiles') {
      return h.div(
        [h.Class('wallet-home-empty')],
        [
          h.strong([], ['Restoring secure wallets…']),
          h.p([], ['Loading locally protected custody and public addresses.']),
        ],
      )
    } else if (
      model.walletProfileLoading._tag === 'FailedWalletProfileLoading'
    ) {
      return h.div(
        [h.Class('wallet-home-empty'), h.Role('alert')],
        [
          h.strong([], ['Secure wallet storage is unavailable.']),
          h.p(
            [],
            [
              `No stored key material was loaded (${model.walletProfileLoading.code}).`,
            ],
          ),
          h.button(
            [
              h.Type('button'),
              h.Class('cardboard-button'),
              h.OnClick(RequestedWalletProfilesReload.make({})),
            ],
            ['Retry secure storage'],
          ),
        ],
      )
    } else {
      return Array.match(model.wallets, {
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
    }
  })()
  return h.section(
    [h.Class('wallet-home cardboard-panel')],
    [
      h.div(
        [h.Class('wallet-heading-row')],
        [
          h.div(
            [],
            [
              h.p([h.Class('cardboard-eyebrow')], ['Secure local custody']),
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
          networkModePicker(model),
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
  const isBalanceUnavailable = isPrimaryWalletBalanceUnavailable(model)
  const balanceLabel = Option.match(maybeBalance, {
    onNone: () => {
      if (model.portfolio._tag === 'LoadingPortfolio') {
        return 'Loading…'
      } else if (isBalanceUnavailable) {
        return 'Unavailable. Refresh to retry.'
      } else {
        return '—'
      }
    },
    onSome: balance => assetAmountLabelForModel(model, balance.amount),
  })
  const accountLabel = Option.match(maybeAccount, {
    onNone: () =>
      model.portfolio._tag === 'LoadingPortfolio'
        ? 'Loading adapter account…'
        : 'No adapter account available',
    onSome: account => {
      const networkName = Option.match(primaryWalletNetwork(model), {
        onNone: () => account.networkId,
        onSome: network => network.displayName,
      })
      return `${networkName} · ${shortenedAddress(account.address)}`
    },
  })
  const dataSourceLabel =
    model.portfolio._tag === 'LoadedPortfolio'
      ? walletDataSourceLabel(model.portfolio.snapshot.dataSource)
      : 'Loading data source'
  const dataSourceDetail =
    model.portfolio._tag === 'LoadedPortfolio'
      ? walletDataSourceDetail(model.portfolio.snapshot.dataSource)
      : 'Waiting for the selected portfolio adapter.'
  return h.header(
    [h.Class('wallet-hero cardboard-panel')],
    [
      h.div(
        [h.Class('wallet-heading-row')],
        [
          h.div(
            [],
            [
              h.p([h.Class('cardboard-eyebrow')], [dataSourceLabel]),
              h.h1([h.Class('cardboard-embossed')], ['Portfolio']),
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
          h.div(
            [h.Class('wallet-address-line')],
            [
              h.small([], [accountLabel]),
              ...Option.match(maybeAccount, {
                onNone: () => [],
                onSome: account => [
                  copyAddressControl(model, account.address, 'primary-account'),
                ],
              }),
            ],
          ),
        ],
      ),
      h.p([h.Class('wallet-data-source-detail')], [dataSourceDetail]),
      ...(model.portfolio._tag === 'FailedPortfolio'
        ? [
            h.p(
              [h.Class('wallet-validation'), h.Role('alert')],
              [
                `Portfolio failed: ${model.portfolio.failure.operation} · ${model.portfolio.failure.code}`,
              ],
            ),
          ]
        : []),
    ],
  )
}

const sendNetworkPicker = (model: Model): Html => {
  const h = html<Message>()
  if (model.portfolio._tag !== 'LoadedPortfolio') {
    return h.div([], [])
  }
  const portfolio = model.portfolio.snapshot
  const selections = availableSendNetworkSelections(
    portfolio,
    model.walletNetworkMode,
  )
  return Array.match(selections, {
    onEmpty: () =>
      h.p(
        [h.Class('wallet-validation'), h.Role('alert')],
        ['No transferable assets are available for this network mode.'],
      ),
    onNonEmpty: nonEmptySelections => {
      const selected = Option.getOrElse(model.maybeSendNetworkSelection, () =>
        Array.headNonEmpty(nonEmptySelections),
      )
      return h.div(
        [h.Class('wallet-picker')],
        [
          h.label([h.For('wallet-asset')], ['Cryptocurrency and network']),
          h.select(
            [
              h.Id('wallet-asset'),
              h.Class('wallet-select'),
              h.Value(sendNetworkSelectionIdentity(selected)),
              h.OnChange(value => {
                const maybeSelection = Array.findFirst(
                  nonEmptySelections,
                  selection =>
                    sendNetworkSelectionIdentity(selection) === value,
                )
                return SelectedSendNetwork.make({
                  selection: Option.getOrElse(maybeSelection, () =>
                    Array.headNonEmpty(nonEmptySelections),
                  ),
                })
              }),
            ],
            Array.map(nonEmptySelections, selection =>
              h.option(
                [h.Value(sendNetworkSelectionIdentity(selection))],
                [
                  sendNetworkSelectionLabel(
                    portfolio,
                    model.wallets,
                    selection,
                  ),
                ],
              ),
            ),
          ),
        ],
      )
    },
  })
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
    model.transferAmount._tag !== 'ValidTransferAmount' ||
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

const testFundingButtonLabel = (model: Model): string => {
  if (model.testFunding._tag === 'RequestingTestFunding') {
    return 'Requesting test funds…'
  } else if (model.transferAmount._tag !== 'ValidTransferAmount') {
    return 'Enter amount to request test funds'
  } else {
    return 'Request test funds'
  }
}

const sendMoney = (model: Model): Html => {
  const h = html<Message>()
  const maybePreview = maybePreviewForTransaction(model.transaction)
  const networkName = Option.match(primaryWalletNetwork(model), {
    onNone: () => 'selected network',
    onSome: network => network.displayName,
  })
  const maybeAsset = primaryWalletAsset(model)
  const amountSymbol = Option.match(maybeAsset, {
    onNone: () => 'Amount',
    onSome: asset => `Amount in ${asset.symbol}`,
  })
  const maybeAmountFailure = transferAmountFailure(model)
  const amountField = h.label(
    [h.Class('wallet-recipient'), h.For('wallet-amount')],
    [
      h.span([], [amountSymbol]),
      h.input([
        h.Id('wallet-amount'),
        h.Type('text'),
        h.Placeholder('0.00'),
        h.Value(transferAmountInput(model.transferAmount)),
        h.Disabled(model.transaction._tag === 'SubmittingTransaction'),
        h.OnInput(value => ChangedTransferAmount.make({ value })),
      ]),
    ],
  )
  const amountFailure = Option.match(maybeAmountFailure, {
    onNone: () => [],
    onSome: message => [
      h.p([h.Class('wallet-validation'), h.Role('alert')], [message]),
    ],
  })
  const recipientField = h.label(
    [h.Class('wallet-recipient'), h.For('wallet-recipient')],
    [
      h.span([], [`Recipient on ${networkName}`]),
      h.input([
        h.Id('wallet-recipient'),
        h.Type('text'),
        h.Placeholder('Recipient address'),
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
        [
          'Enter an exact amount and recipient. The selected adapter validates a network quote before anything is signed.',
        ],
      ),
    onSome: transactionPreview =>
      h.div(
        [h.Class('wallet-preview')],
        [
          h.div(
            [],
            [
              h.span([], ['To']),
              h.div(
                [h.Class('wallet-preview-value')],
                [
                  h.strong(
                    [],
                    [
                      shortenedAddress(
                        transactionPreview.transfer.recipient.displayAddress,
                      ),
                    ],
                  ),
                  copyAddressControl(
                    model,
                    transactionPreview.transfer.recipient.displayAddress,
                    'transfer-preview-recipient',
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
  const maybeExternalTestFunding = Option.flatMap(
    primaryWalletTestFundingMethod(model),
    method =>
      method._tag === 'ExternalTestFundingMethod'
        ? Option.some(method)
        : Option.none(),
  )
  const canRequestTestFunding = selectedNetworkHasCapability(
    model,
    'TestFunding',
  )
  const isTestFundingDisabled =
    model.testFunding._tag === 'RequestingTestFunding' ||
    model.transferAmount._tag !== 'ValidTransferAmount'
  const testFunding = canRequestTestFunding
    ? [
        h.div(
          [h.Class('wallet-funding')],
          [
            h.button(
              [
                h.Type('button'),
                h.Class('cardboard-button'),
                h.Disabled(isTestFundingDisabled),
                h.OnClick(RequestedTestFunding.make({})),
              ],
              [testFundingButtonLabel(model)],
            ),
            ...(model.testFunding._tag === 'ReceivedTestFunding'
              ? [
                  h.span(
                    [h.Role('status')],
                    [
                      `Received ${assetAmountLabelForModel(
                        model,
                        model.testFunding.receipt.amount,
                      )}`,
                    ],
                  ),
                ]
              : []),
          ],
        ),
      ]
    : []
  const externalTestFunding = Option.match(maybeExternalTestFunding, {
    onNone: () => [],
    onSome: method => [
      h.div(
        [h.Class('wallet-funding')],
        [
          h.a(
            [
              h.Class('cardboard-button'),
              h.Href(method.providerUrl),
              h.Target('_blank'),
              h.Rel('noopener noreferrer'),
            ],
            [`Open ${method.providerName}`],
          ),
          h.span(
            [],
            [
              'Copy this Wallet’s receiving address, then complete the provider-owned faucet flow.',
            ],
          ),
        ],
      ),
    ],
  })
  const testFundingFailure =
    model.testFunding._tag === 'FailedTestFunding' ||
    model.testFunding._tag === 'UnavailableTestFunding'
      ? [
          h.p(
            [h.Class('wallet-validation'), h.Role('alert')],
            [
              `Test funding failed: ${model.testFunding.failure.operation} · ${model.testFunding.failure.code}`,
            ],
          ),
        ]
      : []
  const transactionFailure =
    model.transaction._tag === 'FailedTransferValidation' ||
    model.transaction._tag === 'FailedTransactionPreview' ||
    model.transaction._tag === 'FailedTransactionSubmission'
      ? [
          h.p(
            [h.Class('wallet-validation'), h.Role('alert')],
            [
              `${model.transaction.failure.operation} failed: ${model.transaction.failure.code}`,
            ],
          ),
        ]
      : []
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
              h.h2(
                [],
                [
                  Option.match(maybeAsset, {
                    onNone: () => 'Select an asset',
                    onSome: asset => asset.symbol,
                  }),
                ],
              ),
            ],
          ),
          h.span(
            [h.Class('wallet-status')],
            [transactionStatus(model.transaction)],
          ),
        ],
      ),
      sendNetworkPicker(model),
      amountField,
      ...amountFailure,
      recipientField,
      ...validation,
      preview,
      ...testFunding,
      ...externalTestFunding,
      ...testFundingFailure,
      ...transactionFailure,
      ...confirmation,
      h.div([h.Class('wallet-action-row')], [sendButton(model)]),
    ],
  )
}

const activity = (model: Model): Html => {
  const h = html<Message>()
  const entries = Array.match(model.transactions, {
    onEmpty: () => [h.p([h.Class('wallet-empty')], ['No transactions found.'])],
    onNonEmpty: transactions => [
      h.ul(
        [],
        Array.map(transactions, transaction =>
          h.li(
            [h.Key(transaction.recordId)],
            [
              h.span([], [`${transaction.direction} · ${transaction.status}`]),
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
  const canLoadHistory = selectedNetworkHasCapability(
    model,
    'TransactionHistory',
  )
  const hasNextPage =
    model.transactionHistory._tag === 'LoadedTransactionHistory' &&
    Option.isSome(model.transactionHistory.maybeNextCursor)
  const observationFailure =
    model.transactionObservation._tag === 'FailedTransactionObservation'
      ? [
          h.div(
            [h.Class('wallet-validation'), h.Role('alert')],
            [
              h.p(
                [],
                [
                  `Live observation failed: ${model.transactionObservation.failure.code}`,
                ],
              ),
              h.button(
                [
                  h.Type('button'),
                  h.Class('cardboard-button'),
                  h.OnClick(ResumedTransactionObservation.make({})),
                ],
                ['Retry live observation'],
              ),
            ],
          ),
        ]
      : []
  const historyFailure =
    model.transactionHistory._tag === 'FailedTransactionHistory'
      ? [
          h.p(
            [h.Class('wallet-validation'), h.Role('alert')],
            [
              `History failed: ${model.transactionHistory.failure.operation} · ${model.transactionHistory.failure.code}`,
            ],
          ),
        ]
      : []
  const historyActions = canLoadHistory
    ? [
        h.div(
          [h.Class('wallet-action-row')],
          [
            h.button(
              [
                h.Type('button'),
                h.Class('cardboard-button'),
                h.Disabled(
                  model.transactionHistory._tag === 'LoadingTransactionHistory',
                ),
                h.OnClick(RequestedTransactionHistoryReload.make({})),
              ],
              ['Reload history'],
            ),
            h.button(
              [
                h.Type('button'),
                h.Class('cardboard-button'),
                h.Disabled(!hasNextPage),
                h.OnClick(RequestedNextTransactionHistoryPage.make({})),
              ],
              [hasNextPage ? 'Load next page' : 'No more history'],
            ),
          ],
        ),
      ]
    : [
        h.p(
          [h.Class('wallet-help')],
          ['Transaction history is unavailable for the selected network.'],
        ),
      ]
  return h.section(
    [h.Class('wallet-activity cardboard-panel')],
    [
      h.p([h.Class('cardboard-eyebrow')], ['Recent activity']),
      h.small([], [model.transactionObservation._tag]),
      ...observationFailure,
      ...historyFailure,
      ...entries,
      ...historyActions,
    ],
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
          h.div(
            [h.Class('wallet-address-line')],
            [
              h.code([], [account.address]),
              copyAddressControl(model, account.address, 'account-details'),
            ],
          ),
        ],
      }),
      ...Option.match(maybeReceiving, {
        onNone: () => [],
        onSome: instruction => [
          h.h3([], ['Receive']),
          h.div(
            [h.Class('wallet-address-line')],
            [
              h.code([], [instruction.destinationAddress]),
              copyAddressControl(
                model,
                instruction.destinationAddress,
                'receiving-address',
              ),
            ],
          ),
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
                'foldkit-wallet-access-challenge',
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
