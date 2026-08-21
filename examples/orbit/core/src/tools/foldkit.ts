export type Wallet = { tag: 'absent' } | { tag: 'sim'; id: string; bal: Play }
// LiveWallet is not a member. That is the safety mechanism.

export type Msg =
  | { tag: 'open-sim'; id: string }
  | { tag: 'mint'; id: string; amt: Play }
  | { tag: 'fund'; from: string; to: string; amt: Play }
  | { tag: 'ask-danger'; danger: Danger; note: string }

export type Effect =
  | { tag: 'ok'; line: string }
  | { tag: 'refuse'; danger: Danger; why: string }
// No chain-send effect. Deleted, not guarded.
