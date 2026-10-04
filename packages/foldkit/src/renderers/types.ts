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

export type TextNode = Readonly<{
  readonly _tag: 'Text'
  readonly content: string
  readonly image?: TextImage
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
 * such as Library and Profile, the current one marked with `isCurrent`.
 */
export type ButtonVariant = 'Primary' | 'Ghost' | 'Destructive' | 'Tab'

/**
 * A pressable control. The label is product data. `action` is the Catalog
 * tag a press sends; `keys` are the keys its Action declares, `['+', '=']`
 * for Increment; `because` is the sentence a disabled control shows.
 * `icon` draws beside the label, or instead of it with `isIconOnly`, the
 * label then left for screen readers. `isCurrent` marks the current tab.
 */
export type ButtonNode = Readonly<{
  readonly _tag: 'Button'
  readonly label: string
  readonly token?: string
  readonly action?: string
  readonly keys?: ReadonlyArray<string>
  readonly because?: string
  readonly variant?: ButtonVariant
  readonly icon?: IconName
  readonly isIconOnly?: boolean
  readonly isCurrent?: boolean
  readonly disabled?: boolean
  readonly focused?: boolean
}>

/** A Model-bound text field. */
export type TextInputNode = Readonly<{
  readonly _tag: 'TextInput'
  readonly value: string
  readonly placeholder?: string
  readonly focused?: boolean
  readonly width?: number
  readonly token?: string
}>

/** Fixed blank rows. */
export type SpacerNode = Readonly<{
  readonly _tag: 'Spacer'
  readonly rows: number
}>

/** A horizontal stack. */
export type RowNode = Readonly<{
  readonly _tag: 'Row'
  readonly gap: number
  readonly children: ReadonlyArray<UiNode>
}>

/** A vertical stack. */
export type ColumnNode = Readonly<{
  readonly _tag: 'Column'
  readonly gap: number
  readonly children: ReadonlyArray<UiNode>
}>

/**
 * A padded box. `isDock` pins it to the bottom of the screen, such as a
 * now-playing bar above the tabs: graphical painters keep it in view over
 * the page and leave room for it, and a terminal draws it last.
 */
export type BoxNode = Readonly<{
  readonly _tag: 'Box'
  readonly padding: number
  readonly isDock?: boolean
  readonly children: ReadonlyArray<UiNode>
}>

/**
 * A place on a timeline a person moves, a seek bar: `value` between `min`
 * and `max` in the Program's own unit, moved in `step`s. `min` defaults to
 * 0; a chapter's bar starts at the chapter's start. Moving it presses `action`
 * with the new value as its choice, `SeekTo:723000`. `valueText` is how
 * the place reads, `12:03 of 9:13:01`, for a screen reader and a terminal.
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
}>

/**
 * One word of a Transcript: its text, the token a press sends, and
 * whether it is the one sounding now.
 */
export type TranscriptWord = Readonly<{
  readonly token: string
  readonly text: string
  readonly isCurrent?: boolean
}>

/**
 * One passage of a Transcript, a paragraph that starts at `label`, such as
 * `12:03`. Pressing the label presses `labelAction` when it has one, such
 * as `SeekTo:723000`. `isCurrent` marks the passage sounding now.
 * `heading` titles the section the passage opens, such as `Chapter 8:
 * Religion`.
 */
export type TranscriptPassage = Readonly<{
  readonly key: string
  readonly heading?: string
  readonly label: string
  readonly labelAction?: string
  readonly isCurrent?: boolean
  readonly words: ReadonlyArray<TranscriptWord>
}>

/**
 * Words on a timeline that a person reads along with: passages of words,
 * the one sounding marked current. Pressing a word presses `action` with
 * the word's token, `SeekToWord:w4012`. Graphical painters keep the
 * current word in view; a terminal brackets it, `[word]`. `emptyText` is
 * what shows while there are no passages.
 */
export type TranscriptNode = Readonly<{
  readonly _tag: 'Transcript'
  readonly label: string
  readonly action: string
  readonly passages: ReadonlyArray<TranscriptPassage>
  readonly emptyText: string
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
 * One row of a List: a picture, a title, the lines under it, how far
 * along it is, the press the whole row sends, and buttons at its end.
 * `key` is the row's stable identity, such as the book's slug. `href`
 * makes the row a link instead, such as a bookmark's moment, so a person
 * can open it, copy it, or share it the way a platform shares any link.
 */
export type ListItem = Readonly<{
  readonly key: string
  readonly href?: string
  readonly title: string
  readonly lines?: ReadonlyArray<string>
  readonly image?: ItemImage
  readonly progress?: Readonly<{ readonly value: number; readonly max: number }>
  readonly action?: string
  readonly isCurrent?: boolean
  readonly focused?: boolean
  readonly trailing?: ReadonlyArray<ButtonNode>
}>

/**
 * Rows a person picks from, such as the books in a library or a book's
 * chapters: full width, one under another, each row pressable as a whole.
 * `label` names the list for a screen reader and heads it in a terminal.
 */
export type ListNode = Readonly<{
  readonly _tag: 'List'
  readonly label: string
  readonly items: ReadonlyArray<ListItem>
}>

/** Device chrome around a product tree. The shell does not own product buttons. */
export type DeviceShellNode = Readonly<{
  readonly _tag: 'DeviceShell'
  readonly device: Device
  readonly time: string
  readonly title?: string
  readonly children: ReadonlyArray<UiNode>
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

/** A laid-out character box. */
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
  readonly hotspots: ReadonlyArray<AsciiHotspot>
}>
