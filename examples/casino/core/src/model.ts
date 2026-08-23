import { Array, Match as M, Option, Schema as S, String as Str } from 'effect'
import { NonEmptyString, PositiveInt } from 'foldkit/adt'
import { ts } from 'foldkit/schema'
import {
  AdapterTestFundingMethod,
  NetworkDescriptor,
  type PortfolioSnapshot,
  type TransactionRecord,
  WalletProfile,
} from 'wallet-core-example'

// ADT

/** Origin has not been probed, or a probe failed closed. */
export const OriginNotConnected = ts('NotConnected')
/** A live origin Command is in flight. */
export const OriginProbing = ts('Probing')
/** Stripe was probed and no charge secret is present. */
export const OriginStripeUnconfigured = ts('StripeUnconfigured')
/** A Stripe secret is present. This is not a live charge. */
export const OriginStripeConfigured = ts('StripeConfigured')
/** Stripe origin. DepositStripe is a live charge, not this. */
export const StripeOrigin = S.Union([
  OriginNotConnected,
  OriginProbing,
  OriginStripeUnconfigured,
  OriginStripeConfigured,
])
/** Stripe origin. */
export type StripeOrigin = typeof StripeOrigin.Type

/** Wallet origin while no live vault session is connected. */
export const WalletOrigin = S.Union([OriginNotConnected, OriginProbing])
/** Wallet origin while no live vault session is connected. */
export type WalletOrigin = typeof WalletOrigin.Type

/** Proof origin while the player is Unproven. */
export const ProofOrigin = S.Union([OriginNotConnected, OriginProbing])
/** Proof origin while the player is Unproven. */
export type ProofOrigin = typeof ProofOrigin.Type

/** No deposit has been made. */
export const DepositNone = ts('None', {
  stripeOrigin: StripeOrigin,
  walletOrigin: WalletOrigin,
})
/** Stripe live-charge session. Do not inhabit without a live charge. */
export const DepositStripe = ts('Stripe')
/** Wallet live vault session. Do not inhabit without a connected Live vault. */
export const DepositWallet = ts('Wallet', {
  accountId: S.String,
  address: S.String,
  wallets: S.NonEmptyArray(WalletProfile),
})
/** Money arrived. Do not inhabit without a real payment. */
export const DepositSettled = ts('Settled', {
  via: S.Literals(['Stripe', 'Wallet']),
})
/** In-progress unpaid rails. Settled lives on a paid table. */
export const UnpaidDeposit = S.Union([
  DepositNone,
  DepositStripe,
  DepositWallet,
])
/** In-progress unpaid rails. */
export type UnpaidDeposit = typeof UnpaidDeposit.Type
/** One deposit rail. Exclusive. */
export const Deposit = S.Union([
  DepositNone,
  DepositStripe,
  DepositWallet,
  DepositSettled,
])
/** One deposit rail. */
export type Deposit = typeof Deposit.Type

/** No credits. */
export const CreditsEmpty = ts('Empty')
/** Credits left after the one deposit. */
export const CreditsRemaining = ts('Remaining', { left: PositiveInt })
/** Credits spent to answer. Remaining only exists on a paid table. */
export const Credits = S.Union([CreditsEmpty, CreditsRemaining])
/** Credits spent to answer. */
export type Credits = typeof Credits.Type

/** Which rail produced the one settled deposit. */
export const DepositVia = S.Literals(['Stripe', 'Wallet'])
/** Which rail produced the one settled deposit. */
export type DepositVia = typeof DepositVia.Type

/** Credits granted by one settled deposit. */
export const creditsFromSettledDeposit: typeof PositiveInt.Type =
  PositiveInt.make(1)

/** A public-fact question. */
export const Question = ts('Question', {
  id: NonEmptyString,
  prompt: NonEmptyString,
})
/** A public-fact question. */
export type Question = typeof Question.Type

/** No questions defined. */
export const QuestionsEmpty = ts('Empty')
/** Questions defined in the Model. */
export const QuestionsPopulated = ts('Populated', {
  items: S.NonEmptyArray(Question),
})
/** Dynamic public-fact questions. */
export const Questions = S.Union([QuestionsEmpty, QuestionsPopulated])
/** Dynamic public-fact questions. */
export type Questions = typeof Questions.Type

