import { Match as M } from 'effect'

import { type AccessibilityProfile, type Model } from './model.js'

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
      CompletedAtZero: ({ isRgbInverted, profile, slashCount }) =>
        `Rule Zero complete with ${slashCount.toString()} slashes. ${accessibilityProfileLabel(profile)} selected. RGB negative is ${isRgbInverted ? 'on' : 'off'}.`,
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
      CompletedAtZero: ({ isRgbInverted, profile, slashCount }) => [
        'state CompletedAtZero',
        `profile ${profile}`,
        `rgb-negative ${isRgbInverted ? 'on' : 'off'}`,
        `slashes ${slashCount.toString()}`,
      ],
    }),
  )
  return ['cardboard host local /0', ...stateLines].join('\n')
}
