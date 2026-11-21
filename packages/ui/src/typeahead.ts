import type { Option } from 'effect'
import { Typeahead } from 'foldkit/behavior'

/** Finds the first enabled item whose search text starts with the query, searching forward from the active item and wrapping around. On a fresh search, starts after the active item; on a refinement, includes the active item. */
export const resolveTypeaheadMatch = <Item>(
  items: ReadonlyArray<Item>,
  query: string,
  maybeActiveItemIndex: Option.Option<number>,
  isDisabled: (index: number) => boolean,
  itemToSearchText: (item: Item, index: number) => string,
  isRefinement: boolean,
): Option.Option<number> =>
  Typeahead.match({
    items,
    query,
    maybeActiveIndex: maybeActiveItemIndex,
    isDisabled,
    textOf: itemToSearchText,
    isRefinement,
  })