/** No live proof. */
export const PlayerUnproven = ts('Unproven', {
  zkOrigin: ProofOrigin,
  humanityOrigin: ProofOrigin,
  agentOrigin: ProofOrigin,
})
/** ZK proof of real-world identity. Do not inhabit without a verifier. */
export const PlayerZkIdentity = ts('ZkIdentity')
/** Proof of humanity. Do not inhabit without a verifier. */
export const PlayerHumanity = ts('Humanity')
/** Autonomous agent that continuously cycles funds. Do not inhabit without a verifier. */
export const PlayerFundCyclingAgent = ts('FundCyclingAgent')
/** A live proof. Do not inhabit without a verifier success. */
export const ProvenPlayer = S.Union([
  PlayerZkIdentity,
  PlayerHumanity,
  PlayerFundCyclingAgent,
])
/** A live proof. */
export type ProvenPlayer = typeof ProvenPlayer.Type
/** Who may play. Exclusive. */
export const Player = S.Union([
  PlayerUnproven,
  PlayerZkIdentity,
  PlayerHumanity,
  PlayerFundCyclingAgent,
])
/** Who may play. */
export type Player = typeof Player.Type

/** Answering is closed. */
export const AnswerLocked = ts('Locked')
/** Answering is open. Requires settled credits and a live proof. */
export const AnswerOpen = ts('Open')
/** An answer was submitted. */
export const AnswerSubmitted = ts('Submitted')
/** Answer gate on a paid proven table. Locked is derived otherwise. */
export const ProvenAnswer = S.Union([AnswerOpen, AnswerSubmitted])
/** Answer gate on a paid proven table. */
export type ProvenAnswer = typeof ProvenAnswer.Type
/** Answer gate. */
export const Answer = S.Union([AnswerLocked, AnswerOpen, AnswerSubmitted])
/** Answer gate. */
export type Answer = typeof Answer.Type

/** Unpaid table. Credits are empty. Answer is locked. */
export const TableUnpaid = ts('Unpaid', {
  deposit: UnpaidDeposit,
  player: Player,
})
/** Settled deposit without a live proof. Answer is locked. */
export const TablePaidUnproven = ts('PaidUnproven', {
  via: DepositVia,
  credits: CreditsRemaining,
  player: PlayerUnproven,
})
/** Settled deposit with a live proof. Answer may be open. */
export const TablePaidProven = ts('PaidProven', {
  via: DepositVia,
  credits: CreditsRemaining,
  player: ProvenPlayer,
  answer: ProvenAnswer,
})
/** Deposit, credits, player, and answer as one exclusive table. */
export const Table = S.Union([TableUnpaid, TablePaidUnproven, TablePaidProven])
/** Deposit, credits, player, and answer as one exclusive table. */
export type Table = typeof Table.Type

/** No question draft. */
export const DraftIdle = ts('Idle')
/** Typing a question. */
export const Drafting = ts('Drafting', { text: S.String })
/** Question draft. */
export const Draft = S.Union([DraftIdle, Drafting])
/** Question draft. */
export type Draft = typeof Draft.Type

/** No notice. */
export const NoticeNone = ts('None')
/** A notice. */
export const NoticeSome = ts('Some', { text: NonEmptyString })
/** Transient notice. Command errors only. */
export const Notice = S.Union([NoticeNone, NoticeSome])
/** Transient notice. */
export type Notice = typeof Notice.Type

/** The Casino Model. */
export const Model = S.Struct({
  table: Table,
  questions: Questions,
  draft: Draft,
  notice: Notice,
})
/** The Casino Model. */
export type Model = typeof Model.Type

/** Product identity title printed by hosts that need a document title. */
export const title = 'Casino'

/** Existing wallets example. The crypto deposit path. */
export const walletHref = 'https://wallet.knophy.com'

/** Wallet catalog chain id for Solana. */
export const defaultChainId = 'solana'
/** Wallet catalog network id for Solana Devnet. */
export const defaultNetworkId = 'solana:devnet'
/** Wallet catalog asset id for native SOL on Devnet. */
export const defaultAssetId = 'solana:devnet:sol'

