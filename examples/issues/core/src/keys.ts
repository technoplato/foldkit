import { Array, Match as M, Option, Schema as S } from 'effect'

import {
  claimAsMe,
  layoutChoices,
  menuHasField,
  priorityChangeChoices,
  productChangeChoicesOf,
  releaseClaim,
  statusChangeChoices,
} from './choices.js'
import { type Interaction, interaction } from './interaction.js'
import {
  isPageOfRows,
  issueUnderCursorOf,
  issueViewOf,
  issuesInHandOf,
  rowsInOrderOf,
  savedViewsOf,
} from './listing.js'
import {
  BlurredSearchField,
  CancelledGoKey,
  ClearedRowCursor,
  ClearedRowSelection,
  ClickedFileIssue,
  ClickedOpenAskFlow,
  ClickedOpenBacklog,
  ClickedOpenFeatures,
  ClickedOpenFindings,
  ClickedOpenInbox,
  ClickedOpenIssueList,
  ClickedOpenProducts,
  ClickedOpenTriage,
  ClickedSaveView,
  DismissedFailedRowEdits,
  DismissedIssueDetail,
  DismissedLayer,
  ExtendedRowSelection,
  FocusedSearchField,
  MovedCardAcross,
  MovedCursorAcross,
  MovedMenuMark,
  MovedRowCursor,
  OpenedChoiceMenu,
  OpenedCommandPalette,
  OpenedRowUnderCursor,
  PeekedRowUnderCursor,
  PressedGoKey,
  SubmittedMenu,
  SubmittedSearch,
  SubmittedViewName,
  ToggledRowUnderCursor,
  UpdatedSearchQuery,
} from './message.js'
import { type ChoiceMenu, type Model } from './model.js'
import { searchOfView } from './route.js'

// KEY

/**
 * Where a key was pressed: on the page, in a text `Field`, or on a `Control`
 * that holds the focus, such as a link, which keeps its own Enter and Space.
 */
export const KeyTarget = S.Literals(['Page', 'Field', 'Control'])
/** Where a key was pressed. */
export type KeyTarget = typeof KeyTarget.Type

/** One key a host saw: `{ key: 'j', target: 'Page', ... }`. */
export type KeyPress = Readonly<{
  key: string
  isAlt: boolean
  isControl: boolean
  isMeta: boolean
  isShift: boolean
  target: KeyTarget
}>

const SINGLE_LETTER = /^[a-z]$/i

const baseKeyNameOf = ({ isShift, key }: KeyPress): string => {
  if (key.length !== 1) {
    return isShift ? `Shift+${key}` : key
  } else if (SINGLE_LETTER.test(key)) {
    return isShift ? `Shift+${key.toLowerCase()}` : key.toLowerCase()
  } else {
    return key
  }
}

const modifierOf = ({ isAlt, isControl, isMeta }: KeyPress): string => {
  if (isMeta) {
    return 'Meta+'
  } else if (isControl) {
    return 'Control+'
  } else if (isAlt) {
    return 'Alt+'
  } else {
    return ''
  }
}

/**
 * The name a key goes by in `Interaction.keys`: `j`, `Shift+j`, `Meta+k`,
 * `Escape`, `ArrowDown`, and ` ` for Space. A symbol reads as itself, so
 * Shift and `/` is `?`.
 */
export const keyNameOf = (press: KeyPress): string =>
  `${modifierOf(press)}${baseKeyNameOf(press)}`

// INTERACTION

const NEXT_ROW_KEYS = ['j', 'ArrowDown']
const PREVIOUS_ROW_KEYS = ['k', 'ArrowUp']

