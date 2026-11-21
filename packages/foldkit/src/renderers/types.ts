import type { Signal as HoldSignal } from '../behavior/longPress.js'
import type { SlotBinding } from '../behavior/slot.js'
import type { InkRun } from '../theme/terminal.js'
import type { Device } from './device.js'
import type { IconName } from './icons.js'

/** A pressable control id used when a host maps a hit to a cause. */
export type HotspotAction = Readonly<{
  readonly _tag: 'custom'
  readonly id: string
}>

/**
 * A text run. Optional `href` is a link the painters may follow. Optional
 * `label` is what a screen reader announces instead of the bare content,
 * such as `count 3` for `3`.
 */
/**
 * How much a text run stands out. `Display` is the screen's one big
 * figure, such as the count: large on graphical painters, bold in a
 * terminal. `Headline` titles a screen or a section, such as `Library`
 * or a book's name: larger and bold, but sized for words.
 */
export type TextEmphasis = 'Display' | 'Headline'

/**
 * A picture a Text shows in place of its words, where a painter can show
 * pictures: a cover from storage, in pixels on the web and points on a
 * phone. The words stay its alt text, and a terminal shows them instead.
 */
export type TextImage = Readonly<{
  readonly src: string
  readonly width: number
  readonly height: number
}>

/**
 * A live view from another site a Text shows in place of its words, where
 * the host draws views of its `kind`, such as a book's preview from Google
 * Books: `{ kind: 'GoogleBooksPreview', params: { volume: 'ISBN:9780544553729', page: '3' } }`.
 * `params` are the words that view reads, and `width` and `height` its
 * size in pixels, as wide as it may grow. A painter without a view of that
 * kind, such as a terminal, shows the words instead, as a link to `href`
 * when the Text has one.
 */
export type TextEmbed = Readonly<{
  readonly kind: string
  readonly params: Readonly<Record<string, string>>
  readonly width: number
  readonly height: number
}>

/** Plain words inside a Text made of parts, such as `Fixed by `. */
export type PlainPart = Readonly<{
  readonly _tag: 'Plain'
  readonly text: string
}>

/**
 * A reference to another thing inside a Text, shown as a chip: its `label`,
 * such as `#1358`, its `title` and `state`, such as `issues CLI burns CPU`
 * and `PartiallyDone`, and its `kind`, such as `Issue`, for the look and for
 * screen readers. `href` is where it goes. `detail` is what a hover shows,
 * one line each, such as when it was filed. A terminal draws
 * `#1358 issues CLI burns CPU [PartiallyDone]`.
 */
export type ReferencePart = Readonly<{
  readonly _tag: 'Reference'
  readonly label: string
  readonly title?: string
  readonly state?: string
  readonly kind?: string
  readonly href?: string
  readonly detail?: ReadonlyArray<string>
}>

/** One part of a Text's words: plain words or a reference. */
export type TextPart = PlainPart | ReferencePart

/**
 * A text run. With `parts`, painters that draw rich text draw each part, and
 * every other painter draws `content`, which holds the parts' words.
 */
export type TextNode = Readonly<{
  readonly _tag: 'Text'
  readonly content: string
  readonly parts?: ReadonlyArray<TextPart>
  readonly image?: TextImage
  readonly embed?: TextEmbed
  readonly href?: string
  readonly label?: string
  readonly mono?: boolean
  readonly dim?: boolean
  readonly emphasis?: TextEmphasis
  readonly copyable?: boolean
  readonly width?: number
}>

/**
 * How a Button looks. `Primary` is the one main act, `Ghost` a quiet one,
 * `Destructive` one that removes something, `Tab` one of a set of places,
 * such as Library and Profile, the current one marked with `isCurrent`,
 * and `Pill` a small rounded one that floats by what it acts on, such as
 * `Back to Playhead` under words read along with.
 */
export type ButtonVariant = 'Primary' | 'Ghost' | 'Destructive' | 'Tab' | 'Pill'

/**
 * A pressable control. The label is product data. `action` is the Catalog
 * tag a press sends; `keys` are the keys its Action declares, `['+', '=']`
 * for Increment; `because` is the sentence a disabled control shows.
 * `description` is the one sentence its Action declares for what a press
 * does, `Sets the count to 0`, which a painter shows as a hint beside the
 * keys when a pointer rests on the control or the keyboard reaches it.
 * `why` is the sentence its Action declares for why the user would press
 * it, `To start over`, shown under the description in that hint.
 * `icon` draws beside the label, or instead of it with `isIconOnly`, the
 * label then left for screen readers. `isCurrent` marks the current tab.
 * `slot` is what a part binds on the button beyond its press, such as a
 * hold that pins it: a painter's host reads it, and a painter with no
 * pointer leaves it alone.
 */