/** Solana Devnet network descriptor composed from wallet-core types. */
export const solanaDevnetNetwork = NetworkDescriptor.make({
  chainId: defaultChainId,
  networkId: defaultNetworkId,
  displayName: 'Solana Devnet',
  environment: 'Development',
  capabilities: [
    'Transfer',
    'TestFunding',
    'TransactionHistory',
    'TransactionObservation',
    'ChallengeSignature',
  ],
  testFundingMethod: AdapterTestFundingMethod.make({}),
})

/** Public SOL Devnet receive facts projected from a wallet portfolio. */
export const solDevnetReceive = (
  portfolio: PortfolioSnapshot,
): Option.Option<Readonly<{ accountId: string; address: string }>> => {
  const maybeInstruction = Array.findFirst(
    portfolio.receivingInstructions,
    item => item.assetId === defaultAssetId,
  )
  if (Option.isSome(maybeInstruction)) {
    return Option.some({
      accountId: maybeInstruction.value.accountId,
      address: maybeInstruction.value.destinationAddress,
    })
  }
  return Option.none()
}

/** True when a live adapter observed a confirmed Incoming SOL Devnet settlement. */
export const isConfirmedSolDevnetIncoming = (
  record: TransactionRecord,
): boolean =>
  record.direction === 'Incoming' &&
  record.networkId === defaultNetworkId &&
  record.amount.assetId === defaultAssetId &&
  record.status === 'Confirmed'

/** Public-fact deposit branches. Painted even while None. */
export const depositBranches = ['Stripe', 'Wallet'] as const

/** Public-fact player branches. Painted even while Unproven. */
export const playerBranches = [
  'ZkIdentity',
  'Humanity',
  'FundCyclingAgent',
] as const

const unpaidNone = (): typeof DepositNone.Type =>
  DepositNone.make({
    stripeOrigin: OriginNotConnected(),
    walletOrigin: OriginNotConnected(),
  })

const unprovenPlayer = (): typeof PlayerUnproven.Type =>
  PlayerUnproven.make({
    zkOrigin: OriginNotConnected(),
    humanityOrigin: OriginNotConnected(),
    agentOrigin: OriginNotConnected(),
  })

const unpaidTable = (
  deposit: UnpaidDeposit,
  player: Player,
): typeof TableUnpaid.Type => TableUnpaid.make({ deposit, player })

/** Honest unpaid, unproven public-fact start. */
export const emptyModel = (): Model =>
  Model.make({
    table: unpaidTable(unpaidNone(), unprovenPlayer()),
    questions: QuestionsEmpty(),
    draft: DraftIdle(),
    notice: NoticeNone(),
  })

/** Deposit rail projected from the table. */
export const depositOf = (model: Model): Deposit => {
  if (model.table._tag === 'Unpaid') {
    return model.table.deposit
  }
  return DepositSettled.make({ via: model.table.via })
}

/** Credits projected from the table. Remaining only after settlement. */
export const creditsOf = (model: Model): Credits => {
  if (model.table._tag === 'Unpaid') {
    return CreditsEmpty()
  }
  return model.table.credits
}

/** Player projected from the table. */
export const playerOf = (model: Model): Player => model.table.player

/** Answer projected from the table. Open only when paid and proven. */
export const answerOf = (model: Model): Answer => {
  if (model.table._tag === 'PaidProven') {
    return model.table.answer
  }
  return AnswerLocked()
}

/** Stripe origin phase painted on the screen. */
export const stripePhaseOf = (model: Model): string => {
  if (
    model.table._tag === 'PaidUnproven' ||
    model.table._tag === 'PaidProven'
  ) {
    if (model.table.via === 'Stripe') {
      return 'connected'
    }
    return 'not-connected'
  }
  if (model.table.deposit._tag === 'Stripe') {
    return 'connected'
  }
  if (model.table.deposit._tag === 'None') {
    return stripeOriginPhase(model.table.deposit.stripeOrigin)
  }
  return 'not-connected'
}

