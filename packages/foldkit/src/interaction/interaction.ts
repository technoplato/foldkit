import { Array, Option, Schema as S, pipe } from 'effect'

import {
  type AnyCatalog,
  type Entry,
  type MessageOf,
  type ModelOf,
  entries,
  findByKey,
  messageFor,
} from '../catalog/catalog.js'
import { type PresentationStyle } from '../navigation/structure.js'
import { ts } from '../schema/index.js'

// KEY

/**
 * A key press as every Client reports it, in browser `KeyboardEvent.key`
 * spelling. Terminal Clients pass their key name; {@link normalizeKey}
 * translates `return` to `Enter` and `up` to `ArrowUp`.
 *
 * @example
 * ```typescript
 * KeyInput.make({ key: 'k', isMeta: true, isControl: false, isShift: false })
 * ```
 */
export const KeyInput = S.Struct({
  key: S.String,
  isMeta: S.Boolean,
  isControl: S.Boolean,
  isShift: S.Boolean,
})
/** A key press as every Client reports it. */
export type KeyInput = typeof KeyInput.Type

/**
 * Builds a KeyInput. Modifiers default to released.
 *
 * @example
 * ```typescript
 * keyInput('+')
 * keyInput('k', { isMeta: true })
 * ```
 */
export const keyInput = (
  key: string,
  modifiers: Partial<Omit<KeyInput, 'key'>> = {},
): KeyInput => ({
  key,
  isMeta: modifiers.isMeta ?? false,
  isControl: modifiers.isControl ?? false,
  isShift: modifiers.isShift ?? false,
})

const keyAliases: ReadonlyMap<string, string> = new Map([
  ['up', 'ArrowUp'],
  ['down', 'ArrowDown'],
  ['left', 'ArrowLeft'],
  ['right', 'ArrowRight'],
  ['return', 'Enter'],
  ['enter', 'Enter'],
  ['\r', 'Enter'],
  ['\n', 'Enter'],
  ['escape', 'Escape'],
  ['esc', 'Escape'],
  ['tab', 'Tab'],
  ['\t', 'Tab'],
  ['backspace', 'Backspace'],
  ['\u007f', 'Backspace'],
  ['\b', 'Backspace'],
  ['space', ' '],
])

/**
 * Translates terminal key names to browser spelling so one routing table
 * serves every Client.
 *
 * @example
 * ```typescript
 * normalizeKey('return') // 'Enter'
 * normalizeKey('+') // '+'
 * ```
 */
export const normalizeKey = (key: string): string =>
  Option.getOrElse(Option.fromNullishOr(keyAliases.get(key)), () => key)

/** True when Command or Control is held. Those chords never type text. */
export const isChord = (input: KeyInput): boolean =>
  input.isMeta || input.isControl

/**
 * True when a key press is a declared key: the same key, ignoring case,
 * with or without a Command or Control chord as declared.
 *
 * @example
 * ```typescript
 * isKey(keyInput('k', { isMeta: true }), keyInput('K', { isMeta: true })) // true
 * isKey(keyInput('?'), keyInput('k', { isMeta: true })) // false
 * ```
 */
export const isKey = (declared: KeyInput, input: KeyInput): boolean =>
  declared.key.toLowerCase() === normalizeKey(input.key).toLowerCase() &&
  isChord(declared) === isChord(input)

/**
 * The terminal hint for opening the action menu: its first key a terminal
 * can type, such as `[?] actions`. None for a Program without a menu.
 *
 * @example
 * ```typescript
 * menuHintOf([keyInput('?'), keyInput('k', { isMeta: true })]) // Some('[?] actions')
 * menuHintOf([]) // None
 * ```
 */
export const menuHintOf = (
  keys: ReadonlyArray<KeyInput>,
): Option.Option<string> =>
  Option.map(
    Array.findFirst(keys, key => !isChord(key)),
    key => `[${key.key}] actions`,
  )

// STATUS

/** The Program accepts Actions. */
export const Ready = ts('Ready')
/** The Program is still starting, for example waiting for a sync snapshot. */
export const Starting = ts('Starting')
/** The Program could not start. `description` is safe to show. */
export const Failed = ts('Failed', { description: S.String })

/** Whether a Program occurrence accepts Actions right now. */
export const Status = S.Union([Ready, Starting, Failed])
/** Whether a Program occurrence accepts Actions right now. */
export type Status = typeof Status.Type

