import {
  Array,
  Effect,
  Match as M,
  Option,
  Schema as S,
  String as Str,
} from 'effect'
import { Command } from 'foldkit'
import { NonEmptyString } from 'foldkit/adt'
import {
  NetworkFailure,
  type PortfolioSnapshot,
  WalletClient,
  WalletClientError,
  WalletCreationRequest,
  WalletFailure,
  WalletProfile,
  WalletVault,
  nextWalletCreationRequest,
} from 'wallet-core-example'

import {
  type CasinoResources,
  ProofVerifier,
  StripeOriginCheck,
} from './casinoClient.js'
import {
  FailedCreateWallet,
  FailedLoadPortfolio,
  FailedLoadProfiles,
  FailedProbeFundCyclingAgent,
  FailedProbeHumanity,
  FailedProbeStripe,
  FailedProbeZkIdentity,
  FoundFundCyclingAgentNotConnected,
  FoundHumanityNotConnected,
  FoundStripeConfigured,
  FoundStripeUnconfigured,
  FoundZkNotConnected,
  type Message,
  SucceededCreateWallet,
  SucceededFundCyclingAgent,
  SucceededHumanity,
  SucceededLoadPortfolio,
  SucceededLoadProfiles,
  SucceededZkIdentity,
} from './message.js'
import {
  DraftIdle,
  Drafting,
  Model,
  OriginNotConnected,
  OriginStripeConfigured,
  OriginStripeUnconfigured,
  PlayerFundCyclingAgent,
  PlayerHumanity,
  PlayerZkIdentity,
  Question,
  isConfirmedSolDevnetIncoming,
  isPlayerUnproven,
  isUnpaidNone,
  isUnpaidWallet,
  nextQuestionId,
  solDevnetReceive,
  solanaDevnetNetwork,
  withNotice,
  withProofNotConnected,
  withProofProbing,
  withProvenPlayer,
  withQuestion,
  withSettledWallet,
  withStripeOrigin,
  withStripeProbing,
  withWalletConnected,
  withWalletNotConnected,
  withWalletProbing,
  withoutNotice,
  withoutQuestion,
} from './model.js'

type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, CasinoResources>>,
]

const withUpdateReturn = M.withReturnType<UpdateReturn>()

const unavailable = NonEmptyString.make('Unavailable')

const toNetworkFailure = (
  operation: 'LoadPortfolio' | 'ObserveTransactions',
  error: WalletClientError,
): WalletFailure => NetworkFailure.make({ operation, code: error.code })

const createRequestFor = (
  wallets: ReadonlyArray<WalletProfile>,
): WalletCreationRequest =>
  nextWalletCreationRequest(wallets, [solanaDevnetNetwork])

const loadOrCreate = (
  wallets: ReadonlyArray<WalletProfile>,
): ReadonlyArray<Command.Command<Message, never, CasinoResources>> =>
  Array.match(wallets, {
    onEmpty: () => [CreateCasinoWallet({ request: createRequestFor(wallets) })],
    onNonEmpty: nonEmpty => [LoadCasinoPortfolio({ wallets: nonEmpty })],
  })

const connectFromPortfolio = (
  model: Model,
  wallets: ReadonlyArray<WalletProfile>,
  portfolio: PortfolioSnapshot,
): Model =>
  Array.match(wallets, {
    onEmpty: () =>
      withNotice(withWalletNotConnected(model), 'wallet receive unavailable'),
    onNonEmpty: nonEmpty => {
      const maybeReceive = solDevnetReceive(portfolio)
      if (Option.isNone(maybeReceive)) {
        return withNotice(
          withWalletNotConnected(model),
          'wallet receive unavailable',
        )
      }
      return withWalletConnected(model, {
        accountId: maybeReceive.value.accountId,
        address: maybeReceive.value.address,
        wallets: nonEmpty,
      })
    },
  })

const failWallet = (model: Model, text: string): UpdateReturn => [
  withNotice(withWalletNotConnected(model), text),
  [],
]

const failProof = (
  model: Model,
  originField: 'zkOrigin' | 'humanityOrigin' | 'agentOrigin',
  text: string,
): UpdateReturn => [
  withNotice(withProofNotConnected(model, originField), text),
  [],
]

/** Probes whether a Stripe charge secret is present. Never reads the secret. */
export const ProbeStripe = Command.define(
  'ProbeStripe',
  FoundStripeUnconfigured,
  FoundStripeConfigured,
  FailedProbeStripe,
)(
  StripeOriginCheck.pipe(
    Effect.flatMap(origin => origin.probe),
    Effect.map(probe =>
      M.value(probe).pipe(
        M.tagsExhaustive({
          Unconfigured: () => FoundStripeUnconfigured(),
          Configured: () => FoundStripeConfigured(),
        }),
      ),
    ),
    Effect.catch(() =>
      Effect.succeed(FailedProbeStripe.make({ code: unavailable })),
    ),
  ),
)