/** Wallet origin phase painted on the screen. */
export const walletPhaseOf = (model: Model): string => {
  if (
    model.table._tag === 'PaidUnproven' ||
    model.table._tag === 'PaidProven'
  ) {
    if (model.table.via === 'Wallet') {
      return 'connected'
    }
    return 'not-connected'
  }
  if (model.table.deposit._tag === 'Wallet') {
    return 'connected'
  }
  if (model.table.deposit._tag === 'None') {
    return walletOriginPhase(model.table.deposit.walletOrigin)
  }
  return 'not-connected'
}

/** ZK origin phase painted on the screen. */
export const zkPhaseOf = (model: Model): string =>
  proofPhase(playerOf(model), 'zkOrigin', 'ZkIdentity')

/** Humanity origin phase painted on the screen. */
export const humanityPhaseOf = (model: Model): string =>
  proofPhase(playerOf(model), 'humanityOrigin', 'Humanity')

/** Fund-cycling agent origin phase painted on the screen. */
export const agentPhaseOf = (model: Model): string =>
  proofPhase(playerOf(model), 'agentOrigin', 'FundCyclingAgent')

const stripeOriginPhase = (origin: StripeOrigin): string =>
  M.value(origin).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      NotConnected: () => 'not-connected',
      Probing: () => 'probing',
      StripeUnconfigured: () => 'stripe-unconfigured',
      StripeConfigured: () => 'stripe-configured',
    }),
  )

const walletOriginPhase = (origin: WalletOrigin): string =>
  M.value(origin).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      NotConnected: () => 'not-connected',
      Probing: () => 'probing',
    }),
  )

const proofPhase = (
  player: Player,
  originField: 'zkOrigin' | 'humanityOrigin' | 'agentOrigin',
  provenTag: ProvenPlayer['_tag'],
): string => {
  if (player._tag === provenTag) {
    return 'connected'
  }
  if (player._tag !== 'Unproven') {
    return 'not-connected'
  }
  const origin = player[originField]
  if (origin._tag === 'Probing') {
    return 'probing'
  }
  return 'not-connected'
}

/** True when the unpaid rail is still None. */
export const isUnpaidNone = (model: Model): boolean =>
  model.table._tag === 'Unpaid' && model.table.deposit._tag === 'None'

/** True when a live wallet session is connected and unpaid. */
export const isUnpaidWallet = (model: Model): boolean =>
  model.table._tag === 'Unpaid' && model.table.deposit._tag === 'Wallet'

/** True when Stripe origin is currently probing. */
export const isStripeProbing = (model: Model): boolean => {
  if (model.table._tag !== 'Unpaid' || model.table.deposit._tag !== 'None') {
    return false
  }
  return model.table.deposit.stripeOrigin._tag === 'Probing'
}

/** True when Wallet origin is currently probing. */
export const isWalletProbing = (model: Model): boolean => {
  if (model.table._tag !== 'Unpaid' || model.table.deposit._tag !== 'None') {
    return false
  }
  return model.table.deposit.walletOrigin._tag === 'Probing'
}

/** True when the player is Unproven. */
export const isPlayerUnproven = (model: Model): boolean =>
  playerOf(model)._tag === 'Unproven'

/** True when a named proof origin is probing. */
export const isProofProbing = (
  model: Model,
  originField: 'zkOrigin' | 'humanityOrigin' | 'agentOrigin',
): boolean => {
  const player = playerOf(model)
  if (player._tag !== 'Unproven') {
    return false
  }
  return player[originField]._tag === 'Probing'
}

const replaceUnpaidDeposit = (model: Model, deposit: UnpaidDeposit): Model => {
  if (model.table._tag !== 'Unpaid') {
    return model
  }
  return Model.make({
    ...model,
    table: unpaidTable(deposit, model.table.player),
  })
}

