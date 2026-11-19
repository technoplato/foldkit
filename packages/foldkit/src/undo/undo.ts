import { Array, Duration, Effect, Option, Schema as S } from 'effect'

import { type AnyCatalog, type Entry, isEnabled } from '../catalog/catalog.js'
import * as Command from '../command/index.js'
import { m } from '../message/index.js'
import { Row, Text, actionButtons } from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'

// MODEL

/**
 * An undo being offered: the tag of the Action that undoes, what to say
 * happened, and a cue that tells this offer from the one after it.
 */
export const UndoOffer = S.Struct({
  undo: S.String,
  said: S.String,
  cue: S.Int,
})
/** An undo being offered. */
export type UndoOffer = typeof UndoOffer.Type

/**
 * The undo a Program is offering now, if any, and the cue the next
 * offer takes. It is state in the Model: the painters are told, and
 * none keeps a timer.
 */
export const UndoState = S.Struct({
  maybeOffer: S.Option(UndoOffer),
  nextCue: S.Int,
})
/** The undo a Program is offering now. */
export type UndoState = typeof UndoState.Type

/** No undo offered yet. */
export const initialUndo: UndoState = { maybeOffer: Option.none(), nextCue: 0 }

// MESSAGE

/** The time an undo was offered for is up. `cue` says which offer. */
export const ExpiredUndoOffer = m('ExpiredUndoOffer', { cue: S.Int })

/** True for the Message that ends an offer. */
export const isExpiredUndoOffer = S.is(ExpiredUndoOffer)

// COMMAND

/**
 * Waits for as long as an undo is offered, then says its time is up.
 */
export const ExpireUndoOffer = Command.define(
  'ExpireUndoOffer',
  { cue: S.Int, afterMs: S.Number },
  ExpiredUndoOffer,
)(({ cue, afterMs }) =>
  Effect.as(Effect.sleep(Duration.millis(afterMs)), ExpiredUndoOffer({ cue })),
)

// UPDATE

type OfferStep = readonly [
  UndoState,
  ReadonlyArray<ReturnType<typeof ExpireUndoOffer>>,
]

/**
 * The offer after one Message, read from what the Catalog's Actions
 * declare. An Action that says what undoes it starts an offer and the
 * wait that ends it. Asking for that undo, or the end of the wait, takes
 * the offer away; the end of an older wait leaves a newer offer alone.
 * Any other Message changes nothing. A Program calls this from its
 * update for every Message, so the Undo control is derived from the
 * declaration and never written into a screen.
 *
 * @example
 * ```typescript
 * const [undo, commands] = Undo.offerStep(catalog, model.undo, message)
 * // after ConfirmDeleteBookmark: { maybeOffer: Some({ undo: 'UndoRemoveBookmark', said: 'Bookmark removed', cue: 0 }), nextCue: 1 }
 * ```
 */
export const offerStep = (
  catalog: AnyCatalog,
  state: UndoState,
  message: Readonly<{ _tag: string }>,
): OfferStep => {
  if (isExpiredUndoOffer(message)) {
    return [
      Option.exists(state.maybeOffer, offer => offer.cue === message.cue)
        ? { ...state, maybeOffer: Option.none() }
        : state,
      [],
    ]
  }
  const maybeDeclared = Option.flatMap(
    Array.findFirst(catalog.actions, action => action.tag === message._tag),
    action => action.maybeUndo,
  )
  if (Option.isSome(maybeDeclared) && maybeDeclared.value._tag === 'UndoneBy') {
    return [
      {
        maybeOffer: Option.some({
          undo: maybeDeclared.value.tag,
          said: maybeDeclared.value.said,
          cue: state.nextCue,
        }),
        nextCue: state.nextCue + 1,
      },
      [
        ExpireUndoOffer({
          cue: state.nextCue,
          afterMs: maybeDeclared.value.offeredForMs,
        }),
      ],
    ]
  } else if (
    Option.exists(state.maybeOffer, offer => offer.undo === message._tag)
  ) {
    return [{ ...state, maybeOffer: Option.none() }, []]
  } else {
    return [state, []]
  }
}

// VIEW

const firstKeyOf = (entry: Entry): Option.Option<string> =>
  Array.head(entry.keys)

/**
 * The line that offers an undo, for any screen: what happened, then the
 * undoing Action's own control, so its label, hint and press are the
 * ones every painter already knows. Where a hardware keyboard is
 * attached it names the Action's key too. Empty with no offer, and when
 * the undoing Action cannot be asked for.
 *
 * @example
 * ```typescript
 * Column({}, ...Undo.noticeOf(model.undo, Catalog.entries(catalog, model), false))
 * // Bookmark removed. [Undo]
 * ```
 */
export const noticeOf = (
  state: UndoState,
  entries: ReadonlyArray<Entry>,
  hasHardwareKeyboard: boolean,
): ReadonlyArray<UiNode> =>
  Option.match(
    Option.flatMap(state.maybeOffer, offer =>
      Option.map(
        Array.findFirst(
          entries,
          entry => entry.tag === offer.undo && isEnabled(entry.availability),
        ),
        entry => ({ offer, entry }),
      ),
    ),
    {
      onNone: () => [],
      onSome: ({ offer, entry }) => [
        Row(
          { gap: 1 },
          Text(`${offer.said}.`, { dim: true }),
          ...actionButtons([entry]),
          ...Array.fromOption(
            Option.map(
              Option.filter(firstKeyOf(entry), () => hasHardwareKeyboard),
              key => Text(`Press ${key} to undo.`, { dim: true }),
            ),
          ),
        ),
      ],
    },
  )
