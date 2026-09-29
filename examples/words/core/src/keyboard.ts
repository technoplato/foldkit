import { Context, Match as M, Option, Schema as S, type Stream } from 'effect'

/** A keyboard shortcut web Scribe answers. */
export const Shortcut = S.Literals([
  'TogglePlayback',
  'SkipBackward',
  'SkipForward',
  'NewRecording',
  'TogglePauseRecording',
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

/** One key press, as the host reports it; `isRepeat` marks a key held down. */
export const KeyPress = S.Struct({
  key: S.String,
  target: KeyTarget,
  isModified: S.Boolean,
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
 * The shortcut a key press means on the page, if any. Typing in a field,
 * browser shortcuts with Command, Control, or Option, and presses while a
 * dialog is open never count; Space counts only when focus is not on a
 * button, so Space still presses a focused button. Holding an arrow keeps
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
    press.isModified ||
    press.target === 'TextEntry' ||
    (press.isRepeat && !isArrow(press))
  ) {
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
    M.when('ReturnToFollowed', () => 'L'),
    M.when('ToggleFullScreen', () => 'F'),
    M.when('ExitFullScreen', () => 'Escape'),
    M.when('FocusSearch', () => '/'),
    M.exhaustive,
  )

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