const replacePlayer = (model: Model, player: Player): Model => {
  if (model.table._tag === 'Unpaid') {
    return Model.make({
      ...model,
      table: unpaidTable(model.table.deposit, player),
    })
  }
  if (model.table._tag === 'PaidUnproven') {
    if (player._tag !== 'Unproven') {
      return Model.make({
        ...model,
        table: TablePaidProven.make({
          via: model.table.via,
          credits: model.table.credits,
          player,
          answer: AnswerOpen(),
        }),
      })
    }
    return Model.make({
      ...model,
      table: TablePaidUnproven.make({
        via: model.table.via,
        credits: model.table.credits,
        player,
      }),
    })
  }
  if (player._tag === 'Unproven') {
    return model
  }
  return Model.make({
    ...model,
    table: TablePaidProven.make({
      via: model.table.via,
      credits: model.table.credits,
      player,
      answer: model.table.answer,
    }),
  })
}

/** Starts Stripe origin probing on an unpaid None table. */
export const withStripeProbing = (model: Model): Model => {
  if (!isUnpaidNone(model) || model.table._tag !== 'Unpaid') {
    return model
  }
  if (model.table.deposit._tag !== 'None') {
    return model
  }
  return replaceUnpaidDeposit(
    model,
    DepositNone.make({
      stripeOrigin: OriginProbing(),
      walletOrigin: model.table.deposit.walletOrigin,
    }),
  )
}

/** Records a Stripe origin after a live probe. Does not inhabit DepositStripe. */
export const withStripeOrigin = (
  model: Model,
  stripeOrigin: StripeOrigin,
): Model => {
  if (!isUnpaidNone(model) || model.table._tag !== 'Unpaid') {
    return model
  }
  if (model.table.deposit._tag !== 'None') {
    return model
  }
  return replaceUnpaidDeposit(
    model,
    DepositNone.make({
      stripeOrigin,
      walletOrigin: model.table.deposit.walletOrigin,
    }),
  )
}

/** Starts Wallet origin probing on an unpaid None table. */
export const withWalletProbing = (model: Model): Model => {
  if (!isUnpaidNone(model) || model.table._tag !== 'Unpaid') {
    return model
  }
  if (model.table.deposit._tag !== 'None') {
    return model
  }
  return replaceUnpaidDeposit(
    model,
    DepositNone.make({
      stripeOrigin: model.table.deposit.stripeOrigin,
      walletOrigin: OriginProbing(),
    }),
  )
}

/** Fail-closes Wallet origin as not-connected. Does not inhabit Wallet or Settled. */
export const withWalletNotConnected = (model: Model): Model => {
  if (model.table._tag !== 'Unpaid') {
    return model
  }
  if (model.table.deposit._tag === 'Wallet') {
    return replaceUnpaidDeposit(
      model,
      DepositNone.make({
        stripeOrigin: OriginNotConnected(),
        walletOrigin: OriginNotConnected(),
      }),
    )
  }
  if (model.table.deposit._tag !== 'None') {
    return model
  }
  return replaceUnpaidDeposit(
    model,
    DepositNone.make({
      stripeOrigin: model.table.deposit.stripeOrigin,
      walletOrigin: OriginNotConnected(),
    }),
  )
}

/** Inhabits DepositWallet only while a live receive session is connected. */
export const withWalletConnected = (
  model: Model,
  receive: Readonly<{
    accountId: string
    address: string
    wallets: (typeof DepositWallet.Type)['wallets']
  }>,
): Model => {
  if (model.table._tag !== 'Unpaid') {
    return model
  }
  return replaceUnpaidDeposit(
    withoutNotice(model),
    DepositWallet.make({
      accountId: receive.accountId,
      address: receive.address,
      wallets: receive.wallets,
    }),
  )
}

/** Settles the one wallet deposit after a confirmed incoming observation. */
export const withSettledWallet = (model: Model): Model => {
  if (model.table._tag !== 'Unpaid' || model.table.deposit._tag !== 'Wallet') {
    return model
  }
  const credits = CreditsRemaining.make({ left: creditsFromSettledDeposit })
  const player = model.table.player
  if (player._tag === 'Unproven') {
    return Model.make({
      ...withoutNotice(model),
      table: TablePaidUnproven.make({
        via: 'Wallet',
        credits,
        player,
      }),
    })
  }
  return Model.make({
    ...withoutNotice(model),
    table: TablePaidProven.make({
      via: 'Wallet',
      credits,
      player,
      answer: AnswerOpen(),
    }),
  })
}

