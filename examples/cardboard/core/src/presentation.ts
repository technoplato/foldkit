import { Match as M } from 'effect'

import {
  type AccessibilityProfile,
  type InputMethod,
  type Model,
  type RiddleResolution,
} from './model.js'

/** Every input-method riddle choice in stable presentation order. */
export const inputMethods: ReadonlyArray<InputMethod> = [
  'SegaGenesisController',
  'Nintendo64Controller',
  'GameBoyColor',
  'Xbox360Controller',
  'MouseAndKeyboard',
  'Joystick',
  'Eyes',
  'HeadLookingUp',
  'HeadLookingDown',
  'HeadLookingRight',
  'Mirror',
]

/** Returns the readable name of an input-method riddle choice. */
export const inputMethodLabel = (inputMethod: InputMethod): string =>
  M.value(inputMethod).pipe(
    M.withReturnType<string>(),
    M.when('SegaGenesisController', () => 'Genesis controller'),
    M.when('Nintendo64Controller', () => 'Nintendo 64 controller'),
    M.when('GameBoyColor', () => 'Game Boy Color'),
    M.when('Xbox360Controller', () => 'Xbox 360 controller'),
    M.when('MouseAndKeyboard', () => 'Mouse and keyboard'),
    M.when('Joystick', () => 'Joystick'),
    M.when('Eyes', () => 'Eyes'),
    M.when('HeadLookingUp', () => 'Head looking up'),
    M.when('HeadLookingDown', () => 'Head looking down'),
    M.when('HeadLookingRight', () => 'Head looking right'),
    M.when('Mirror', () => 'Mirror'),
    M.exhaustive,
  )

/** Returns a compact visual symbol without becoming the accessible label. */
export const inputMethodGlyph = (inputMethod: InputMethod): string =>
  M.value(inputMethod).pipe(
    M.withReturnType<string>(),
    M.when('SegaGenesisController', () => '◀ ● ● ●'),
    M.when('Nintendo64Controller', () => '◀  ●  ◉'),
    M.when('GameBoyColor', () => '▣  ✚  ●●'),
    M.when('Xbox360Controller', () => '◉  ●●●●'),
    M.when('MouseAndKeyboard', () => '⌨  ◉'),
    M.when('Joystick', () => '┳  ●'),
    M.when('Eyes', () => '◉  ◉'),
    M.when('HeadLookingUp', () => '◯  ↑'),
    M.when('HeadLookingDown', () => '◯  ↓'),
    M.when('HeadLookingRight', () => '◯  →'),
    M.when('Mirror', () => '▱  YOU'),
    M.exhaustive,
  )

const riddleResolutionDescription = (resolution: RiddleResolution): string =>
  M.value(resolution).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      AnsweredMirrorRiddle: () => 'The mirror answered dungeon one.',
      SkippedInputMethodRiddle: () => 'Dungeon one was skipped.',
    }),
  )

/** Returns a readable label for one presentation profile. */
export const accessibilityProfileLabel = (
  profile: AccessibilityProfile,
): string =>
  M.value(profile).pipe(
    M.withReturnType<string>(),
    M.when('AmberPaper', () => 'Amber Paper'),
    M.when('QuietBlack', () => 'Quiet Black'),
    M.when('Groovebox', () => 'Groovebox'),
    M.when('GrooveboxThroughInvert', () => 'Groovebox Through Invert'),
    M.when('Negative', () => 'Negative'),
    M.when('HighContrast', () => 'High Contrast'),
    M.exhaustive,
  )

/** Returns the next profile in Cardboard's portable presentation order. */
export const nextAccessibilityProfile = (
  profile: AccessibilityProfile,
): AccessibilityProfile =>
  M.value(profile).pipe(
    M.withReturnType<AccessibilityProfile>(),
    M.when('AmberPaper', () => 'QuietBlack'),
    M.when('QuietBlack', () => 'Groovebox'),
    M.when('Groovebox', () => 'GrooveboxThroughInvert'),
    M.when('GrooveboxThroughInvert', () => 'Negative'),
    M.when('Negative', () => 'HighContrast'),
    M.when('HighContrast', () => 'AmberPaper'),
    M.exhaustive,
  )