export type ButtonNode = Readonly<{
  readonly _tag: 'Button'
  readonly label: string
  readonly token?: string
  readonly action?: string
  readonly keys?: ReadonlyArray<string>
  readonly because?: string
  readonly description?: string
  readonly why?: string
  readonly variant?: ButtonVariant
  readonly icon?: IconName
  readonly isIconOnly?: boolean
  readonly isCurrent?: boolean
  readonly disabled?: boolean
  readonly focused?: boolean
  readonly slot?: SlotBinding
  readonly hold?: HoldSignal
}>

/**
 * A text field showing `value`, the text the Model holds. With `action`,
 * submitting the field presses `action` with the trimmed text as its
 * choice: typing `Buy milk` and pressing Enter in a field whose action is
 * `AddReminder` presses `AddReminder:Buy milk`. A field that adds, empty
 * and with no `clearAction`, submits on Enter and then clears for the next
 * entry. A field that edits, showing a value such as a title or having a
 * `clearAction` such as `ClearNotes`, also submits when a person leaves it
 * after a change, and submitting it empty presses `clearAction`. `label`
 * names the field for a screen reader, `New reminder in Groceries`.
 * `againAction` is what submitting the text unchanged presses, such as
 * `NextMatch` when Enter is pressed again in a search.
 * `token` is the older binding that sends every keystroke. `focused` says
 * the Model wants the field to hold the focus, as a search does after `/`.
 * `focusToken` and `blurToken` are pressed when it gains and loses the focus,
 * so the Model keeps knowing, and a field with a `blurToken` lets go of the
 * focus when `focused` turns false.
 */
export type TextInputNode = Readonly<{
  readonly _tag: 'TextInput'
  readonly value: string
  readonly placeholder?: string
  readonly focused?: boolean
  readonly width?: number
  readonly token?: string
  readonly action?: string
  readonly clearAction?: string
  readonly againAction?: string
  readonly label?: string
  readonly focusToken?: string
  readonly blurToken?: string
}>

/** Fixed blank rows. */
export type SpacerNode = Readonly<{
  readonly _tag: 'Spacer'
  readonly rows: number
}>

/**
 * A horizontal stack. `isBoard` makes it columns side by side that a person
 * scrolls sideways, such as a board with a column per status: a graphical
 * painter keeps each child its own width and a terminal stacks them, so no
 * column is ever cut off.
 */
export type RowNode = Readonly<{
  readonly _tag: 'Row'
  readonly gap: number
  readonly isBoard?: boolean
  readonly arrange?: RowArrangement
  readonly slot?: SlotBinding
  readonly children: ReadonlyArray<UiNode>
}>

/**
 * A named way a Row arranges its children, beyond one after another. A
 * `Toolbar` has three children, a start, a centre and an end, with the
 * centre held in the middle whatever the ends hold. A `Split` has two, a
 * side and the main part beside it. A painter with room lays them out so;
 * one without, such as a terminal line, sets them one after another.
 */
export type RowArrangement = 'Toolbar' | 'Split'

/** A vertical stack. */
export type ColumnNode = Readonly<{
  readonly _tag: 'Column'
  readonly gap: number
  readonly slot?: SlotBinding
  readonly children: ReadonlyArray<UiNode>
}>

/**
 * A layer above the page: a `Dialog`, such as a command palette, or a
 * `Panel` at the side, such as a peek at one Issue. `label` names it for a
 * screen reader. A press outside it presses `dismissToken`. A painter
 * without layers, such as a terminal, draws the box in place.
 */
export type BoxLayer = Readonly<{
  readonly kind: 'Dialog' | 'Panel'
  readonly label: string
  readonly dismissToken?: string
}>

/**
 * A padded box. `isDock` pins it to the bottom of the screen, such as a
 * now-playing bar above the tabs: graphical painters keep it in view over
 * the page and leave room for it, and a terminal draws it last. `layer`
 * shows it above the page instead.
 */
/**
 * How wide a Box keeps what it holds. `Reading` is the width words are
 * comfortably read at, however wide the window is.
 */
export type BoxMeasure = 'Reading'

