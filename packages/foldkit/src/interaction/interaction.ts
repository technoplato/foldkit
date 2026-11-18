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

const escapeKey = 'Escape'

/**
 * A key press as a terminal reports it: the character it typed when it
 * typed a printable one, else its key name. So Shift-J reads `J`, which
 * jumps to the last menu row, while Ctrl-K reads `k` with Control held
 * and an arrow reads `ArrowUp`. A terminal sends Meta as a leading
 * Escape, so Node's readline reports the Escape key itself with Meta
 * held; Escape always reads as plain Escape, the key that goes back.
 *
 * @example
 * ```typescript
 * terminalKeyInput({ sequence: 'J', name: 'j', isMeta: false, isControl: false, isShift: true })
 * // { key: 'J', isShift: true, ... }
 * terminalKeyInput({ sequence: '\u000b', name: 'k', isMeta: false, isControl: true, isShift: false })
 * // { key: 'k', isControl: true, ... }
 * terminalKeyInput({ sequence: '\u001b', name: 'escape', isMeta: true, isControl: false, isShift: false })
 * // { key: 'Escape', isMeta: false, ... }
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
  const pressed = normalizeKey(isTyped ? key.sequence : name)
  return keyInput(pressed, {
    isMeta: key.isMeta && pressed !== escapeKey,
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
 * takes one, so `⌘-` always zooms out. The chord that switches tabs
 * depends on the platform; {@link isHostOwnedKey} adds it.
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

// HOST

/**
 * Who shares the keyboard with a Program. A browser takes its own chords
 * before a page hears them: `⌘2` switches to the second tab in Safari
 * whatever the page does. A native window passes every key on, and a
 * terminal never passes Command on. A Program declares the keys it
 * prefers; each Client names its host, shows only the keys that host
 * leaves, and refuses the rest.
 */
export const KeyHost = S.Literals(['Browser', 'Native', 'Terminal'])
/** Who shares the keyboard with a Program. */
export type KeyHost = typeof KeyHost.Type

const tabDigitPattern = /^[1-9]$/

const isBrowserTabChord = (platform: KeyPlatform, input: KeyInput): boolean =>
  tabDigitPattern.test(normalizeKey(input.key)) &&
  (platform === 'Mac' ? input.isMeta : input.isControl)

/**
 * True for a key press the host keeps for itself, so a Program must not
 * take it or show it. A browser keeps its chords ({@link
 * isBrowserOwnedChord}) and the chord that switches tabs: `⌘1` to `⌘9` on
 * a Mac, `Ctrl+1` to `Ctrl+9` elsewhere. On a Mac it leaves `⌃1` to `⌃9`.
 * A native window keeps nothing. A terminal keeps every Command chord.
 *
 * @example
 * ```typescript
 * isHostOwnedKey('Browser', 'Mac', keyInput('2', { isMeta: true })) // true
 * isHostOwnedKey('Browser', 'Mac', keyInput('2', { isControl: true })) // false
 * isHostOwnedKey('Native', 'Mac', keyInput('2', { isMeta: true })) // false
 * ```
 */
export const isHostOwnedKey = (
  host: KeyHost,
  platform: KeyPlatform,
  input: KeyInput,
): boolean =>
  M.value(host).pipe(
    M.withReturnType<boolean>(),
    M.when(
      'Browser',
      () => isBrowserOwnedChord(input) || isBrowserTabChord(platform, input),
    ),
    M.when('Native', () => false),
    M.when('Terminal', () => input.isMeta),
    M.exhaustive,
  )

const pickChordsOf = (
  pick: number,
  platform: KeyPlatform,
): ReadonlyArray<KeyInput> =>
  M.value(platform).pipe(
    M.withReturnType<ReadonlyArray<KeyInput>>(),
    M.when('Mac', () => [
      keyInput(String(pick), { isMeta: true }),
      keyInput(String(pick), { isControl: true }),
    ]),
    M.when('Other', () => [keyInput(String(pick), { isControl: true })]),
    M.when('Touch', () => []),
    M.exhaustive,
  )

/**
 * How a menu row's number reads: the first chord for it the host leaves
 * to the Program. A native Mac window shows `⌘3`. A browser on a Mac shows
 * `⌃3`, because `⌘3` switches tabs there. None where the host keeps every
 * chord, such as a browser off a Mac, and on a touch screen.
 *
 * @example
 * ```typescript
 * pickShortcutOf(3, 'Mac', 'Native') // Some('⌘3')
 * pickShortcutOf(3, 'Mac', 'Browser') // Some('⌃3')
 * pickShortcutOf(3, 'Touch', 'Browser') // None
 * ```
 */
