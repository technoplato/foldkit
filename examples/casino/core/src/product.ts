import { Array, Match as M } from 'effect'
import { Button, Column, Row, Text, type UiNode } from 'foldkit/renderers'

import { actions, tokenOf } from './message.js'
import {
  type Answer,
  type Credits,
  type Draft,
  type Model,
  type Notice,
  type Questions,
  agentPhaseOf,
  answerOf,
  creditsOf,
  depositBranches,
  depositOf,
  humanityPhaseOf,
  playerBranches,
  playerOf,
  stripePhaseOf,
  title,
  walletHref,
  walletPhaseOf,
  zkPhaseOf,
} from './model.js'

const depositNodes = (model: Model): ReadonlyArray<UiNode> => {
  const deposit = depositOf(model)
  return [
    ...M.value(deposit).pipe(
      M.withReturnType<ReadonlyArray<UiNode>>(),
      M.tagsExhaustive({
        None: () => [Text('None')],
        Stripe: () => [Text('Stripe')],
        Wallet: wallet => [Text('Wallet'), Text(wallet.address)],
        Settled: settled => [Text('Settled'), Text(settled.via)],
      }),
    ),
    Text('stripe-origin'),
    Text(stripePhaseOf(model)),
    Text('wallet-origin'),
    Text(walletPhaseOf(model)),
    ...Array.map(depositBranches, branch => Text(branch)),
    Text('wallet.knophy.com', { href: walletHref }),
  ]
}

const creditsNodes = (credits: Credits): ReadonlyArray<UiNode> =>
  M.value(credits).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Empty: () => [Text('Empty')],
      Remaining: remaining => [Text('Remaining'), Text(String(remaining.left))],
    }),
  )

const questionsNodes = (questions: Questions): ReadonlyArray<UiNode> =>
  M.value(questions).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Empty: () => [Text('Empty')],
      Populated: populated => [
        Text('Populated'),
        ...Array.map(populated.items, item => Text(item.prompt)),
      ],
    }),
  )

const playerNodes = (model: Model): ReadonlyArray<UiNode> => {
  const player = playerOf(model)
  return [
    ...M.value(player).pipe(
      M.withReturnType<ReadonlyArray<UiNode>>(),
      M.tagsExhaustive({
        Unproven: () => [Text('Unproven')],
        ZkIdentity: () => [Text('ZkIdentity')],
        Humanity: () => [Text('Humanity')],
        FundCyclingAgent: () => [Text('FundCyclingAgent')],
      }),
    ),
    Text('zk-origin'),
    Text(zkPhaseOf(model)),
    Text('humanity-origin'),
    Text(humanityPhaseOf(model)),
    Text('agent-origin'),
    Text(agentPhaseOf(model)),
    ...Array.map(playerBranches, branch => Text(branch)),
  ]
}

const answerNodes = (answer: Answer): ReadonlyArray<UiNode> =>
  M.value(answer).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Locked: () => [Text('Locked')],
      Open: () => [Text('Open')],
      Submitted: () => [Text('Submitted')],
    }),
  )

const draftNodes = (draft: Draft): ReadonlyArray<UiNode> =>
  M.value(draft).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Idle: () => [Text('Idle')],
      Drafting: drafting => [Text('Drafting'), Text(drafting.text)],
    }),
  )

const noticeNodes = (notice: Notice): ReadonlyArray<UiNode> =>
  M.value(notice).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      None: () => [],
      Some: some => [Text('Some'), Text(some.text)],
    }),
  )

const removeButtons = (questions: Questions): ReadonlyArray<UiNode> => {
  if (questions._tag === 'Empty') {
    return []
  }
  return Array.map(questions.items, item =>
    Button({
      token: `remove:${item.id}`,
      label: 'remove',
    }),
  )
}

/** Product tree: one screen. Clients only paint this tree. */
export const productView = (model: Model): UiNode => {
  const buttons = Array.map(
    Array.filter(actions, action => action.valid(model, {})),
    action =>
      Button({
        token: tokenOf(action),
        label: tokenOf(action),
      }),
  )
  return Column(
    { gap: 1 },
    Text(title),
    Text('One deposit. Then credits to answer.'),
    Text('Public facts. Well protected.'),
    ...noticeNodes(model.notice),
    Text('Deposit'),
    ...depositNodes(model),
    Text('Credits'),
    ...creditsNodes(creditsOf(model)),
    Text('Questions'),
    ...questionsNodes(model.questions),
    ...draftNodes(model.draft),
    Text('Player'),
    ...playerNodes(model),
    Text('Answer'),
    ...answerNodes(answerOf(model)),
    Row({}, ...removeButtons(model.questions)),
    Row({}, ...buttons),
  )
}