const nextRow = interaction(
  'cursor:next',
  'Next Issue',
  MovedRowCursor.make({ direction: 'Next' }),
  NEXT_ROW_KEYS,
)
const previousRow = interaction(
  'cursor:previous',
  'Previous Issue',
  MovedRowCursor.make({ direction: 'Previous' }),
  PREVIOUS_ROW_KEYS,
)
const openRow = interaction(
  'cursor:open',
  'Open the Issue under the cursor',
  OpenedRowUnderCursor.make({}),
  ['Enter'],
)
const peekRow = interaction(
  'peek',
  'Peek at the Issue under the cursor',
  PeekedRowUnderCursor.make({}),
  [' '],
)
const selectRow = interaction(
  'select-row',
  'Select the Issue under the cursor',
  ToggledRowUnderCursor.make({}),
  ['x'],
)
const extendDown = interaction(
  'select-next',
  'Select down',
  ExtendedRowSelection.make({ direction: 'Next' }),
  ['Shift+j', 'Shift+ArrowDown'],
)
const extendUp = interaction(
  'select-previous',
  'Select up',
  ExtendedRowSelection.make({ direction: 'Previous' }),
  ['Shift+k', 'Shift+ArrowUp'],
)
const clearSelection = interaction(
  'selection-clear',
  'Clear',
  ClearedRowSelection.make({}),
  ['Escape'],
)
const cursorRight = interaction(
  'board-next',
  'Next column',
  MovedCursorAcross.make({ direction: 'Next' }),
  ['l', 'ArrowRight'],
)
const cursorLeft = interaction(
  'board-previous',
  'Previous column',
  MovedCursorAcross.make({ direction: 'Previous' }),
  ['h', 'ArrowLeft'],
)
const cardRight = interaction(
  'card-next',
  'Move the card to the next column',
  MovedCardAcross.make({ direction: 'Next' }),
  ['Shift+l', 'Shift+ArrowRight'],
)
const cardLeft = interaction(
  'card-previous',
  'Move the card to the previous column',
  MovedCardAcross.make({ direction: 'Previous' }),
  ['Shift+h', 'Shift+ArrowLeft'],
)
const leaveRow = interaction(
  'cursor-clear',
  'Leave the row',
  ClearedRowCursor.make({}),
  ['Escape'],
)
const focusSearch = interaction(
  'search-focus',
  'Search Issues',
  FocusedSearchField.make({}),
  ['/'],
)
const blurSearch = interaction(
  'search-blur',
  'Leave the search',
  BlurredSearchField.make({}),
)
const clearSearch = interaction(
  'search:',
  'Clear the search',
  UpdatedSearchQuery.make({ query: '' }),
  ['Escape'],
)
const submitSearch = interaction(
  'search-submit',
  'Open the Issue the search names',
  SubmittedSearch.make({}),
  ['Enter'],
)
const go = interaction('go', 'Go to', PressedGoKey.make({}), ['g'])
const goToList = interaction(
  'go:list',
  'Go to list',
  ClickedOpenIssueList.make({}),
  ['g l'],
)
const goToBacklog = interaction(
  'go:backlog',
  'Go to backlog',
  ClickedOpenBacklog.make({}),
  ['g b'],
)
const goToTriage = interaction(
  'go:triage',
  'Go to triage',
  ClickedOpenTriage.make({}),
  ['g t'],
)
const goToFindings = interaction(
  'go:findings',
  'Go to findings',
  ClickedOpenFindings.make({}),
  ['g f'],
)
const goToFeatures = interaction(
  'go:features',
  'Go to features',
  ClickedOpenFeatures.make({}),
  ['g e'],
)
const goToProducts = interaction(
  'go:products',
  'Go to products',
  ClickedOpenProducts.make({}),
  ['g p'],
)
const goToViews = interaction(
  'go:views',
  'Go to saved views',
  OpenedChoiceMenu.make({ menu: 'SavedViews' }),
  ['g v'],
)
const goToInbox = interaction(
  'go:inbox',
  'Go to inbox',
  ClickedOpenInbox.make({}),
  ['g i'],
)
const cancelGo = interaction('go:cancel', 'Stay here', CancelledGoKey.make({}))
const saveView = interaction(
  'view-save',
  'Save this view',
  ClickedSaveView.make({}),
)
const submitViewName = interaction(
  'view-name-submit',
  'Save',
  SubmittedViewName.make({}),
  ['Enter'],
)
const openStatusMenu = interaction(
  'menu:set-status',
  'Set status',
  OpenedChoiceMenu.make({ menu: 'SetStatus' }),
  ['s'],
)
const openPriorityMenu = interaction(
  'menu:set-priority',
  'Set priority',
  OpenedChoiceMenu.make({ menu: 'SetPriority' }),
  ['p'],
)
const openClaimMenu = interaction(
  'menu:claim',
  'Claim',
  OpenedChoiceMenu.make({ menu: 'SetClaim' }),
  ['a'],
)
const openProductMenu = interaction(
  'menu:set-product',
  'Set product',
  OpenedChoiceMenu.make({ menu: 'SetProduct' }),
  ['m'],
)
const triageMenus: ReadonlyArray<Interaction> = [
  openStatusMenu,
  openPriorityMenu,
  openClaimMenu,
  openProductMenu,
]
const chordOf = (first: string, candidate: Interaction): Interaction => ({
  ...candidate,
  keys: Array.map(candidate.keys, key => `${first} ${key}`),
})
const statusChanges = Array.map(statusChangeChoices, candidate => ({
  ...chordOf('s', candidate),
  label: `Set status: ${candidate.label}`,
}))
const priorityChanges = Array.map(priorityChangeChoices, candidate => ({
  ...chordOf('p', candidate),
  label: `Set priority: ${candidate.label}`,
}))
const dismissFailedEdits = interaction(
  'edits-dismiss',
  'Dismiss',
  DismissedFailedRowEdits.make({}),
  ['Escape'],
)
const COMMAND_PALETTE_KEYS = ['Meta+k', 'Control+k']
const openPalette = interaction(
  'palette',
  'Command palette',
  OpenedCommandPalette.make({}),
  [...COMMAND_PALETTE_KEYS, '?'],
)
const dismissLayer = interaction(
  'layer-dismiss',
  'Close',
  DismissedLayer.make({}),
  ['Escape', ...COMMAND_PALETTE_KEYS],
)
const menuNext = interaction(
  'palette-down',
  'Next row',
  MovedMenuMark.make({ direction: 'Next' }),
  ['ArrowDown'],
)
const menuPrevious = interaction(
  'palette-up',
  'Previous row',
  MovedMenuMark.make({ direction: 'Previous' }),
  ['ArrowUp'],
)
const menuSubmit = interaction(
  'palette-submit',
  'Take the marked row',
  SubmittedMenu.make({}),
  ['Enter'],
)
const layerKeysWithField: ReadonlyArray<Interaction> = [
  menuNext,
  menuPrevious,
  menuSubmit,
  dismissLayer,
]
const layerKeysWithoutField: ReadonlyArray<Interaction> = [
  { ...menuNext, keys: ['ArrowDown', 'j'] },
  { ...menuPrevious, keys: ['ArrowUp', 'k'] },
  menuSubmit,
  dismissLayer,
]
const fileIssue = interaction('file', 'File issue', ClickedFileIssue.make({}), [
  'c',
])
const back = interaction(
  'back',
  'Back to issues',
  DismissedIssueDetail.make({}),
  ['Escape'],
)
const openTriage = interaction(
  'triage',
  'Open triage',
  ClickedOpenTriage.make({}),
)
const openBacklog = interaction(
  'backlog',
  'Backlog',
  ClickedOpenBacklog.make({}),
)
const openInbox = interaction('inbox', 'Inbox', ClickedOpenInbox.make({}))
const openAskFlow = interaction(
  'asks',
  'How long asks take',
  ClickedOpenAskFlow.make({}),
)
const openFindings = interaction(
  'findings',
  'Findings',
  ClickedOpenFindings.make({}),
)
const openFeatures = interaction(
  'features',
  'Features',
  ClickedOpenFeatures.make({}),
)
const openProducts = interaction(
  'products',
  'Products',
  ClickedOpenProducts.make({}),
)

