import { Array, Match as M, Option, Schema as S, String } from 'effect'

import {
  type Issue,
  IssuePriority,
  IssueStatus,
} from '@foldkit/instant-tools/issues'

import { productChoicesOf } from './choices.js'
import { type IssueGroup } from './issueView.js'
import {
  type RowDirection,
  issueUnderCursorOf,
  issueViewOf,
  listedColumns,
  loadedIssuesIn,
} from './listing.js'
import { type Model } from './model.js'
import {
  ChangedPriority,
  ChangedProduct,
  ChangedStatus,
  ClaimedFor,
  ReleasedClaim,
  type RowChange,
} from './rowEdit.js'

/** A card dropped on a column: `card-drop:Blocked:804`. */
export const CARD_DROP_TOKEN_PREFIX = 'card-drop:'

const LAST_SEPARATOR = ':'

/** What a drop names: the column and the card, `Blocked` and `804`. */
export const droppedCardOfToken = (
  token: string,
): Option.Option<Readonly<{ column: string; issueId: string }>> =>
  token.startsWith(CARD_DROP_TOKEN_PREFIX)
    ? Option.flatMap(String.lastIndexOf(LAST_SEPARATOR)(token), separatorAt =>
        separatorAt < CARD_DROP_TOKEN_PREFIX.length
          ? Option.none()
          : Option.some({
              column: token.slice(CARD_DROP_TOKEN_PREFIX.length, separatorAt),
              issueId: token.slice(separatorAt + LAST_SEPARATOR.length),
            }),
      )
    : Option.none()

const UNCLAIMED_COLUMN = 'Unclaimed'

/**
 * What it takes for a card to join a column: on a board by status its status,
 * by priority its priority, by product its product, and by claimant its claim.
 */
export const columnChangeOf = (
  model: Model,
  column: string,
): Option.Option<RowChange> =>
  M.value(issueViewOf(model).grouping).pipe(
    M.withReturnType<Option.Option<RowChange>>(),
    M.whenOr('None', 'Status', () =>
      Option.map(S.decodeUnknownOption(IssueStatus)(column), status =>
        ChangedStatus.make({ status }),
      ),
    ),
    M.when('Priority', () =>
      Option.map(S.decodeUnknownOption(IssuePriority)(column), priority =>
        ChangedPriority.make({ priority }),
      ),
    ),
    M.when('Product', () =>
      Option.map(
        Array.findFirst(
          productChoicesOf(model),
          product => product.name === column,
        ),
        product => ChangedProduct.make({ product }),
      ),
    ),
    M.when('Claimant', () =>
      Option.some(
        column === UNCLAIMED_COLUMN
          ? ReleasedClaim.make({})
          : ClaimedFor.make({ claimantId: column }),
      ),
    ),
    M.exhaustive,
  )

type CardPlace = Readonly<{ column: number; row: number }>

const placeOfCard = (
  columns: ReadonlyArray<IssueGroup>,
  card: Issue,
): Option.Option<CardPlace> =>
  Array.head(
    Array.flatMap(columns, ({ issues }, column) =>
      Option.match(
        Array.findFirstIndex(issues, issue => issue.id === card.id),
        {
          onNone: () => [],
          onSome: row => [{ column, row }],
        },
      ),
    ),
  )

const cursorPlaceOf = (
  model: Model,
): Option.Option<
  Readonly<{ columns: ReadonlyArray<IssueGroup>; place: CardPlace }>
> => {
  const columns = listedColumns(model, loadedIssuesIn(model))
  return Option.flatMap(issueUnderCursorOf(model), card =>
    Option.map(placeOfCard(columns, card), place => ({ columns, place })),
  )
}

const columnsBeyond = (
  columns: ReadonlyArray<IssueGroup>,
  column: number,
  direction: RowDirection,
): ReadonlyArray<IssueGroup> =>
  direction === 'Next'
    ? Array.drop(columns, column + 1)
    : Array.reverse(Array.take(columns, column))

/**
 * The card a cursor reaches across the columns: at the same height in the
 * nearest column that holds cards, or the last card there when it holds fewer.
 */
export const cardAcross = (
  model: Model,
  direction: RowDirection,
): Option.Option<string> =>
  Option.flatMap(cursorPlaceOf(model), ({ columns, place }) =>
    Option.flatMap(
      Array.findFirst(
        columnsBeyond(columns, place.column, direction),
        ({ issues }) => Array.isReadonlyArrayNonEmpty(issues),
      ),
      ({ issues }) =>
        Option.map(
          Array.get(issues, Math.min(place.row, issues.length - 1)),
          issue => issue.id,
        ),
    ),
  )

/** What moves the card under the cursor to the next column, when there is one. */
export const changeAcross = (
  model: Model,
  direction: RowDirection,
): Option.Option<RowChange> =>
  Option.flatMap(cursorPlaceOf(model), ({ columns, place }) =>
    Option.flatMap(
      Array.head(columnsBeyond(columns, place.column, direction)),
      ({ name }) => columnChangeOf(model, name),
    ),
  )
