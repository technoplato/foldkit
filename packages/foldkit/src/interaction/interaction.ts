import { Array, Match as M, Option, Schema as S, pipe } from 'effect'

import {
  type AnyCatalog,
  type Entry,
  type MessageOf,
  type ModelOf,
  entries,
  isEnabled,
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

const deleteCharacter = '\u007f'

const isPrintableCharacter = (text: string): boolean =>
  text.length === 1 && text >= ' ' && text !== deleteCharacter

/**
 * A key press as a terminal reports it: the character it typed when it
 * typed a printable one, else its key name. So Shift-J reads `J`, which
 * jumps to the last menu row, while Ctrl-K reads `k` with Control held
 * and an arrow reads `ArrowUp`.
 *
 * @example
 * ```typescript
 * terminalKeyInput({ sequence: 'J', name: 'j', isMeta: false, isControl: false, isShift: true })
 * // { key: 'J', isShift: true, ... }
 * terminalKeyInput({ sequence: '\u000b', name: 'k', isMeta: false, isControl: true, isShift: false })
 * // { key: 'k', isControl: true, ... }
 * ```
 */
export const terminalKeyInput = (
  key: Readonly<{
    sequence: string
    name: string
    isMeta: boolean
    isControl: boolean
    isShift: boolean
  }>,
): KeyInput => {
  const isTyped =
    isPrintableCharacter(key.sequence) && !key.isControl && !key.isMeta
  const name = key.name === '' ? key.sequence : key.name
  return keyInput(normalizeKey(isTyped ? key.sequence : name), {
    isMeta: key.isMeta,
    isControl: key.isControl,
    isShift: key.isShift,
  })
}

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

// PLATFORM

/**
 * How a person reaches keys on this device: a Mac keyboard shows `⌘K`,
 * another keyboard `Ctrl+K`, and a touch screen no shortcut at all.
 */
export const KeyPlatform = S.Literals(['Mac', 'Other', 'Touch'])
/** How a person reaches keys on this device. */
export type KeyPlatform = typeof KeyPlatform.Type

const macPlatformPattern = /Mac|iPhone|iPad|iPod/i

const mobilePlatformPattern = /Android|iPhone|iPad|iPod|Mobile/i

/**
 * The key platform a browser reports. A host passes `navigator`.
 *
 * @example
 * ```typescript
 * keyPlatformOf({ platform: 'MacIntel', userAgent: '...', maxTouchPoints: 0 }) // 'Mac'
 * keyPlatformOf({ platform: 'Linux armv8l', userAgent: '... Android ...', maxTouchPoints: 5 }) // 'Touch'
 * ```
 */
export const keyPlatformOf = (
  navigatorLike: Readonly<{
    platform?: string
    userAgent?: string
    maxTouchPoints?: number
  }>,
): KeyPlatform => {
  const description = `${navigatorLike.platform ?? ''} ${navigatorLike.userAgent ?? ''}`
  const isTouchFirst =
    mobilePlatformPattern.test(description) &&
    (navigatorLike.maxTouchPoints ?? 0) > 0
  if (isTouchFirst) {
    return 'Touch'
  } else if (macPlatformPattern.test(navigatorLike.platform ?? '')) {
    return 'Mac'
  } else {
    return 'Other'
  }
}

/**
 * How a key reads on a platform: `⌘K` on a Mac, `Ctrl+K` elsewhere, and
 * the key itself when it is not a chord.
 *
 * @example
 * ```typescript
 * shortcutOf(keyInput('k', { isMeta: true }), 'Mac') // '⌘K'
 * shortcutOf(keyInput('k', { isControl: true }), 'Other') // 'Ctrl+K'
 * shortcutOf(keyInput('?'), 'Other') // '?'
 * ```
 */
export const shortcutOf = (key: KeyInput, platform: KeyPlatform): string => {
  const letter = key.key.length === 1 ? key.key.toUpperCase() : key.key
  if (key.isMeta) {
    return platform === 'Mac' ? `⌘${letter}` : `Meta+${letter}`
  } else if (key.isControl) {
    return platform === 'Mac' ? `⌃${letter}` : `Ctrl+${letter}`
  } else {
    return key.key
  }
}

/**
 * How a menu row's number reads on a platform: `⌘3` on a Mac, `Ctrl+3`
 * elsewhere, and None on a touch screen.
 *
 * @example
 * ```typescript
 * pickShortcutOf(3, 'Mac') // Some('⌘3')
 * pickShortcutOf(3, 'Touch') // None
 * ```
 */
export const pickShortcutOf = (
  pick: number,
  platform: KeyPlatform,
): Option.Option<string> =>
  M.value(platform).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.when('Mac', () =>
      Option.some(shortcutOf(keyInput(String(pick), { isMeta: true }), 'Mac')),
    ),
    M.when('Other', () =>
      Option.some(
        shortcutOf(keyInput(String(pick), { isControl: true }), 'Other'),
      ),
    ),
    M.when('Touch', () => Option.none()),
    M.exhaustive,
  )