export const pickShortcutOf = (
  pick: number,
  platform: KeyPlatform,
  host: KeyHost,
): Option.Option<string> =>
  Option.map(
    Array.findFirst(
      pickChordsOf(pick, platform),
      chord => !isHostOwnedKey(host, platform, chord),
    ),
    chord => shortcutOf(chord, platform),
  )

const keyNames: ReadonlyMap<string, string> = new Map([
  ['Escape', 'esc'],
  [' ', 'space'],
  ['Enter', '↵'],
  ['ArrowUp', '↑'],
  ['ArrowDown', '↓'],
  ['ArrowLeft', '←'],
  ['ArrowRight', '→'],
  ['Backspace', '⌫'],
  ['Tab', 'tab'],
])

/**
 * The keys an Action declares, as a person on this platform and host
 * reads them, without any the host keeps: `p` stays `p`, `Escape` reads
 * `esc`, a space reads `space`. Empty on a touch screen.
 *
 * @example
 * ```typescript
 * shortcutsOf(['p', 'k'], 'Mac', 'Browser') // ['p', 'k']
 * shortcutsOf(['Escape'], 'Mac', 'Browser') // ['esc']
 * shortcutsOf(['p'], 'Touch', 'Browser') // []
 * ```
 */
export const shortcutsOf = (
  keys: ReadonlyArray<string>,
  platform: KeyPlatform,
  host: KeyHost,
): ReadonlyArray<string> =>
  platform === 'Touch'
    ? []
    : pipe(
        keys,
        Array.map(normalizeKey),
        Array.filter(key => !isHostOwnedKey(host, platform, keyInput(key))),
        Array.map(key =>
          Option.getOrElse(Option.fromNullishOr(keyNames.get(key)), () => key),
        ),
      )

// ECHO

/**
 * What a key press did, for a Client to show for a moment: the Action it
 * ran, `Play title`, the keys that were pressed, and a note when it did
 * nothing, `Unavailable: count is already 0`.
 */
export type Echo = Readonly<{
  title: string
  maybeNote: Option.Option<string>
  keys: ReadonlyArray<string>
}>

// HINT

/**
 * What a Client says about one control when a pointer rests on it or the
 * keyboard reaches it: what a press does, the keys that press it here,
 * and why it is unavailable. `maybeTitle` names a control that shows only
 * an icon. `spoken` is the same for a screen reader, in one line.
 */
export type ControlHint = Readonly<{
  maybeTitle: Option.Option<string>
  maybeDescription: Option.Option<string>
  shortcuts: ReadonlyArray<string>
  maybeBecause: Option.Option<string>
  spoken: string
}>

/**
 * The hint for one control, from what its Action declares: the
 * description, the keys this platform and host leave it, and the reason
 * it is unavailable. None for a control with nothing to add to its label.
 *
 * @example
 * ```typescript
 * controlHintOf({ label: 'Reset', description: 'Sets the count to 0', keys: ['r'] }, 'Mac', 'Browser')
 * // Some({ maybeDescription: Some('Sets the count to 0'), shortcuts: ['r'], ... })
 * controlHintOf({ label: 'Close' }, 'Mac', 'Browser') // None
 * ```
 */
export const controlHintOf = (
  control: Readonly<{
    label: string
    description?: string | undefined
    keys?: ReadonlyArray<string> | undefined
    because?: string | undefined
    isIconOnly?: boolean | undefined
  }>,
  platform: KeyPlatform,
  host: KeyHost,
): Option.Option<ControlHint> => {
  const maybeTitle =
    control.isIconOnly === true ? Option.some(control.label) : Option.none()
  const maybeDescription = Option.filter(
    Option.fromNullishOr(control.description),
    description => description !== '',
  )
  const maybeBecause = Option.fromNullishOr(control.because)
  const shortcuts = shortcutsOf(control.keys ?? [], platform, host)
  const hasNothingToAdd =
    Option.isNone(maybeTitle) &&
    Option.isNone(maybeDescription) &&
    Option.isNone(maybeBecause) &&
    Array.isReadonlyArrayEmpty(shortcuts)
  return hasNothingToAdd
    ? Option.none()
    : Option.some({
        maybeTitle,
        maybeDescription,
        shortcuts,
        maybeBecause,
        spoken: Array.join(
          [
            ...Array.fromOption(maybeDescription),
            ...Array.fromOption(
              Option.map(maybeBecause, because => `Unavailable: ${because}`),
            ),
          ],
          '. ',
        ),
      })
}

/** The attributes that carry a control's hint in the DOM. */
export type HintAttributes = Readonly<{
  'data-hint'?: string
  'data-hint-title'?: string
  'data-hint-keys'?: string
  'data-hint-because'?: string
  'aria-description'?: string
}>