export type BoxNode = Readonly<{
  readonly _tag: 'Box'
  readonly padding: number
  readonly isDock?: boolean
  readonly layer?: BoxLayer
  readonly measure?: BoxMeasure
  readonly slot?: SlotBinding
  readonly children: ReadonlyArray<UiNode>
}>

/**
 * What a seek bar lands on from `value` on, in words: the paragraph that
 * starts there, `12:03 · The keeper climbed the stairs`, or a chapter by
 * its name where its words are not at hand.
 */
export type SeekLanding = Readonly<{
  readonly value: number
  readonly text: string
}>

/**
 * A place on a timeline a person moves, a seek bar: `value` between `min`
 * and `max` in the Program's own unit, moved in `step`s. `min` defaults to
 * 0; a chapter's bar starts at the chapter's start. Moving it presses `action`
 * with the new value as its choice, `SeekTo:723000`. `valueText` is how
 * the place reads, `12:03 of 9:13:01`, for a screen reader and a terminal.
 * `landings`, in order of `value`, say what a drag will land on before it
 * is let go: a painter shows the one `seekLandingAt` gives for the place
 * under the drag.
 */
export type SeekNode = Readonly<{
  readonly _tag: 'Seek'
  readonly value: number
  readonly min?: number
  readonly max: number
  readonly step: number
  readonly action: string
  readonly label: string
  readonly valueText: string
  readonly disabled?: boolean
  readonly landings?: ReadonlyArray<SeekLanding>
}>

/**
 * How a word of a Transcript is set apart besides sounding: `Found` for
 * a word a search found, `Selected` for a word of the match a person is
 * on, and `Picked` for the word whose menu is open.
 */
export type TranscriptWordMark = 'Found' | 'Selected' | 'Picked'

/**
 * One word of a Transcript: its text, the token a press sends, whether it
 * is the one sounding now, and, when the Transcript has a clock, the place
 * the word starts at on it, `startMs`. `mark` is set on a word a search
 * found.
 */
export type TranscriptWord = Readonly<{
  readonly token: string
  readonly text: string
  readonly isCurrent?: boolean
  readonly startMs?: number
  readonly mark?: TranscriptWordMark
}>

/**
 * One thing a menu offers: its words, the press it sends, such as
 * `CopyWordLink:w4012` on a word or `Listen:a-tin-comet` on a list row,
 * and an icon where a painter shows one.
 */
export type MenuAction = Readonly<{
  readonly action: string
  readonly label: string
  readonly icon?: IconName
}>

/** One thing a word's menu offers, such as `CopyWordLink:w4012`. */
export type TranscriptWordAction = MenuAction

/**
 * The menu open on one word of a Transcript: the word's token, what the
 * menu offers, and the press that closes it, `CloseWordMenu`. Whether a
 * menu is open, and on which word, is the Program's state: a painter
 * draws the menu by that word and presses what a person picks.
 */
export type TranscriptWordMenu = Readonly<{
  readonly token: string
  readonly items: ReadonlyArray<TranscriptWordAction>
  readonly dismissAction: string
}>

/**
 * The clock a Transcript's words are timed against: the place was
 * `placeMs` at the wall-clock time `atMs`, and moves `rate` milliseconds
 * for each millisecond that passes, `1` at normal speed, `1.5` at one and
 * a half, `0` while paused. A player reports its place about once a
 * second; with the clock a painter knows the place at any moment between
 * reports, and so the word being spoken, without another Message.
 */
export type TranscriptClock = Readonly<{
  readonly placeMs: number
  readonly atMs: number
  readonly rate: number
}>

/**
 * One passage of a Transcript, a paragraph that starts at `label`, such as
 * `12:03`. Pressing the label presses `labelAction` when it has one, such
 * as `SeekTo:723000`. `isCurrent` marks the passage sounding now.
 * `heading` titles the section the passage opens, such as `Chapter 8:
 * Religion`. `speaker` says who speaks it, such as `Speaker 2`: a Program
 * names the speaker on the first passage of each run by one voice, so a
 * painter labels the run once.
 *
 * `startMs` is where the passage starts on the Transcript's clock, for a
 * page that marks or scrolls to passages by their time.
 *
 * A passage can stand apart from the rest. `isFocused` marks the passage a
 * link opened on, such as `/recording/r1/section/s7`, so a painter
 * highlights it. `isTentative` marks words still being heard, which may
 * change before they settle; a painter shows them quieter. `text` is what
 * the passage says when it has no timed words to press. `sealed` says why
 * its words are held back, `Words kept private`: a painter draws a quiet
 * placeholder in their place, and a screen reader or a terminal reads the
 * reason.
 */