/**
 * The interactions that move between pages, without any per-Issue ones:
 * File issue, Open triage and Backlog on the list, Back to issues
 * elsewhere, so painting the page's navigation never builds one
 * interaction per loaded Issue.
 */
export const navigationInteractionsOf = (
  model: Model,
): ReadonlyArray<Interaction> =>
  M.value(model.navigation).pipe(
    M.withReturnType<ReadonlyArray<Interaction>>(),
    M.tagsExhaustive({
      IssueList: () => [
        fileIssue,
        openTriage,
        openBacklog,
        openAskFlow,
        openFindings,
        openFeatures,
        openProducts,
        openInbox,
      ],
      IssueDetail: () => [back],
      FileIssue: () => [back],
      Backlog: () => [back, fileIssue],
      AskFlow: () => [back],
      Inbox: () => [back],
      EntityPage: () => [back],
      Findings: () => [back],
      Features: () => [back],
      Products: () => [back],
      TriageInbox: () => [back],
    }),
  )

const fileIssueUnlessFiling = (model: Model): ReadonlyArray<Interaction> =>
  model.navigation._tag === 'FileIssue' ? [] : [fileIssue]

const rowCursorInteractions = (model: Model): ReadonlyArray<Interaction> =>
  Array.isReadonlyArrayEmpty(rowsInOrderOf(model))
    ? []
    : [nextRow, previousRow, extendDown, extendUp]

