import { Array, Option } from 'effect'
import { Plain, Reference, type TextPart } from 'foldkit/renderers'

import { howLongAgo, localTimeLabel } from './clock.js'
import {
  type LandedBuild,
  type LandedCommit,
  buildLabel,
} from './issueLandings.js'

const SHORT_SHA_LENGTH = 9

/** The reader's clock, read once a minute. */
export type ChipClock = Readonly<{ nowMs: number; offsetMinutes: number }>

/**
 * A time as a person reads it: `2026-10-30 09:00 (2 days ago)`, or just the
 * time before the clock is read.
 */
export const whenWordsOn = (atMs: number, clock: ChipClock): string =>
  clock.nowMs === 0
    ? localTimeLabel(atMs, clock.offsetMinutes)
    : `${localTimeLabel(atMs, clock.offsetMinutes)} (${howLongAgo(atMs, clock.nowMs)})`

/** A build's chip: `Scribe 0.1 (217)`, its state, and a hover with when and its tag. */
export const buildChip = (build: LandedBuild, clock: ChipClock): TextPart =>
  Reference({
    label: buildLabel(build),
    kind: 'Build',
    state: build.status,
    href: `/builds/${build.number.toString()}`,
    detail: [
      `Built ${whenWordsOn(build.builtAtMs, clock)}`,
      ...Option.toArray(Option.map(build.maybeTag, tag => `Tag ${tag}`)),
    ],
  })

/**
 * How to get a build: its TestFlight invite and its upload's page in App
 * Store Connect, each named with the number TestFlight shows, `217.1`.
 */
export const testflightChips = (
  build: LandedBuild,
  clock: ChipClock,
): ReadonlyArray<TextPart> => {
  const shown = Option.getOrElse(build.maybeTestflightVersion, () =>
    build.number.toString(),
  )
  const sent = Option.match(build.maybeTaggedAtMs, {
    onNone: () => [],
    onSome: atMs => [`Sent ${whenWordsOn(atMs, clock)}`],
  })
  return [
    ...Option.toArray(
      Option.map(build.maybeTestflightInvite, href =>
        Reference({
          label: `TestFlight ${shown}`,
          kind: 'TestFlight',
          href,
          detail: ['Opens the TestFlight invite', ...sent],
        }),
      ),
    ),
    ...Option.toArray(
      Option.map(build.maybeTestflightPage, href =>
        Reference({
          label: `Upload ${shown}`,
          kind: 'TestFlight',
          href,
          detail: ['Opens this upload in App Store Connect', ...sent],
        }),
      ),
    ),
  ]
}

/** A commit's chip: its short id with its words as the title. */
export const commitChip = (commit: LandedCommit): TextPart =>
  Reference({
    label: commit.sha.slice(0, SHORT_SHA_LENGTH),
    title: commit.subject,
    kind: 'Commit',
    href: `/commits/${commit.sha}`,
    detail: [`${commit.repo} ${commit.sha}`],
  })

/** A commit's chip when only its id and maybe its words are known. */
export const commitChipOf = (
  sha: string,
  maybeSubject: Option.Option<string>,
): TextPart =>
  Reference({
    label: sha.slice(0, SHORT_SHA_LENGTH),
    ...Option.match(maybeSubject, {
      onNone: () => ({}),
      onSome: title => ({ title }),
    }),
    kind: 'Commit',
    href: `/commits/${sha}`,
    detail: [`Commit ${sha}`],
  })

/** Chips with two spaces between them, for one line. */
export const spacedChips = (
  chips: ReadonlyArray<TextPart>,
): ReadonlyArray<TextPart> => Array.flatMap(chips, chip => [Plain('  '), chip])