export type TranscriptPassage = Readonly<{
  readonly key: string
  readonly heading?: string
  readonly speaker?: string
  readonly label: string
  readonly labelAction?: string
  readonly startMs?: number
  readonly isCurrent?: boolean
  readonly isFocused?: boolean
  readonly isTentative?: boolean
  readonly text?: string
  readonly sealed?: string
  readonly words: ReadonlyArray<TranscriptWord>
}>

/**
 * The menu open on one passage of a Transcript, opened by pressing its
 * label: the passage's key, what the menu offers, such as
 * `CopySectionText:s7`, and the press that closes it, `CloseSectionMenu`.
 * Whether it is open, and on which passage, is the Program's state, as a
 * word's menu is.
 */
export type TranscriptPassageMenu = Readonly<{
  readonly key: string
  readonly items: ReadonlyArray<MenuAction>
  readonly dismissAction: string
}>

/**
 * A bookmark in a Transcript, a place a person marked: the word that
 * starts on `startMs`. `label` names it for a screen reader,
 * `Bookmark at 12:03`; `note` is what they wrote on it; pressing the bookmark
 * or its note presses `action`, `OpenBookmark:7e1f04c2`. Graphical
 * painters draw a ribbon beside the word and the note under its
 * paragraph; a terminal stars the word.
 */
export type TranscriptBookmark = Readonly<{
  readonly startMs: number
  readonly label: string
  readonly note?: string
  readonly action?: string
}>

/**
 * Something on a Transcript's timeline that is not spoken words, such as
 * text copied or a picture taken while a recording ran. `label` is its
 * time, `12:03`, and `node` is what it shows, any part of a screen. It
 * sits before the passage `beforePassage` names by key, and after the
 * last passage when it names none, or one that is not there;
 * `transcriptEntriesOf` gives the order.
 */
export type TranscriptItem = Readonly<{
  readonly key: string
  readonly label: string
  readonly beforePassage?: string
  readonly node: UiNode
}>

/**
 * Words on a timeline that a person reads along with: passages of words,
 * the one sounding marked current. Pressing a word presses `action` with
 * the word's token, `SeekToWord:w4012`. Graphical painters keep the
 * current word in view; a terminal brackets it, `[word]`. `emptyText` is
 * what shows while there are no passages. With a `clock` and each word's
 * `startMs`, the marks say which word was sounding when the Program last
 * heard the place, and `transcriptAt` says which is sounding now. `bookmarks`
 * are the places a person marked, each on the millisecond one of the
 * words starts. `items` are what sits between the passages, such as text
 * copied while a recording ran; while there are no passages a painter
 * shows `emptyText`, then the items.
 *
 * The view and the word sounding can differ. `isFollowing` is false while
 * a person reads somewhere else: a painter then leaves the view where it
 * is and never pulls it back to the word sounding. `leaveAction` is what
 * a painter with a scrolling view presses when a person scrolls the word
 * sounding out of it, `LeavePlayhead`, so the Program knows and can offer
 * the way back. `focusToken` names a word to bring into view when it
 * changes, such as the match a person stepped to.
 *
 * A word has a menu. `wordMenuAction` is what a painter presses with a
 * word's token when a person asks for that word's menu, with a secondary
 * click or a long press: `ShowWordMenu:w4012`. `wordMenu` is the menu
 * while one is open. `passageMenu` is the menu open on a passage, which
 * a passage's `labelAction` asks for. `wordSlot` is the one binding a part
 * gives every word, each of its presses joined with the word's token by
 * the painter; `Slot.ofWords` reads it, or the binding `wordMenuAction`
 * means.
 */
export type TranscriptNode = Readonly<{
  readonly _tag: 'Transcript'
  readonly label: string
  readonly action: string
  readonly passages: ReadonlyArray<TranscriptPassage>
  readonly emptyText: string
  readonly clock?: TranscriptClock
  readonly bookmarks?: ReadonlyArray<TranscriptBookmark>
  readonly isFollowing?: boolean
  readonly leaveAction?: string
  readonly focusToken?: string
  readonly wordMenuAction?: string
  readonly wordSlot?: SlotBinding
  readonly hold?: HoldSignal
  readonly wordMenu?: TranscriptWordMenu
  readonly passageMenu?: TranscriptPassageMenu
  readonly items?: ReadonlyArray<TranscriptItem>
}>