/** Restores public Wallet profiles from the injected Live vault. */
export const LoadCasinoWallet = Command.define(
  'LoadCasinoWallet',
  SucceededLoadProfiles,
  FailedLoadProfiles,
)(
  WalletVault.pipe(
    Effect.flatMap(vault => vault.loadWallets),
    Effect.map(wallets => SucceededLoadProfiles.make({ wallets })),
    Effect.catch(error =>
      Effect.succeed(FailedLoadProfiles.make({ code: error.code })),
    ),
  ),
)

/** Creates one Wallet profile for Solana Devnet receive. */
export const CreateCasinoWallet = Command.define(
  'CreateCasinoWallet',
  { request: WalletCreationRequest },
  SucceededCreateWallet,
  FailedCreateWallet,
)(({ request }) =>
  WalletVault.pipe(
    Effect.flatMap(vault => vault.createWallet(request)),
    Effect.map(wallet => SucceededCreateWallet.make({ wallet })),
    Effect.catch(error =>
      Effect.succeed(FailedCreateWallet.make({ code: error.code })),
    ),
  ),
)

/** Loads a public portfolio through the injected Wallet client. */
export const LoadCasinoPortfolio = Command.define(
  'LoadCasinoPortfolio',
  { wallets: S.Array(WalletProfile) },
  SucceededLoadPortfolio,
  FailedLoadPortfolio,
)(({ wallets }) =>
  WalletClient.pipe(
    Effect.flatMap(client => client.loadPortfolio(wallets)),
    Effect.map(portfolio =>
      SucceededLoadPortfolio.make({ wallets, portfolio }),
    ),
    Effect.catch(error =>
      Effect.succeed(
        FailedLoadPortfolio.make({
          failure: toNetworkFailure('LoadPortfolio', error),
        }),
      ),
    ),
  ),
)

/** Probes for a live ZK identity verifier. Never stubs success. */
export const ProbeZkIdentity = Command.define(
  'ProbeZkIdentity',
  FoundZkNotConnected,
  SucceededZkIdentity,
  FailedProbeZkIdentity,
)(
  ProofVerifier.pipe(
    Effect.flatMap(verifier => verifier.probe('ZkIdentity')),
    Effect.map(probe =>
      M.value(probe).pipe(
        M.tagsExhaustive({
          Verified: () => SucceededZkIdentity(),
          NotConnected: () => FoundZkNotConnected(),
        }),
      ),
    ),
    Effect.catch(() =>
      Effect.succeed(FailedProbeZkIdentity.make({ code: unavailable })),
    ),
  ),
)

/** Probes for a live humanity verifier. Never stubs success. */
export const ProbeHumanity = Command.define(
  'ProbeHumanity',
  FoundHumanityNotConnected,
  SucceededHumanity,
  FailedProbeHumanity,
)(
  ProofVerifier.pipe(
    Effect.flatMap(verifier => verifier.probe('Humanity')),
    Effect.map(probe =>
      M.value(probe).pipe(
        M.tagsExhaustive({
          Verified: () => SucceededHumanity(),
          NotConnected: () => FoundHumanityNotConnected(),
        }),
      ),
    ),
    Effect.catch(() =>
      Effect.succeed(FailedProbeHumanity.make({ code: unavailable })),
    ),
  ),
)

/** Probes for a live fund-cycling agent verifier. Never stubs success. */
export const ProbeFundCyclingAgent = Command.define(
  'ProbeFundCyclingAgent',
  FoundFundCyclingAgentNotConnected,
  SucceededFundCyclingAgent,
  FailedProbeFundCyclingAgent,
)(
  ProofVerifier.pipe(
    Effect.flatMap(verifier => verifier.probe('FundCyclingAgent')),
    Effect.map(probe =>
      M.value(probe).pipe(
        M.tagsExhaustive({
          Verified: () => SucceededFundCyclingAgent(),
          NotConnected: () => FoundFundCyclingAgentNotConnected(),
        }),
      ),
    ),
    Effect.catch(() =>
      Effect.succeed(FailedProbeFundCyclingAgent.make({ code: unavailable })),
    ),
  ),
)