/**
 * A hint as the attributes every DOM painter puts on its control, which
 * the document's hint listener reads: `data-hint` is the description,
 * `data-hint-title` the name of an icon, `data-hint-keys` the keys
 * separated by spaces, `data-hint-because` the reason it is unavailable,
 * and `aria-description` the line a screen reader says.
 *
 * @example
 * ```typescript
 * hintAttributesOf(hint)
 * // { 'data-hint': 'Sets the count to 0', 'data-hint-keys': 'r', 'aria-description': 'Sets the count to 0' }
 * ```
 */
export const hintAttributesOf = (hint: ControlHint): HintAttributes => ({
  ...Option.match(hint.maybeDescription, {
    onNone: () => ({}),
    onSome: description => ({ 'data-hint': description }),
  }),
  ...Option.match(hint.maybeTitle, {
    onNone: () => ({}),
    onSome: title => ({ 'data-hint-title': title }),
  }),
  ...(Array.isReadonlyArrayEmpty(hint.shortcuts)
    ? {}
    : { 'data-hint-keys': Array.join(hint.shortcuts, ' ') }),
  ...Option.match(hint.maybeBecause, {
    onNone: () => ({}),
    onSome: because => ({ 'data-hint-because': because }),
  }),
  ...(hint.spoken === '' ? {} : { 'aria-description': hint.spoken }),
})

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
 * `2 actions match “p”`, or `No actions match “zz”`; a painter also shows
 * it, so a person sees what a typed letter did. `hints` are the keys that
 * work right now, the last of them what a letter does: `search` while the
 * search has the keyboard, `run a row by its key` once a row has it.
 * `areRowKeysLive` says the same of the key shown beside each row, so a
 * painter dims those keys while a letter would only type, and
 * `rowKeysHint` is the sentence it shows on them. `style` says
 * how to present it: a centered dialog on web, a modal on React Native, a
 * boxed prompt in a terminal.
 */
export type MenuView = Readonly<{
  title: string
  filterLabel: string
  dismissLabel: string
  query: string
  isFilterFocused: boolean
  areRowKeysLive: boolean
  rowKeysHint: string
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

const echoOfEntry = (entry: Entry): Echo => ({
  title: entry.title,
  maybeNote: M.value(entry.availability).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.tagsExhaustive({
      Enabled: () => Option.none(),
      Disabled: ({ because }) => Option.some(`Unavailable: ${because}`),
    }),
  ),
  keys: [],
})

const menuOwnKeys: ReadonlySet<string> = new Set([
  'j',
  'k',
  'J',
  'K',
  'Escape',
  'Tab',
  'ArrowDown',
  'ArrowUp',
])

const rowEchoOf = (row: MenuRow): Option.Option<Echo> =>
  row.isNested && isEnabled(row.entry.availability)
    ? Option.none()
    : Option.some(echoOfEntry(row.entry))

const echoInMenu = (
  menu: MenuView,
  catalogEntries: ReadonlyArray<Entry>,
  input: KeyInput,
): Option.Option<Echo> => {
  const key = normalizeKey(input.key)
  if (isChord(input)) {
    return Option.flatMap(
      Array.findFirst(menu.rows, row =>
        Option.contains(row.maybePick, Number(key)),
      ),
      rowEchoOf,
    )
  } else if (key === 'Enter') {
    return Option.flatMap(
      Array.findFirst(menu.rows, row => row.isHighlighted),
      rowEchoOf,
    )
  } else if (menu.areRowKeysLive && !menuOwnKeys.has(key)) {
    return Option.map(keyedEntryOf(catalogEntries, input), echoOfEntry)
  } else {
    return Option.none()
  }
}

/**
 * What one key press is about to do, for a Client to say once it is
 * done: the Action a declared key runs, `Reset` for `r`, or the row a
 * number, Enter, or its own key runs from the open menu. An unavailable
 * Action comes with the reason, `Unavailable: count is already 0`, so a
 * key that does nothing says why. None for a key that only types, moves,
 * opens a list of choices, or belongs to no Action. `keys` is left for
 * the Client to fill with the press as its platform writes it.
 *
 * @example
 * ```typescript
 * echoOfKey(App.interaction, { count: 3 }, keyInput('r'))
 * // Some({ title: 'Reset', maybeNote: None, keys: [] })
 * echoOfKey(App.interaction, { count: 0 }, keyInput('r'))
 * // Some({ title: 'Reset', maybeNote: Some('Unavailable: count is already 0'), keys: [] })
 * ```
 */
export const echoOfKey = <Model, Message>(
  interaction: Pick<ProgramInteraction<Model, Message>, 'entries' | 'menu'>,
  model: Model,
  input: KeyInput,
): Option.Option<Echo> =>
  Option.match(interaction.menu(model), {
    onNone: () =>
      Option.map(keyedEntryOf(interaction.entries(model), input), echoOfEntry),
    onSome: menu => echoInMenu(menu, interaction.entries(model), input),
  })

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