const rowUnderCursorInteractions = (
  model: Model,
): ReadonlyArray<Interaction> =>
  Option.isSome(issueUnderCursorOf(model)) ? [openRow, peekRow, selectRow] : []

const productChangesOf = (model: Model): ReadonlyArray<Interaction> =>
  Array.map(productChangeChoicesOf(model), candidate => ({
    ...candidate,
    label: `Set product: ${candidate.label}`,
  }))

const boardInteractionsOf = (model: Model): ReadonlyArray<Interaction> =>
  issueViewOf(model).layout === 'Board' &&
  Option.isSome(issueUnderCursorOf(model))
    ? [cursorRight, cursorLeft, cardRight, cardLeft]
    : []

const layoutToggleInteractions = (model: Model): ReadonlyArray<Interaction> =>
  model.navigation._tag === 'IssueList'
    ? Array.flatMap(layoutChoices, candidate =>
        candidate.message._tag === 'SelectedIssueLayout' &&
        candidate.message.layout !== issueViewOf(model).layout
          ? [{ ...candidate, keys: ['Shift+b'] }]
          : [],
      )
    : []

const triageInteractionsOf = (model: Model): ReadonlyArray<Interaction> =>
  Array.isReadonlyArrayEmpty(issuesInHandOf(model))
    ? []
    : [
        ...triageMenus,
        ...statusChanges,
        ...priorityChanges,
        ...productChangesOf(model),
        claimAsMe,
        releaseClaim,
      ]

const FIRST_ROW_KEYS = ['Enter', 's', 'p', 'a', 'm', 'x']
const FIRST_CARD_KEYS = ['h', 'l']

const firstRowFirst = (model: Model): ReadonlyArray<Interaction> =>
  Option.isNone(issueUnderCursorOf(model)) &&
  Array.isReadonlyArrayNonEmpty(rowsInOrderOf(model))
    ? [
        {
          ...nextRow,
          keys:
            issueViewOf(model).layout === 'Board'
              ? [...FIRST_ROW_KEYS, ...FIRST_CARD_KEYS]
              : FIRST_ROW_KEYS,
        },
      ]
    : []