const browserOwnedChordKeys: ReadonlySet<string> = new Set([
  '+',
  '=',
  '-',
  '_',
  '0',
  'a',
  'c',
  'd',
  'f',
  'h',
  'l',
  'n',
  'p',
  'q',
  'r',
  's',
  't',
  'v',
  'w',
  'x',
  'y',
  'z',
  '[',
  ']',
  ',',
])

/**
 * True for a chord the browser already owns: zoom (`⌘+`, `⌘-`, `⌘0`),
 * reload, tabs and windows, the address bar, find, print, save,
 * bookmarks, history, editing, and back and forward. A Program never
 * takes one, so `⌘-` always zooms out. `⌘1` to `⌘9` switch tabs too; only
 * the open action menu takes them, to pick a row.
 *
 * @example
 * ```typescript
 * isBrowserOwnedChord(keyInput('-', { isMeta: true })) // true
 * isBrowserOwnedChord(keyInput('k', { isMeta: true })) // false
 * isBrowserOwnedChord(keyInput('r')) // false
 * ```
 */
export const isBrowserOwnedChord = (input: KeyInput): boolean =>
  isChord(input) &&
  browserOwnedChordKeys.has(normalizeKey(input.key).toLowerCase())

const preferredShortcut = (
  keys: ReadonlyArray<KeyInput>,
  platform: KeyPlatform,
): Option.Option<KeyInput> =>
  M.value(platform).pipe(
    M.withReturnType<Option.Option<KeyInput>>(),
    M.when('Mac', () => Array.findFirst(keys, key => key.isMeta)),
    M.when('Other', () => Array.findFirst(keys, key => key.isControl)),
    M.when('Touch', () => Option.none()),
    M.exhaustive,
  )

/**
 * A control that opens the action menu, as a Client shows it: the menu's
 * title and, where the platform has a keyboard, its shortcut.
 */
export type MenuOpener = Readonly<{
  title: string
  maybeShortcut: Option.Option<string>
  label: string
}>

/**
 * The menu opener a Program declares, for one platform. None for a
 * Program without a menu.
 *
 * @example
 * ```typescript
 * menuOpenerOf(App.interaction, 'Mac') // Some({ title: 'Actions', label: 'Actions (⌘K)', ... })
 * menuOpenerOf(App.interaction, 'Touch') // Some({ title: 'Actions', label: 'Actions', ... })
 * ```
 */
export const menuOpenerOf = (
  interaction: Readonly<{
    menuTitle: Option.Option<string>
    menuKeys: ReadonlyArray<KeyInput>
  }>,
  platform: KeyPlatform,
): Option.Option<MenuOpener> =>
  Option.map(interaction.menuTitle, title => {
    const maybeShortcut = Option.map(
      preferredShortcut(interaction.menuKeys, platform),
      key => shortcutOf(key, platform),
    )
    return {
      title,
      maybeShortcut,
      label: Option.match(maybeShortcut, {
        onNone: () => title,
        onSome: shortcut => `${title} (${shortcut})`,
      }),
    }
  })

// STATUS

/** The Program accepts Actions. */
export const Ready = ts('Ready')
/**
 * The Program is still starting, for example waiting for its first read
 * of the log. `description` is safe to show, such as `Starting Counter…`.
 */
export const Starting = ts('Starting', { description: S.String })
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
 * The menu's hints as one terminal line.
 *
 * @example
 * ```typescript
 * hintLineOf(menu.hints) // '[↑↓] move  [↵] run  [esc] close'
 * ```
 */
export const hintLineOf = (hints: ReadonlyArray<MenuHint>): string =>
  pipe(
    hints,
    Array.map(hint => `[${Array.join(hint.keys, '')}] ${hint.does}`),
    Array.join('  '),
  )

/**
 * One visible action menu row. `title` reads the Action's tag as words,
 * `Open session settings` for `OpenSessionSettings`, and `description` is
 * its `what`; both mark the letters the query matched. `spokenLabel` is
 * what a screen reader says for the row, `Reset, Sets the count to 0,
 * unavailable: count is already 0`. `keys` is the shortcut shown beside
 * the row, `['r']` for Reset. `isNested` marks a row that opens a list of
 * choices instead of running, such as Decrement counter. Unavailable rows
 * come after the available ones, and `isFirstUnavailable` marks the first
 * of them when any row above is available, so a painter draws a hairline
 * between the two groups. `maybePick` numbers the first nine rows that
 * can run, so `⌘3` runs the third. `isHighlighted` marks the row Enter
 * sends; `isFocused` marks the row that has the keyboard.
 */
export type MenuRow = Readonly<{
  entry: Entry
  title: ReadonlyArray<TextRun>
  description: ReadonlyArray<TextRun>
  spokenLabel: string
  keys: ReadonlyArray<string>
  isNested: boolean
  isFirstUnavailable: boolean
  maybePick: Option.Option<number>
  isHighlighted: boolean
  isFocused: boolean
}>

