import { Context, Match as M, Option, Schema as S, type Stream } from 'effect'

/** A keyboard shortcut web Scribe answers. */
export const Shortcut = S.Literals([
  'TogglePlayback',
  'SkipBackward',
  'SkipForward',
  'NewRecording',
  'TogglePauseRecording',
  'StopRecording',
  'ReturnToFollowed',
  'ToggleFullScreen',
  'ExitFullScreen',
  'FocusSearch',
])
/** A keyboard shortcut web Scribe answers. */
export type Shortcut = typeof Shortcut.Type

/**
 * What had focus when a key went down: a field that takes typing (text,
 * range, select), a button or link, or the page itself.
 */
export const KeyTarget = S.Literals(['TextEntry', 'Control', 'Page'])
/** What had focus when a key went down. */
export type KeyTarget = typeof KeyTarget.Type

/**
 * One key press, as the host reports it. `code` is the physical key
 * (`Period`), which Shift does not change the way it changes `key` (`>`).
 * `isModified` means Command, Control, or Option is held; `isCommandHeld`
 * means Command or Control is held without Option. `isRepeat` marks a key
 * held down.
 */
export const KeyPress = S.Struct({
  key: S.String,
  code: S.String,
  target: KeyTarget,
  isModified: S.Boolean,
  isShiftHeld: S.Boolean,
  isCommandHeld: S.Boolean,
  isRepeat: S.Boolean,
})
/** One key press, as the host reports it. */
export type KeyPress = typeof KeyPress.Type

/** What the page offers right now, which decides the shortcuts that apply. */
export const ShortcutContext = S.Struct({
  isPlaybackReady: S.Boolean,
  isRecordAvailable: S.Boolean,
  isCapturing: S.Boolean,
  isAwayFromFollowed: S.Boolean,
  isRecordingOpen: S.Boolean,
  isFullScreen: S.Boolean,
  isSearchAvailable: S.Boolean,
  isDialogOpen: S.Boolean,
})
/** What the page offers right now. */
export type ShortcutContext = typeof ShortcutContext.Type

const isLetter = (press: KeyPress, letter: string): boolean =>
  press.key.toLowerCase() === letter

const isArrow = (press: KeyPress): boolean =>
  press.key === 'ArrowLeft' || press.key === 'ArrowRight'

/**
 * Shift-Command-Period (Shift-Control-Period off the Mac): the Mac app's Stop
 * Recording. It needs two modifiers, so a stray key press never stops a
 * recording.
 */
const isStopRecordingPress = (press: KeyPress): boolean =>
  press.code === 'Period' && press.isShiftHeld && press.isCommandHeld

/**
 * The shortcut a key press means on the page, if any. Typing in a field,
 * browser shortcuts with Command, Control, or Option, and presses while a
 * dialog is open never count, except Shift-Command-Period, which stops the
 * recording in progress as on the Mac; Space counts only when focus is not on
 * a button, so Space still presses a focused button. Holding an arrow keeps
 * skipping; holding any other key acts once.
 *
 * @example
 * ```ts
 * shortcutFor(context, {
 *   key: ' ',
 *   target: 'Page',
 *   isModified: false,
 *   isRepeat: false,
 * })
 * // Option.some('TogglePlayback') on a recording page with audio
 * ```
 */
export const shortcutFor = (
  context: ShortcutContext,
  press: KeyPress,
): Option.Option<Shortcut> => {
  if (
    context.isDialogOpen ||
    press.target === 'TextEntry' ||
    (press.isRepeat && !isArrow(press))
  ) {
    return Option.none()
  } else if (isStopRecordingPress(press)) {
    return context.isCapturing ? Option.some('StopRecording') : Option.none()
  } else if (press.isModified) {
    return Option.none()
  } else if (press.key === ' ') {
    return press.target === 'Page' && context.isPlaybackReady
      ? Option.some('TogglePlayback')
      : Option.none()
  } else {
    return M.value(press).pipe(
      M.withReturnType<Option.Option<Shortcut>>(),
      M.when({ key: 'ArrowLeft' }, () =>
        context.isPlaybackReady ? Option.some('SkipBackward') : Option.none(),
      ),
      M.when({ key: 'ArrowRight' }, () =>
        context.isPlaybackReady ? Option.some('SkipForward') : Option.none(),
      ),
      M.when(
        pressed => isLetter(pressed, 'r'),
        () =>
          context.isRecordAvailable
            ? Option.some('NewRecording')
            : Option.none(),
      ),
      M.when(
        pressed => isLetter(pressed, 'p'),
        () =>
          context.isCapturing
            ? Option.some('TogglePauseRecording')
            : Option.none(),
      ),
      M.when(
        pressed => isLetter(pressed, 'l'),
        () =>
          context.isAwayFromFollowed
            ? Option.some('ReturnToFollowed')
            : Option.none(),
      ),
      M.when(
        pressed => isLetter(pressed, 'f'),
        () =>
          context.isRecordingOpen
            ? Option.some('ToggleFullScreen')
            : Option.none(),
      ),
      M.when({ key: '/' }, () =>
        context.isSearchAvailable ? Option.some('FocusSearch') : Option.none(),
      ),
      M.when({ key: 'Escape' }, pressed =>
        context.isFullScreen && pressed.target !== 'Control'
          ? Option.some('ExitFullScreen')
          : Option.none(),
      ),
      M.orElse(() => Option.none()),
    )
  }
}

/** The key each shortcut answers, as `aria-keyshortcuts` and tooltips name it. */
export const shortcutKeyOf = (shortcut: Shortcut): string =>
  M.value(shortcut).pipe(
    M.withReturnType<string>(),
    M.when('TogglePlayback', () => 'Space'),
    M.when('SkipBackward', () => 'ArrowLeft'),
    M.when('SkipForward', () => 'ArrowRight'),
    M.when('NewRecording', () => 'R'),
    M.when('TogglePauseRecording', () => 'P'),
    M.when('StopRecording', () => 'Shift+Meta+. Shift+Control+.'),
    M.when('ReturnToFollowed', () => 'L'),
    M.when('ToggleFullScreen', () => 'F'),
    M.when('ExitFullScreen', () => 'Escape'),
    M.when('FocusSearch', () => '/'),
    M.exhaustive,
  )

/**
 * How a tooltip names the keys of a shortcut: the key itself, and for Stop
 * Recording the Mac's name for its chord.
 *
 * @example
 * ```ts
 * shortcutHintOf('StopRecording')
 * // 'Shift-Command-Period'
 * ```
 */
export const shortcutHintOf = (shortcut: Shortcut): string =>
  shortcut === 'StopRecording'
    ? 'Shift-Command-Period'
    : shortcutKeyOf(shortcut)

/**
 * Key presses on the page, provided by the host. A press `claim` answers with
 * a value is kept from the browser, so Space does not scroll the page, and
 * the value is emitted; every other press reaches the browser untouched.
 */
export type KeyboardInputService = Readonly<{
  claimKeyPresses: <A>(
    claim: (press: KeyPress) => Option.Option<A>,
  ) => Stream.Stream<A>
}>

/** Key presses on the page, provided by the host. */
export class KeyboardInput extends Context.Service<
  KeyboardInput,
  KeyboardInputService
>()('words-core-example/KeyboardInput') {}