// MENU

/**
 * One run of menu text: letters the query matched, or the letters between
 * them. `Reset` filtered by `rs` is `R` matched, `e`, `s` matched, `et`.
 */
export type TextRun = Readonly<{ text: string; isMatch: boolean }>

/** The plain text of runs, for a Client that cannot mark matches. */
export const textOf = (runs: ReadonlyArray<TextRun>): string =>
  pipe(
    runs,
    Array.map(run => run.text),
    Array.join(''),
  )

/** One footer hint: the keys, and what they do, such as `↑ ↓ move`. */
export type MenuHint = Readonly<{ keys: ReadonlyArray<string>; does: string }>

/**
 * One visible action menu row. `title` reads the Action's tag as words,
 * `Open session settings` for `OpenSessionSettings`, and `description` is
 * its `what`; both mark the letters the query matched. `keys` is the
 * shortcut shown beside the row, `['r']` for Reset. `isHighlighted` marks
 * the row Enter sends; `isFocused` marks the row that has the keyboard.
 */
export type MenuRow = Readonly<{
  entry: Entry
  title: ReadonlyArray<TextRun>
  description: ReadonlyArray<TextRun>
  keys: ReadonlyArray<string>
  isHighlighted: boolean
  isFocused: boolean
}>

/**
 * The presented action menu as every Client paints it, text included, so
 * a Client only maps it to its own controls. Rows are the Catalog ranked
 * by `query`. `filterLabel` names the search field, `Search actions`.
 * `summary` counts the rows for a screen reader, `3 actions` or
 * `No actions match “zz”`. `hints` are the keys that work right now.
 * `style` says how to present it: a centered dialog on web, a modal on
 * React Native, a boxed prompt in a terminal.
 */
export type MenuView = Readonly<{
  title: string
  filterLabel: string
  query: string
  isFilterFocused: boolean
  rows: ReadonlyArray<MenuRow>
  summary: string
  hints: ReadonlyArray<MenuHint>
  style: PresentationStyle
}>

// INTERACTION

/**
 * How any Client drives a Program without knowing its Messages. Every
 * function is pure: it reads the current Model and returns the Messages to
 * send, possibly none. Combinators lift this so a composed Program keeps
 * working buttons, keys, and menus. `menuKeys` are the keys that open the
 * action menu, so a host can hint at them without naming them.
 *
 * @example
 * ```typescript
 * // count is 3, a person presses `r`
 * program.interaction.pressKey(model, keyInput('r')) // [Reset()]
 * ```
 */
export type ProgramInteraction<Model, Message> = Readonly<{
  menuKeys: ReadonlyArray<KeyInput>
  status: (model: Model) => Status
  entries: (model: Model) => ReadonlyArray<Entry>
  press: (model: Model, tag: string) => ReadonlyArray<Message>
  pressKey: (model: Model, input: KeyInput) => ReadonlyArray<Message>
  menu: (model: Model) => Option.Option<MenuView>
  openMenu: (model: Model) => ReadonlyArray<Message>
  dismissMenu: (model: Model) => ReadonlyArray<Message>
  typeInMenu: (model: Model, query: string) => ReadonlyArray<Message>
  chooseFromMenu: (model: Model, tag: string) => ReadonlyArray<Message>
}>

const noMessages = (): ReadonlyArray<never> => []

/**
 * Derives the interaction of a Program that has a Catalog and no menu.
 * Buttons and keys send Enabled payload-free Actions; everything else is
 * inert.
 */
export const fromCatalog = <C extends AnyCatalog>(
  catalog: C,
): ProgramInteraction<ModelOf<C>, MessageOf<C>> => ({
  menuKeys: [],
  status: () => Ready(),
  entries: model => entries(catalog, model),
  press: (model, tag) => Array.fromOption(messageFor(catalog, model, tag)),
  pressKey: (model, input) => {
    if (isChord(input)) {
      return []
    }
    return pipe(
      findByKey(catalog, normalizeKey(input.key)),
      Option.flatMap(declaration =>
        messageFor(catalog, model, declaration.tag),
      ),
      Array.fromOption,
    )
  },
  menu: () => Option.none(),
  openMenu: noMessages,
  dismissMenu: noMessages,
  typeInMenu: noMessages,
  chooseFromMenu: noMessages,
})
