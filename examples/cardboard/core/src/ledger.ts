import { Schema as S } from 'effect'

/** One public operating level used to move a conversation toward a shipment. */
export const ConversationScaleLevel = S.Struct({
  description: S.String,
  label: S.String,
  level: S.Literals([0, 1, 2, 3, 4]),
})
/** One public operating level used to move a conversation toward a shipment. */
export type ConversationScaleLevel = typeof ConversationScaleLevel.Type

/** One append-only public decision preserved from the Cardboard conversation. */
export const ConversationLedgerEntry = S.Struct({
  recordedOn: S.String,
  sequence: S.Int,
  statement: S.String,
  title: S.String,
})
/** One append-only public decision preserved from the Cardboard conversation. */
export type ConversationLedgerEntry = typeof ConversationLedgerEntry.Type

/** The shared scale for capturing, checking, conducting, and shipping ideas. */
export const conversationScale: ReadonlyArray<ConversationScaleLevel> = [
  ConversationScaleLevel.make({
    description: 'Preserve the claim before changing or judging it.',
    label: 'Capture',
    level: 0,
  }),
  ConversationScaleLevel.make({
    description: 'Separate evidence, metaphor, uncertainty, and private data.',
    label: 'Ground',
    level: 1,
  }),
  ConversationScaleLevel.make({
    description: 'Check rules, contradictions, consent, and replay laws.',
    label: 'Referee',
    level: 2,
  }),
  ConversationScaleLevel.make({
    description: 'Choose one coherent transition across every Client.',
    label: 'Conduct',
    level: 3,
  }),
  ConversationScaleLevel.make({
    description: 'Publish the smallest verified artifact and its provenance.',
    label: 'Ship',
    level: 4,
  }),
]

/** The current public Cardboard operating level. */
export const currentConversationScaleLevel = 4

/** The public append-only decision log rendered inside `/0/extra`. */
export const conversationLedger: ReadonlyArray<ConversationLedgerEntry> = [
  ConversationLedgerEntry.make({
    recordedOn: 'July 23, 2026',
    sequence: 1,
    statement:
      'One portable Effect-backed Program owns Model, Message, update, Commands, and Subscriptions. Clients own presentation and input.',
    title: 'One Program, many Clients',
  }),
  ConversationLedgerEntry.make({
    recordedOn: 'July 26, 2026',
    sequence: 2,
    statement:
      'Replay applies recorded Messages with inert side-effect Layers. New live Messages branch only from a settled frame.',
    title: 'Replay without repeating history',
  }),
  ConversationLedgerEntry.make({
    recordedOn: 'July 27, 2026',
    sequence: 3,
    statement:
      'Visible destinations are typed application state. Native stacks, browser history, and terminals reconcile with that state.',
    title: 'Navigation is state',
  }),
  ConversationLedgerEntry.make({
    recordedOn: 'July 28, 2026',
    sequence: 4,
    statement:
      'Rule Zero begins at /0 with a black control, accessible feedback, portable input, and no hidden permission or charge.',
    title: 'Project Cardboard begins',
  }),
  ConversationLedgerEntry.make({
    recordedOn: 'July 28, 2026 at 12:16 a.m. EDT',
    sequence: 5,
    statement:
      'Blueberry Chopsticks attached a public authorship statement and content addresses to the same Program across Clients.',
    title: 'Public provenance',
  }),
  ConversationLedgerEntry.make({
    recordedOn: 'July 28, 2026',
    sequence: 6,
    statement:
      'When /0 is four, stop expanding the theory. Ship the smallest verified artifact, record what happened, and continue from evidence.',
    title: '/0 is four',
  }),
]