/**
 * How far along something is: `value` of `max`, such as the minutes heard
 * of a book. `label` is what a screen reader announces, `2 hours left`.
 */
export type ProgressNode = Readonly<{
  readonly _tag: 'Progress'
  readonly value: number
  readonly max: number
  readonly label: string
}>

/**
 * A picture at the start of a list row, such as a book's cover, with the
 * words it stands for.
 */
export type ItemImage = TextImage & Readonly<{ readonly alt: string }>

/**
 * A box at the start of a list row a person ticks, such as a reminder's
 * completion circle. Pressing it presses `action`, `Complete:7e1f04c2-…`;
 * `isChecked` shows it ticked; `label` is what a screen reader announces,
 * `Complete Buy milk`. Without `action` it only shows. `extendAction` is what
 * a press with Shift held presses, where a painter has a Shift key, such as
 * selecting every row up to this one. `focused` marks it highlighted in a
 * terminal.
 */
export type ItemCheck = Readonly<{
  readonly isChecked: boolean
  readonly label: string
  readonly action?: string
  readonly extendAction?: string
  readonly focused?: boolean
}>

/**
 * A short count after a list row's title, such as `3` for the bookmarks in
 * a chapter. `label` is what it stands for, `3 bookmarks`, for a screen
 * reader and for a painter that draws no badge.
 */
export type ItemBadge = Readonly<{
  readonly text: string
  readonly label: string
}>

/**
 * The menu open on one row of a List: the row's `key`, what the menu
 * offers, and the press that closes it, `CloseTitleMenu`. Whether a menu
 * is open, and on which row, is the Program's state: a painter draws the
 * menu by that row, or as a sheet on a phone, and presses what a person
 * picks.
 */
export type ItemMenu = Readonly<{
  readonly key: string
  readonly items: ReadonlyArray<MenuAction>
  readonly dismissAction: string
}>

/**
 * One row of a List: a box to tick, a picture, a title, the lines under
 * it, how far along it is, the press the whole row sends, and buttons at
 * its end. `key` is the row's stable identity, such as the book's slug.
 * `href` makes the row a link instead, such as a bookmark's moment, so a
 * person can open it, copy it, or share it the way a platform shares any
 * link. `isDraggable` lets a person drag the row onto a list with a
 * `dropAction`, where a painter has a pointer. `columns` are short values
 * at the row's end that line up down the list, such as when a chapter
 * starts and how long it runs, `['20:00', '7:33']`; a painter that cannot
 * line them up reads them as one more line, as `itemLinesOf` says. `group`
 * names what the row belongs to, such as a bookmark's chapter: rows next to
 * each other with the same group are headed by it once, as
 * `groupedItemsOf` says. `badge` is a short count after the title, such as
 * the bookmarks in a chapter. `titleMark` names the part of the title to
 * set apart, from the character at `start` up to `end`, such as the words
 * a search found. `menuAction` is what a painter presses when a person asks
 * for the row's menu, with a long press or a secondary click:
 * `ShowTitleMenu:a-tin-comet`. A terminal has neither, so everything a
 * row's menu offers needs another way in, such as the row's own page.
 * `slot` is what a part binds on the row, the press each gesture sends and
 * what the part says of the row; a row with a `slot` is read from it, and
 * `menuAction` is the short way to say "a hold or the second button asks
 * for this", which `Slot.ofItem` turns into the same binding.
 */
export type ListItem = Readonly<{
  readonly key: string
  readonly href?: string
  readonly title: string
  readonly titleMark?: Readonly<{
    readonly start: number
    readonly end: number
  }>
  readonly lines?: ReadonlyArray<string>
  readonly columns?: ReadonlyArray<string>
  readonly group?: string
  readonly badge?: ItemBadge
  readonly check?: ItemCheck
  readonly image?: ItemImage
  readonly progress?: Readonly<{ readonly value: number; readonly max: number }>
  readonly action?: string
  readonly menuAction?: string
  readonly isCurrent?: boolean
  readonly isDraggable?: boolean
  readonly focused?: boolean
  readonly trailing?: ReadonlyArray<ButtonNode>
  readonly slot?: SlotBinding
}>

/**
 * A field over a long List that narrows its rows as a person types, such
 * as `Find a chapter` over a book's 134 chapters: the rows left are the
 * ones `filterListItems` keeps. `placeholder` shows in the empty field,
 * `label` names it for a screen reader, and `emptyText` is what shows when
 * no row is left. What is typed is held by the painter, the way a text
 * field holds a draft and a page its scroll: the Program is not told, so
 * typing sends no Message and nothing is synchronized. With `isOverLines`
 * the filter reads the lines under each title too, so a bookmark is found
 * by its note.
 */