/** Applies one Casino Message to the current Model. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      ClickedStripe: () => {
        if (!isUnpaidNone(model)) {
          return [model, []]
        }
        return [withStripeProbing(model), [ProbeStripe()]]
      },
      ClickedWallet: () => {
        if (!isUnpaidNone(model)) {
          return [model, []]
        }
        return [withWalletProbing(model), [LoadCasinoWallet()]]
      },
      ClickedZkIdentity: () => {
        if (!isPlayerUnproven(model)) {
          return [model, []]
        }
        return [withProofProbing(model, 'zkOrigin'), [ProbeZkIdentity()]]
      },
      ClickedHumanity: () => {
        if (!isPlayerUnproven(model)) {
          return [model, []]
        }
        return [withProofProbing(model, 'humanityOrigin'), [ProbeHumanity()]]
      },
      ClickedFundCyclingAgent: () => {
        if (!isPlayerUnproven(model)) {
          return [model, []]
        }
        return [
          withProofProbing(model, 'agentOrigin'),
          [ProbeFundCyclingAgent()],
        ]
      },
      ClickedAddQuestion: () => [
        Model.make({
          ...model,
          draft: Drafting.make({ text: '' }),
        }),
        [],
      ],
      TypedDraft: typed => [
        Model.make({
          ...model,
          draft: Drafting.make({ text: typed.text }),
        }),
        [],
      ],
      AppliedDraft: () => {
        if (model.draft._tag !== 'Drafting') {
          return [model, []]
        }
        const prompt = Str.trim(model.draft.text)
        if (Str.isEmpty(prompt)) {
          return [model, []]
        }
        return [
          withQuestion(
            withoutNotice(model),
            Question.make({
              id: nextQuestionId(model.questions),
              prompt: NonEmptyString.make(prompt),
            }),
          ),
          [],
        ]
      },
      CancelledDraft: () => [
        Model.make({
          ...model,
          draft: DraftIdle(),
        }),
        [],
      ],
      RequestedRemove: requested => [
        withoutQuestion(model, requested.questionId),
        [],
      ],
      DismissedNotice: () => [withoutNotice(model), []],
      FoundStripeUnconfigured: () => [
        withStripeOrigin(withoutNotice(model), OriginStripeUnconfigured()),
        [],
      ],
      FoundStripeConfigured: () => [
        withStripeOrigin(withoutNotice(model), OriginStripeConfigured()),
        [],
      ],
      FailedProbeStripe: failed => [
        withNotice(withStripeOrigin(model, OriginNotConnected()), failed.code),
        [],
      ],
      SucceededLoadProfiles: ({ wallets }) => [model, loadOrCreate(wallets)],
      FailedLoadProfiles: ({ code }) => failWallet(model, code),
      SucceededCreateWallet: ({ wallet }) => [
        model,
        [LoadCasinoPortfolio({ wallets: [wallet] })],
      ],
      FailedCreateWallet: ({ code }) => failWallet(model, code),
      SucceededLoadPortfolio: ({ wallets, portfolio }) => [
        connectFromPortfolio(model, wallets, portfolio),
        [],
      ],
      FailedLoadPortfolio: ({ failure }) => failWallet(model, failure.code),
      ObservedIncoming: ({ transaction }) => {
        if (!isUnpaidWallet(model)) {
          return [model, []]
        }
        if (!isConfirmedSolDevnetIncoming(transaction)) {
          return [model, []]
        }
        return [withSettledWallet(model), []]
      },
      FailedObserveIncoming: ({ failure }) => [
        withNotice(model, failure.code),
        [],
      ],
      FoundZkNotConnected: () => [
        withoutNotice(withProofNotConnected(model, 'zkOrigin')),
        [],
      ],
      SucceededZkIdentity: () => [
        withoutNotice(withProvenPlayer(model, PlayerZkIdentity())),
        [],
      ],
      FailedProbeZkIdentity: failed =>
        failProof(model, 'zkOrigin', failed.code),
      FoundHumanityNotConnected: () => [
        withoutNotice(withProofNotConnected(model, 'humanityOrigin')),
        [],
      ],
      SucceededHumanity: () => [
        withoutNotice(withProvenPlayer(model, PlayerHumanity())),
        [],
      ],
      FailedProbeHumanity: failed =>
        failProof(model, 'humanityOrigin', failed.code),
      FoundFundCyclingAgentNotConnected: () => [
        withoutNotice(withProofNotConnected(model, 'agentOrigin')),
        [],
      ],
      SucceededFundCyclingAgent: () => [
        withoutNotice(withProvenPlayer(model, PlayerFundCyclingAgent())),
        [],
      ],
      FailedProbeFundCyclingAgent: failed =>
        failProof(model, 'agentOrigin', failed.code),
    }),
  )
