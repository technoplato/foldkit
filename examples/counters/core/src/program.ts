import * as Counter from 'counter-core-example'
import { Result, Schema as S, SchemaParser } from 'effect'
import { Command, Program } from 'foldkit'

import { CounterFactClient } from './counterFactClient.js'
import { init } from './init.js'
import { FieldOwnerMessage, Message } from './message.js'
import { CounterList, Model, Navigation, RetiredCounterIds } from './model.js'
import { synchronization } from './synchronization.js'
import { restore, update } from './update.js'
import { EventRegistry } from './wire.js'

type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, CounterFactClient>>,
]

/**
 * The identified Counter rows with every host-owned Model field and Message
 * composed beside them. Row Commands leave the composition only as
 * `GotChild` wrappings, so the composed vocabulary never surfaces its
 * reserved `ClickedAddRow` and `ClickedRemoveRow` tags.
 */
const Rows = Program.compose.forEach<
  typeof Counter.CounterProgram,
  Readonly<{
    navigation: typeof Navigation
    retiredCounterIds: typeof RetiredCounterIds
  }>
>({
  of: Counter.CounterProgram,
  id: 'multiple-counters',
  version: 3,
  fields: {
    navigation: Navigation,
    retiredCounterIds: RetiredCounterIds,
  },
  initialFields: {
    navigation: CounterList.make({}),
    retiredCounterIds: [],
  },
  messages: [FieldOwnerMessage],
  updateFields: (model, message) => {
    const parsedFieldMessage =
      SchemaParser.decodeUnknownResult(FieldOwnerMessage)(message)
    return Result.isFailure(parsedFieldMessage)
      ? [model, []]
      : update(model, parsedFieldMessage.success)
  },
})

/**
 * Projects every composed row or field-owner Command onto the exported
 * Message boundary.
 */
const updateBoundary = (model: Model, message: Message): UpdateReturn => {
  const [nextModel, commands] = Rows.update(model, message)
  return [
    nextModel,
    Command.mapMessages(commands, commandMessage =>
      S.decodeUnknownSync(Message)(commandMessage),
    ),
  ]
}

/**
 * The canonical renderer-free Multiple Counters Program shared by every host.
 *
 * The identified Counter rows compose through `Program.compose.forEach`:
 * child Counter Messages arrive as `{_tag: 'GotChild', id, message}` and the
 * combinator routes them to the addressed row, so no parent arm routes child
 * Messages by hand.
 *
 * The generic row Messages `ClickedAddRow` and `ClickedRemoveRow` are never
 * emitted and never accepted at this Program boundary because their
 * semantics differ from this domain: deleting a counter retires its identity
 * permanently and navigates back to the list, while adding one mints a
 * caller-supplied prefixed `counter-` identity guarded against duplicates,
 * capacity, and lifetime limits. The exported `Message` Schema therefore
 * omits both row tags.
 *
 * Version 3 intentionally starts a new incompatible session and replay
 * boundary: row entries renamed their Counter payload to `child`, the child
 * wrapper became `GotChild`, and the derived Model carries `nextId`.
 */
// The composition declares optional Subscription and ManagedResource slots
// typed against its widest internal vocabulary; this boundary carries none
// and narrows every Message to the exported Schema.
const {
  subscriptions: _composedSubscriptions,
  managedResources: _composedManagedResources,
  ...ComposedRows
} = Rows

export const MultipleCountersProgram: Program.Program<
  Model,
  Message,
  CounterFactClient
> = Object.assign(ComposedRows, {
  Model,
  Message,
  init,
  restore,
  update: updateBoundary,
  migrations: [],
  synchronization,
  versionedEvents: EventRegistry,
})