const failedEditInteractions = (model: Model): ReadonlyArray<Interaction> =>
  Array.isReadonlyArrayEmpty(model.failedRowEdits) ? [] : [dismissFailedEdits]

const clearSearchInteractions = (model: Model): ReadonlyArray<Interaction> =>
  issueViewOf(model).query === '' ? [] : [clearSearch]

const clearSelectionInteractions = (
  model: Model,
): ReadonlyArray<Interaction> =>
  isPageOfRows(model) && Array.isReadonlyArrayNonEmpty(model.selectedIssueIds)
    ? [clearSelection]
    : []

const leaveRowInteractions = (model: Model): ReadonlyArray<Interaction> =>
  issueViewOf(model).query === '' && Option.isSome(issueUnderCursorOf(model))
    ? [leaveRow]
    : []

const isViewSaved = (model: Model): boolean => {
  const shown = searchOfView(issueViewOf(model))
  return Array.some(savedViewsOf(model), view => view.query === shown)
}

const saveViewInteractions = (model: Model): ReadonlyArray<Interaction> =>
  model.navigation._tag === 'IssueList' && !isViewSaved(model) ? [saveView] : []

/** The places a person can go from anywhere, each with its two keys. */
export const placeInteractions: ReadonlyArray<Interaction> = [
  goToList,
  goToBacklog,
  goToTriage,
  goToFindings,
  goToFeatures,
  goToProducts,
  goToViews,
  goToInbox,
  openAskFlow,
  fileIssue,
]

const goChoices: ReadonlyArray<Interaction> = [
  { ...goToList, keys: ['l'] },
  { ...goToBacklog, keys: ['b'] },
  { ...goToTriage, keys: ['t'] },
  { ...goToFindings, keys: ['f'] },
  { ...goToFeatures, keys: ['e'] },
  { ...goToProducts, keys: ['p'] },
  { ...goToViews, keys: ['v'] },
  { ...goToInbox, keys: ['i'] },
]

/**
 * Every interaction the keyboard offers now, beside what the page shows:
 * walking the rows, opening the row under the cursor, the search, `g` and
 * what follows it, and filing. Every host can offer them; a host with keys
 * binds them by {@link tokenForKeyPress}.
 */
export const keyInteractionsOf = (model: Model): ReadonlyArray<Interaction> => [
  ...failedEditInteractions(model),
  ...clearSelectionInteractions(model),
  ...rowCursorInteractions(model),
  ...rowUnderCursorInteractions(model),
  ...boardInteractionsOf(model),
  ...layoutToggleInteractions(model),
  ...leaveRowInteractions(model),
  ...triageInteractionsOf(model),
  focusSearch,
  blurSearch,
  ...fileIssueUnlessFiling(model),
  goToList,
  goToBacklog,
  goToTriage,
  goToFindings,
  goToFeatures,
  goToProducts,
  goToViews,
  goToInbox,
  go,
  ...(model.isGoKeyPending ? [cancelGo] : []),
  ...saveViewInteractions(model),
  ...(model.layer._tag === 'NamingViewLayer' ? [submitViewName] : []),
  openPalette,
  ...(model.layer._tag === 'NoLayer' ? [] : layerKeysWithField),
]

const NATIVE_CONTROL_KEYS = ['Enter', ' ']

const pageKeys = (model: Model): ReadonlyArray<Interaction> => [
  ...keyInteractionsOf(model),
  ...firstRowFirst(model),
  ...navigationInteractionsOf(model),
  ...clearSearchInteractions(model),
]

const leaveOrClearSearch = (model: Model): Interaction =>
  issueViewOf(model).query === ''
    ? { ...blurSearch, keys: ['Escape'] }
    : clearSearch

const anyFieldKeys: ReadonlyArray<Interaction> = [
  { ...openPalette, keys: COMMAND_PALETTE_KEYS },
]