/** Starts a proof origin probe while the player is Unproven. */
export const withProofProbing = (
  model: Model,
  originField: 'zkOrigin' | 'humanityOrigin' | 'agentOrigin',
): Model => {
  const player = playerOf(model)
  if (player._tag !== 'Unproven') {
    return model
  }
  return replacePlayer(
    model,
    PlayerUnproven.make({
      ...player,
      [originField]: OriginProbing(),
    }),
  )
}

/** Fail-closes a proof origin as not-connected. Does not inhabit a proven player. */
export const withProofNotConnected = (
  model: Model,
  originField: 'zkOrigin' | 'humanityOrigin' | 'agentOrigin',
): Model => {
  const player = playerOf(model)
  if (player._tag !== 'Unproven') {
    return model
  }
  return replacePlayer(
    model,
    PlayerUnproven.make({
      ...player,
      [originField]: OriginNotConnected(),
    }),
  )
}

/** Inhabits a proven player only after a live verifier success. */
export const withProvenPlayer = (model: Model, player: ProvenPlayer): Model =>
  replacePlayer(model, player)

/** Init probing for Stripe and proof origins. Wallet waits for a click. */
export const withInitProbing = (model: Model): Model => {
  const probingProofs = PlayerUnproven.make({
    zkOrigin: OriginProbing(),
    humanityOrigin: OriginProbing(),
    agentOrigin: OriginProbing(),
  })
  if (model.table._tag !== 'Unpaid' || model.table.deposit._tag !== 'None') {
    return model
  }
  return Model.make({
    ...model,
    table: unpaidTable(
      DepositNone.make({
        stripeOrigin: OriginProbing(),
        walletOrigin: model.table.deposit.walletOrigin,
      }),
      probingProofs,
    ),
  })
}

/** Clears a notice. */
export const withoutNotice = (model: Model): Model =>
  Model.make({
    ...model,
    notice: NoticeNone(),
  })

/** Sets a notice. Does not inhabit paid or proven states. */
export const withNotice = (model: Model, text: string): Model =>
  Model.make({
    ...model,
    notice: NoticeSome.make({ text: NonEmptyString.make(text) }),
  })

/** Questions of a populated shelf. */
export const itemsOf = (
  questions: typeof QuestionsPopulated.Type,
): ReadonlyArray<Question> => questions.items

/** Next question id. Derived from shelf size. */
export const nextQuestionId = (questions: Questions): Question['id'] => {
  const n = questions._tag === 'Empty' ? 1 : questions.items.length + 1
  return NonEmptyString.make(`q:${String(n)}`)
}

/** Adds a public-fact question. Empty becomes Populated. */
export const withQuestion = (model: Model, question: Question): Model => {
  if (model.questions._tag === 'Empty') {
    return Model.make({
      ...model,
      questions: QuestionsPopulated.make({ items: [question] }),
      draft: DraftIdle(),
    })
  }
  return Model.make({
    ...model,
    questions: QuestionsPopulated.make({
      items: Array.append(model.questions.items, question),
    }),
    draft: DraftIdle(),
  })
}

/** Removes a question by id. Last member returns Empty. */
export const withoutQuestion = (
  model: Model,
  questionId: Question['id'],
): Model => {
  if (model.questions._tag === 'Empty') {
    return model
  }
  const kept = Array.filter(
    model.questions.items,
    item => item.id !== questionId,
  )
  return Array.match(kept, {
    onEmpty: () =>
      Model.make({
        ...model,
        questions: QuestionsEmpty(),
      }),
    onNonEmpty: items =>
      Model.make({
        ...model,
        questions: QuestionsPopulated.make({ items }),
      }),
  })
}

/** Finds a question by id. */
export const findQuestion = (
  items: ReadonlyArray<Question>,
  questionId: Question['id'],
): Option.Option<Question> =>
  Array.findFirst(items, item => item.id === questionId)

/** Draft text is present. */
export const hasDraftText = (draft: Draft): boolean =>
  draft._tag === 'Drafting' && !Str.isEmpty(draft.text)