/** Returns the previous profile in Cardboard's portable presentation order. */
export const previousAccessibilityProfile = (
  profile: AccessibilityProfile,
): AccessibilityProfile =>
  M.value(profile).pipe(
    M.withReturnType<AccessibilityProfile>(),
    M.when('AmberPaper', () => 'HighContrast'),
    M.when('QuietBlack', () => 'AmberPaper'),
    M.when('Groovebox', () => 'QuietBlack'),
    M.when('GrooveboxThroughInvert', () => 'Groovebox'),
    M.when('Negative', () => 'GrooveboxThroughInvert'),
    M.when('HighContrast', () => 'Negative'),
    M.exhaustive,
  )

/** Describes the current Rule Zero state without assuming a presentation medium. */
export const accessibleDescription = (model: Model): string =>
  M.value(model.zero).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      WaitingAtZero: () =>
        'Rule Zero. Press or hold the black button. Slash count is zero.',
      PressingZero: ({ elapsedMilliseconds }) =>
        `Black button held for ${(elapsedMilliseconds / 1_000).toFixed(1)} seconds.`,
      OpeningZero: ({ progressPermille }) =>
        `Project Cardboard is ${Math.round(progressPermille / 10).toString()} percent open.`,
      ConfiguringAtZero: ({ isRgbInverted, profile }) =>
        `${accessibilityProfileLabel(profile)} selected. RGB negative is ${isRgbInverted ? 'on' : 'off'}.`,
      ChoosingInputMethod: () =>
        'Riddle one. If you are looking at yourself, where are you looking?',
      RejectedInputMethodChoice: ({ attemptedInputMethod }) =>
        `${inputMethodLabel(attemptedInputMethod)} does not look back at you. Choose again.`,
      CompletedAtZero: ({ isRgbInverted, profile, resolution, slashCount }) =>
        `Rule Zero complete with ${slashCount.toString()} slashes. ${riddleResolutionDescription(resolution)} ${accessibilityProfileLabel(profile)} selected. RGB negative is ${isRgbInverted ? 'on' : 'off'}.`,
    }),
  )

/** Prints the portable Model as a compact terminal presentation. */
export const terminalPresentation = (model: Model): string => {
  const stateLines = M.value(model.zero).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      WaitingAtZero: ({ slashCount }) => [
        'state WaitingAtZero',
        `slashes ${slashCount.toString()}`,
      ],
      PressingZero: ({ elapsedMilliseconds, slashCount }) => [
        'state PressingZero',
        `held ${(elapsedMilliseconds / 1_000).toFixed(1)}s`,
        `slashes ${slashCount.toString()}`,
      ],
      OpeningZero: ({ progressPermille, slashCount }) => [
        'state OpeningZero',
        `progress ${progressPermille.toString()}/1000`,
        `slashes ${slashCount.toString()}`,
      ],
      ConfiguringAtZero: ({ isRgbInverted, profile, slashCount }) => [
        'state ConfiguringAtZero',
        `profile ${profile}`,
        `rgb-negative ${isRgbInverted ? 'on' : 'off'}`,
        `slashes ${slashCount.toString()}`,
      ],
      ChoosingInputMethod: ({ profile, slashCount }) => [
        'state ChoosingInputMethod',
        'riddle If you are looking at yourself, where are you looking?',
        `profile ${profile}`,
        `slashes ${slashCount.toString()}`,
      ],
      RejectedInputMethodChoice: ({
        attemptedInputMethod,
        profile,
        slashCount,
      }) => [
        'state RejectedInputMethodChoice',
        `attempted ${attemptedInputMethod}`,
        `profile ${profile}`,
        `slashes ${slashCount.toString()}`,
      ],
      CompletedAtZero: ({ isRgbInverted, profile, resolution, slashCount }) => [
        'state CompletedAtZero',
        `profile ${profile}`,
        `rgb-negative ${isRgbInverted ? 'on' : 'off'}`,
        `riddle ${resolution._tag}`,
        `slashes ${slashCount.toString()}`,
      ],
    }),
  )
  return ['cardboard host local /0', ...stateLines].join('\n')
}