const fieldKeys = (model: Model): ReadonlyArray<Interaction> =>
  model.isSearchFocused
    ? [
        leaveOrClearSearch(model),
        submitSearch,
        ...rowCursorInteractions(model).map(row => ({
          ...row,
          keys: Array.filter(row.keys, key => key.startsWith('Arrow')),
        })),
        ...anyFieldKeys,
      ]
    : anyFieldKeys

const keysAt = (model: Model, target: KeyTarget): ReadonlyArray<Interaction> =>
  M.value(target).pipe(
    M.withReturnType<ReadonlyArray<Interaction>>(),
    M.when('Page', () => pageKeys(model)),
    M.when('Field', () => fieldKeys(model)),
    M.when('Control', () => withoutNativeControlKeys(pageKeys(model))),
    M.exhaustive,
  )

const withoutNativeControlKeys = (
  candidates: ReadonlyArray<Interaction>,
): ReadonlyArray<Interaction> =>
  Array.map(candidates, candidate => ({
    ...candidate,
    keys: Array.filter(
      candidate.keys,
      key => !Array.contains(NATIVE_CONTROL_KEYS, key),
    ),
  }))

const peekKeys: ReadonlyArray<Interaction> = [
  nextRow,
  previousRow,
  openRow,
  ...triageMenus,
  { ...dismissLayer, keys: ['Escape', ' '] },
  { ...openPalette, keys: COMMAND_PALETTE_KEYS },
]

const peekKeysAt = (target: KeyTarget): ReadonlyArray<Interaction> =>
  target === 'Control' ? withoutNativeControlKeys(peekKeys) : peekKeys

const pickedByKey = (candidate: Interaction): Interaction => ({
  ...candidate,
  token: `palette-run:${candidate.token}`,
})

const hotKeysOf = (menu: ChoiceMenu): ReadonlyArray<Interaction> =>
  M.value(menu).pipe(
    M.withReturnType<ReadonlyArray<Interaction>>(),
    M.when('SetStatus', () => Array.map(statusChangeChoices, pickedByKey)),
    M.when('SetPriority', () => Array.map(priorityChangeChoices, pickedByKey)),
    M.orElse(() => []),
  )

const menuKeysAt = (
  menu: ChoiceMenu,
  target: KeyTarget,
): ReadonlyArray<Interaction> => {
  const keys = menuHasField(menu)
    ? layerKeysWithField
    : [...layerKeysWithoutField, ...hotKeysOf(menu)]
  return target === 'Control' ? withoutNativeControlKeys(keys) : keys
}

const pendingGoKeys = (press: KeyPress): Interaction =>
  Option.getOrElse(
    Array.findFirst(goChoices, choice =>
      Array.contains(choice.keys, keyNameOf(press)),
    ),
    () => cancelGo,
  )

/**
 * The token a key presses now, when it presses one. What each key means lives
 * here and in `Interaction.keys`, and a host only reports the key and sends
 * the token: `j` on the list is `cursor:next`, `Esc` in the search is `search:`
 * while it holds words. While typing in a field only Esc, Enter and the arrows
 * of the search fire, and `g` waits for the next key whatever it is.
 */
export const tokenForKeyPress = (
  model: Model,
  press: KeyPress,
): Option.Option<string> => {
  if (model.isGoKeyPending) {
    return Option.some(pendingGoKeys(press).token)
  } else {
    const name = keyNameOf(press)
    const candidates = M.value(model.layer).pipe(
      M.withReturnType<ReadonlyArray<Interaction>>(),
      M.tagsExhaustive({
        NoLayer: () => keysAt(model, press.target),
        ChoiceLayer: ({ menu }) => menuKeysAt(menu, press.target),
        PeekLayer: () => peekKeysAt(press.target),
        NamingViewLayer: () => [submitViewName, dismissLayer],
      }),
    )
    return Option.map(
      Array.findFirst(candidates, candidate =>
        Array.contains(candidate.keys, name),
      ),
      candidate => candidate.token,
    )
  }
}
