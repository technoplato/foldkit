import { Array, Match as M, Option } from 'effect'
import { type Document, type Html, html } from 'foldkit/html'
import {
  ComposedTransfer,
  type CurrencyValue,
  type Message,
  type Model,
  RequestedChallengeSignature,
  RequestedSignedTransactionSubmission,
  RequestedWalletRefresh,
  SigningChallenge,
  type TransactionPreview,
  type TransactionState,
  TransferDraft,
} from 'wallet-core-example'

const cardClass =
  'rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60'
const primaryButtonClass =
  'rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-40'
const secondaryButtonClass =
  'rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-cyan-500 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-40'

const valueText = (value: CurrencyValue): string =>
  `${value.atomicUnits} ${value.currency._tag} atomic units (${value.decimalPlaces.toString()} decimals)`

const currencyKey = (value: CurrencyValue): string =>
  `${value.currency._tag}:${JSON.stringify(value.currency)}`

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

const portfolioView = (model: Model): Html => {
  const h = html<Message>()

  return M.value(model.portfolio).pipe(
    M.withReturnType<Html>(),
    M.tagsExhaustive({
      LoadingPortfolio: () =>
        h.p([h.Class('text-sm text-slate-500')], ['Loading public accounts…']),
      FailedPortfolio: ({ failure }) =>
        h.p(
          [h.Class('text-sm text-rose-700')],
          [`Portfolio failed: ${failure.operation}`],
        ),
      LoadedPortfolio: ({ snapshot }) =>
        h.div(
          [h.Class('grid gap-4 lg:grid-cols-2')],
          Array.map(snapshot.accounts, account => {
            const balances = Array.filter(
              snapshot.balanceSnapshot.balances,
              balance => balance.accountId === account.accountId,
            )
            const receivingInstructions = Array.filter(
              snapshot.receivingInstructions,
              instruction => instruction.accountId === account.accountId,
            )
            return h.article(
              [
                h.Key(account.accountId),
                h.Class('rounded-2xl border border-slate-200 bg-slate-50 p-5'),
              ],
              [
                h.p(
                  [
                    h.Class(
                      'text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700',
                    ),
                  ],
                  [account.network._tag],
                ),
                h.h3(
                  [h.Class('mt-2 text-lg font-semibold')],
                  [account.displayName],
                ),
                h.p(
                  [h.Class('mt-1 break-all font-mono text-xs text-slate-500')],
                  [account.address],
                ),
                h.ul(
                  [h.Class('mt-4 space-y-2')],
                  Array.map(balances, balance =>
                    h.li(
                      [
                        h.Key(
                          `${balance.accountId}:${currencyKey(balance.value)}`,
                        ),
                        h.Class(
                          'rounded-xl bg-white px-3 py-2 font-mono text-xs text-slate-700',
                        ),
                      ],
                      [valueText(balance.value)],
                    ),
                  ),
                ),
                h.div(
                  [h.Class('mt-4 space-y-3')],
                  Array.map(receivingInstructions, instruction =>
                    h.div(
                      [
                        h.Key(
                          `${instruction.accountId}:${JSON.stringify(instruction.currency)}`,
                        ),
                        h.Class(
                          'rounded-xl border border-dashed border-cyan-300 bg-cyan-50 p-3',
                        ),
                      ],
                      [
                        h.p(
                          [h.Class('text-xs font-semibold text-cyan-900')],
                          [`Receive ${instruction.currency._tag}`],
                        ),
                        h.p(
                          [
                            h.Class(
                              'mt-1 break-all font-mono text-xs text-cyan-800',
                            ),
                          ],
                          [`QR payload: ${instruction.portableUri}`],
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            )
          }),
        ),
    }),
  )
}

const maybeDemoTransfer = (model: Model): Option.Option<TransferDraft> => {
  if (model.portfolio._tag !== 'LoadedPortfolio') {
    return Option.none()
  }
  const snapshot = model.portfolio.snapshot
  const maybeAccount = Array.findFirst(
    snapshot.accounts,
    account => account.network._tag === 'EthereumSepolia',
  )
  if (Option.isNone(maybeAccount)) {
    return Option.none()
  }
  const account = maybeAccount.value
  const maybeBalance = Array.findFirst(
    snapshot.balanceSnapshot.balances,
    balance =>
      balance.accountId === account.accountId &&
      balance.value.currency._tag === 'Eth',
  )
  if (Option.isNone(maybeBalance)) {
    return Option.none()
  }
  return Option.some(
    TransferDraft.make({
      transferId: 'foldkit-demo-transfer',
      accountId: account.accountId,
      network: account.network,
      destinationAddress: '0x2222222222222222222222222222222222222222',
      value: {
        ...maybeBalance.value.value,
        atomicUnits: '100000000000000000',
      },
      maybeMessage: Option.some('Shared Foldkit Wallet demo'),
    }),
  )
}

const compositionButton = (model: Model): Html => {
  const h = html<Message>()
  const maybeDraft = maybeDemoTransfer(model)
  if (Option.isSome(maybeDraft)) {
    return h.button(
      [
        h.Type('button'),
        h.Class(secondaryButtonClass),
        h.OnClick(ComposedTransfer.make({ draft: maybeDraft.value })),
      ],
      ['Compose preset transfer'],
    )
  } else {
    return h.button(
      [h.Type('button'), h.Class(secondaryButtonClass), h.Disabled(true)],
      ['Compose preset transfer'],
    )
  }
}

const submissionButton = (model: Model): Html => {
  const h = html<Message>()
  if (model.transaction._tag === 'PreviewedTransaction') {
    return h.button(
      [
        h.Type('button'),
        h.Class(primaryButtonClass),
        h.OnClick(
          RequestedSignedTransactionSubmission.make({
            previewId: model.transaction.preview.previewId,
          }),
        ),
      ],
      ['Sign and submit'],
    )
  } else {
    return h.button(
      [h.Type('button'), h.Class(primaryButtonClass), h.Disabled(true)],
      ['Sign and submit'],
    )
  }
}

const transactionView = (model: Model): Html => {
  const h = html<Message>()
  const maybePreview = maybePreviewForTransaction(model.transaction)
  const preview = Option.isSome(maybePreview)
    ? h.div(
        [
          h.Class(
            'mt-4 grid gap-3 rounded-2xl bg-slate-950 p-5 text-sm text-slate-200 md:grid-cols-2',
          ),
        ],
        [
          h.p(
            [h.Class('break-all')],
            [`Destination: ${maybePreview.value.draft.destinationAddress}`],
          ),
          h.p([], [valueText(maybePreview.value.draft.value)]),
          h.p(
            [],
            [`Estimated fee: ${valueText(maybePreview.value.estimatedFee)}`],
          ),
          h.p(
            [],
            [
              `Resulting balance: ${valueText(maybePreview.value.resultingBalance)}`,
            ],
          ),
        ],
      )
    : h.p(
        [h.Class('mt-4 text-sm text-slate-500')],
        ['Compose the deterministic transfer to request a preview.'],
      )

  return h.section(
    [h.Class(cardClass)],
    [
      h.div(
        [h.Class('flex flex-wrap items-center justify-between gap-3')],
        [
          h.div(
            [],
            [
              h.p(
                [
                  h.Class(
                    'text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700',
                  ),
                ],
                ['Transaction composition'],
              ),
              h.h2(
                [h.Class('mt-2 text-2xl font-semibold')],
                ['Preview, sign, submit'],
              ),
            ],
          ),
          h.div(
            [h.Class('flex flex-wrap gap-2')],
            [compositionButton(model), submissionButton(model)],
          ),
        ],
      ),
      h.p(
        [h.Class('mt-5 text-sm text-slate-600')],
        [`State: ${model.transaction._tag}`],
      ),
      preview,
    ],
  )
}

const activityView = (model: Model): Html => {
  const h = html<Message>()
  const activity = Array.isReadonlyArrayEmpty(model.observedTransactions)
    ? [
        h.p(
          [h.Class('mt-4 text-sm text-slate-500')],
          ['Submit the preview to emit a simulated network observation.'],
        ),
      ]
    : [
        h.ul(
          [h.Class('mt-4 space-y-3')],
          Array.map(model.observedTransactions, transaction =>
            h.li(
              [
                h.Key(transaction.transactionId),
                h.Class('rounded-2xl border border-slate-200 bg-slate-50 p-4'),
              ],
              [
                h.p(
                  [h.Class('font-mono text-xs text-slate-500')],
                  [transaction.transactionId],
                ),
                h.p(
                  [h.Class('mt-2 text-sm font-semibold')],
                  [
                    `${transaction.direction} · ${transaction.status} · ${valueText(transaction.value)}`,
                  ],
                ),
              ],
            ),
          ),
        ),
      ]

  return h.section(
    [h.Class(cardClass)],
    [
      h.p(
        [
          h.Class(
            'text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700',
          ),
        ],
        ['Observed transaction stream'],
      ),
      h.h2(
        [h.Class('mt-2 text-2xl font-semibold')],
        [model.transactionObservation._tag],
      ),
      ...activity,
    ],
  )
}

const maybeChallenge = (model: Model): Option.Option<SigningChallenge> => {
  if (model.portfolio._tag !== 'LoadedPortfolio') {
    return Option.none()
  }
  return Array.findFirst(
    model.portfolio.snapshot.accounts,
    account => account.network._tag === 'EthereumSepolia',
  ).pipe(
    Option.map(account =>
      SigningChallenge.make({
        challengeId: 'foldkit-demo-challenge',
        accountId: account.accountId,
        digest: {
          algorithm: 'Keccak256',
          domain: 'foldkit.example.wallet',
          digestHex: '0x666f6c646b6974',
        },
      }),
    ),
  )
}

const signatureButton = (model: Model): Html => {
  const h = html<Message>()
  const challenge = maybeChallenge(model)
  if (Option.isSome(challenge)) {
    return h.button(
      [
        h.Type('button'),
        h.Class(secondaryButtonClass),
        h.OnClick(
          RequestedChallengeSignature.make({ challenge: challenge.value }),
        ),
      ],
      ['Sign canonical challenge'],
    )
  } else {
    return h.button(
      [h.Type('button'), h.Class(secondaryButtonClass), h.Disabled(true)],
      ['Sign canonical challenge'],
    )
  }
}

const signatureView = (model: Model): Html => {
  const h = html<Message>()
  const proof =
    model.signature._tag === 'SignedChallenge'
      ? h.p(
          [
            h.Class(
              'mt-4 break-all rounded-2xl bg-emerald-50 p-4 font-mono text-xs text-emerald-900',
            ),
          ],
          [
            `Verified proof: ${model.signature.proof._tag} · ${model.signature.proof.challengeId}`,
          ],
        )
      : h.p(
          [h.Class('mt-4 text-sm text-slate-500')],
          ['The simulated signer returns a public verified proof.'],
        )

  return h.section(
    [h.Class(cardClass)],
    [
      h.div(
        [h.Class('flex flex-wrap items-center justify-between gap-3')],
        [
          h.div(
            [],
            [
              h.p(
                [
                  h.Class(
                    'text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700',
                  ),
                ],
                ['Challenge signing'],
              ),
              h.h2(
                [h.Class('mt-2 text-2xl font-semibold')],
                [model.signature._tag],
              ),
            ],
          ),
          signatureButton(model),
        ],
      ),
      proof,
    ],
  )
}

/** Renders the complete public Wallet Model with ordinary Foldkit HTML. */
export const view = (model: Model): Document => {
  const h = html<Message>()

  return {
    title: 'Portable Wallet | Foldkit',
    body: h.main(
      [h.Class('min-h-screen bg-slate-100 px-5 py-10 text-slate-950')],
      [
        h.div(
          [h.Class('mx-auto max-w-6xl space-y-6')],
          [
            h.header(
              [
                h.Class(
                  'rounded-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-8 text-white shadow-xl shadow-cyan-950/20',
                ),
              ],
              [
                h.p(
                  [
                    h.Class(
                      'text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300',
                    ),
                  ],
                  ['Shared public Model · Foldkit host'],
                ),
                h.div(
                  [
                    h.Class(
                      'mt-3 flex flex-wrap items-end justify-between gap-4',
                    ),
                  ],
                  [
                    h.div(
                      [],
                      [
                        h.h1(
                          [h.Class('text-4xl font-semibold tracking-tight')],
                          ['Portable Wallet'],
                        ),
                        h.p(
                          [
                            h.Class(
                              'mt-2 max-w-2xl text-sm leading-6 text-slate-300',
                            ),
                          ],
                          [
                            'The canonical Wallet Program running through the ordinary Foldkit renderer and simulated Layer.',
                          ],
                        ),
                      ],
                    ),
                    h.button(
                      [
                        h.Type('button'),
                        h.Class(
                          'rounded-full bg-cyan-300 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-200',
                        ),
                        h.OnClick(RequestedWalletRefresh.make({})),
                      ],
                      ['Refresh wallet'],
                    ),
                  ],
                ),
              ],
            ),
            h.section(
              [h.Class(cardClass)],
              [
                h.h2(
                  [h.Class('mb-5 text-2xl font-semibold')],
                  ['Accounts and balances'],
                ),
                portfolioView(model),
              ],
            ),
            transactionView(model),
            h.div(
              [h.Class('grid gap-6 lg:grid-cols-2')],
              [activityView(model), signatureView(model)],
            ),
            h.section(
              [h.Class(cardClass)],
              [
                h.p(
                  [
                    h.Class(
                      'text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700',
                    ),
                  ],
                  ['Replay'],
                ),
                h.h2(
                  [h.Class('mt-2 text-2xl font-semibold')],
                  ['Foldkit DevTools'],
                ),
                h.p(
                  [h.Class('mt-3 text-sm leading-6 text-slate-600')],
                  [
                    'Inspect and time travel through the canonical Program journal with the Foldkit DevTools overlay.',
                  ],
                ),
              ],
            ),
          ],
        ),
      ],
    ),
  }
}