export type ListFilter = Readonly<{
  readonly placeholder: string
  readonly label: string
  readonly emptyText: string
  readonly isOverLines?: boolean
}>

/**
 * Rows a person picks from, such as the books in a library or a book's
 * chapters: full width, one under another, each row pressable as a whole.
 * `label` names the list for a screen reader and heads it in a terminal.
 * `dropAction` takes a draggable row dropped on the list: dropping row `804`
 * on a list whose `dropAction` is `Move:Blocked` presses `Move:Blocked:804`.
 * A painter without a pointer has no drop, so every move a drop makes needs
 * another way in, such as a key. `columns` names each of the rows'
 * `columns` in order, `['Starts', 'Length']`. With `filter`, a painter that
 * takes typing offers a field over the list that narrows its rows. `menu`
 * is the menu while one is open on one of the rows. `hold` is there while
 * a hold has completed on this device: with a `press`, the painter that
 * told the press sends it, once for each `pressCount`; and while `hold`
 * is there at all, the next tap is the hold's own and a painter stops it.
 * A Transcript and a Button a part bound carry the same field.
 */
export type ListNode = Readonly<{
  readonly _tag: 'List'
  readonly label: string
  readonly items: ReadonlyArray<ListItem>
  readonly dropAction?: string
  readonly columns?: ReadonlyArray<string>
  readonly filter?: ListFilter
  readonly menu?: ItemMenu
  readonly hold?: HoldSignal
}>

/** Device chrome around a product tree. The shell does not own product buttons. */
export type DeviceShellNode = Readonly<{
  readonly _tag: 'DeviceShell'
  readonly device: Device
  readonly time: string
  readonly title?: string
  readonly children: ReadonlyArray<UiNode>
}>

/**
 * A deferred subtree whose output depends only on `fn` (a pure module-scope
 * function) and `args` (compared pairwise with `Object.is`). When resolved
 * through `Interaction.bind` (or `resolveLazyTree`), matching the same
 * `(path, key)` with the same `fn` and `Object.is`-equal `args` skips
 * calling `build` and returns the exact previous resolved `UiNode` object so
 * painters can skip unchanged subtrees by reference.
 *
 * Time, look, and every Model field read by `fn` must be passed explicitly in
 * `args` rather than captured in a closure over `Model`.
 */
export type LazyNode = Readonly<{
  readonly _tag: 'Lazy'
  readonly key?: string
  readonly fn: unknown
  readonly args: ReadonlyArray<unknown>
  readonly build: () => UiNode
}>

/** Host-neutral ASCII tree. */
export type UiNode =
  | TextNode
  | ButtonNode
  | TextInputNode
  | SpacerNode
  | RowNode
  | ColumnNode
  | BoxNode
  | ProgressNode
  | ListNode
  | SeekNode
  | TranscriptNode
  | DeviceShellNode
  | LazyNode

/**
 * A laid-out character box. `isCurrent` marks what a person is following
 * on its row, such as the chapter playing in a list or the transcript line
 * with the word sounding now, so a terminal can keep it in view.
 */
export type LayoutBox = Readonly<{
  readonly id: string
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly kind: UiNode['_tag']
  readonly device?: Device
  readonly time?: string
  readonly title?: string
  readonly text?: string
  readonly action?: HotspotAction
  readonly label?: string
  readonly isCurrent?: boolean
  readonly isShown?: boolean
  /** The roles parts of this box's text play, by column on its row. */
  readonly inks?: ReadonlyArray<InkRun>
  readonly children: ReadonlyArray<LayoutBox>
}>

/** A pressable region in painted ASCII. */
export type AsciiHotspot = Readonly<{
  readonly id: string
  readonly label: string
  readonly row: number
  readonly col: number
  readonly width: number
  readonly height: number
  readonly action: HotspotAction
}>

/** Painted ASCII plus optional Device chrome. */
export type AsciiFrame = Readonly<{
  readonly maybeDevice: Device | undefined
  readonly lines: ReadonlyArray<string>
  /**
   * The roles the parts of each line play, one list per line, for a
   * terminal to ink from the theme.
   */
  readonly inks: ReadonlyArray<ReadonlyArray<InkRun>>
  readonly hotspots: ReadonlyArray<AsciiHotspot>
}>