/**
 * The presented action menu as every Client paints it, text included, so
 * a Client only maps it to its own controls. Rows are the Catalog ranked
 * by `query`. `filterLabel` names the search field, `Search actions`, and
 * `dismissLabel` the control that closes the menu, `Close actions`.
 * `summary` counts the rows for a screen reader, `3 actions` or
 * `No actions match “zz”`. `hints` are the keys that work right now.
 * `style` says how to present it: a centered dialog on web, a modal on
 * React Native, a boxed prompt in a terminal.
 */
export type MenuView = Readonly<{
  title: string
  filterLabel: string
  dismissLabel: string
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
 * working buttons, keys, and menus. `menuTitle` and `menuKeys` name the
 * action menu and the keys that open it, so a host can offer an opener,
 * `Actions (⌘K)`, without naming either.
 *
 * @example
 * ```typescript
 * // count is 3, a person presses `r`
 * program.interaction.pressKey(model, keyInput('r')) // [Reset()]
 * ```
 */
export type ProgramInteraction<Model, Message> = Readonly<{
  menuTitle: Option.Option<string>
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

const isKeyOffered = (entry: Entry): boolean =>
  Option.match(entry.maybeChoices, {
    onNone: () => isEnabled(entry.availability),
    onSome: choices =>
      Option.exists(choices.maybePreferred, token =>
        Array.some(
          choices.choices,
          choice => choice.token === token && isEnabled(choice.availability),
        ),
      ),
  })

/**
 * The entry whose keys include a key press, for a Program whose entries
 * change with its Model, such as a list whose shown row owns `+`. Two
 * Actions may share a key when only one is offered at a time, such as
 * Play and Pause on `p`: the offered one takes it, and a choosing Action
 * counts as offered only while its preferred choice is. A chord owns no
 * entry.
 *
 * @example
 * ```typescript
 * keyedEntryOf(entries(model), keyInput('+')) // Some(Increment entry)
 * keyedEntryOf(entries(playing), keyInput('p')) // Some(Pause entry)
 * keyedEntryOf(entries(model), keyInput('k', { isMeta: true })) // None
 * ```
 */
export const keyedEntryOf = (
  catalogEntries: ReadonlyArray<Entry>,
  input: KeyInput,
): Option.Option<Entry> => {
  if (isChord(input)) {
    return Option.none()
  } else {
    const keyed = Array.filter(catalogEntries, entry =>
      Array.contains(entry.keys, normalizeKey(input.key)),
    )
    return Option.orElse(Array.findFirst(keyed, isKeyOffered), () =>
      Array.head(keyed),
    )
  }
}

/**
 * How a key moves the keyboard between the buttons of a screen presented
 * over the page, such as "Delete Counter 3?": Tab and the arrows step
 * through them and wrap, so the dialog keeps the keyboard until it is
 * answered. None for any other key, which goes to the Program.
 *
 * @example
 * ```typescript
 * presentedFocusMoveOf(keyInput('Tab')) // Some('Next')
 * presentedFocusMoveOf(keyInput('Tab', { isShift: true })) // Some('Previous')
 * presentedFocusMoveOf(keyInput('y')) // None
 * ```
 */
export const presentedFocusMoveOf = (
  input: KeyInput,
): Option.Option<'Next' | 'Previous'> => {
  const key = normalizeKey(input.key)
  if (input.isMeta || input.isControl) {
    return Option.none()
  } else if (key === 'Tab') {
    return Option.some(input.isShift ? 'Previous' : 'Next')
  } else if (key === 'ArrowRight' || key === 'ArrowDown') {
    return Option.some('Next')
  } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
    return Option.some('Previous')
  } else {
    return Option.none()
  }
}

/**
 * The words on a copy button: what it does, and what it says once the text
 * is on the clipboard. Every painter with a clipboard shows these.
 *
 * @example
 * ```typescript
 * copyButtonLabelOf(false) // 'Copy'
 * copyButtonLabelOf(true) // 'Copied'
 * ```
 */
export const copyButtonLabelOf = (isCopied: boolean): string =>
  isCopied ? 'Copied' : 'Copy'

const noMessages = (): ReadonlyArray<never> => []

/**
 * Derives the interaction of a Program that has a Catalog and no menu.
 * Buttons and keys send Enabled payload-free Actions; everything else is
 * inert.
 */
export const fromCatalog = <C extends AnyCatalog>(
  catalog: C,
): ProgramInteraction<ModelOf<C>, MessageOf<C>> => ({
  menuTitle: Option.none(),
  menuKeys: [],
  status: () => Ready(),
  entries: model => entries(catalog, model),
  press: (model, tag) => Array.fromOption(messageFor(catalog, model, tag)),
  pressKey: (model, input) =>
    pipe(
      keyedEntryOf(entries(catalog, model), input),
      Option.flatMap(entry => messageFor(catalog, model, entry.tag)),
      Array.fromOption,
    ),
  menu: () => Option.none(),
  openMenu: noMessages,
  dismissMenu: noMessages,
  typeInMenu: noMessages,
  chooseFromMenu: noMessages,
})
