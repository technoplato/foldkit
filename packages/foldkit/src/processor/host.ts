import { Match as M, Schema as S } from 'effect'

import { ts } from '../schema/index.js'

/** A CLI Processor Host. Instant `from` is `cli`. */
export const Cli = ts('Cli')
/** A CLI Processor Host. Instant `from` is `cli`. */
export type Cli = typeof Cli.Type

/** A terminal TUI Processor Host. Instant `from` is `tui`. */
export const Tui = ts('Tui')
/** A terminal TUI Processor Host. Instant `from` is `tui`. */
export type Tui = typeof Tui.Type

/** An OpenTUI Processor Host. Instant `from` is `opentui`. */
export const OpenTui = ts('OpenTui')
/** An OpenTUI Processor Host. Instant `from` is `opentui`. */
export type OpenTui = typeof OpenTui.Type

/** A headless Processor Host. Instant `from` is `headless`. */
export const Headless = ts('Headless')
/** A headless Processor Host. Instant `from` is `headless`. */
export type Headless = typeof Headless.Type

/** A Foldkit HTML Processor Host. Instant `from` is `foldkit`. */
export const Foldkit = ts('Foldkit')
/** A Foldkit HTML Processor Host. Instant `from` is `foldkit`. */
export type Foldkit = typeof Foldkit.Type

/** A React Processor Host. Instant `from` is `react`. */
export const React = ts('React')
/** A React Processor Host. Instant `from` is `react`. */
export type React = typeof React.Type

/** A Svelte Processor Host. Instant `from` is `svelte`. */
export const Svelte = ts('Svelte')
/** A Svelte Processor Host. Instant `from` is `svelte`. */
export type Svelte = typeof Svelte.Type

/** An Expo iOS Processor Host. Instant `from` is `expo-ios`. */
export const ExpoIos = ts('ExpoIos')
/** An Expo iOS Processor Host. Instant `from` is `expo-ios`. */
export type ExpoIos = typeof ExpoIos.Type

/** An Expo Android Processor Host. Instant `from` is `expo-android`. */
export const ExpoAndroid = ts('ExpoAndroid')
/** An Expo Android Processor Host. Instant `from` is `expo-android`. */
export type ExpoAndroid = typeof ExpoAndroid.Type

/** One Processor Host. Pass `Processor.Host.React()`, not `'react'`. */
export const Host = S.Union([
  Cli,
  Tui,
  OpenTui,
  Headless,
  Foldkit,
  React,
  Svelte,
  ExpoIos,
  ExpoAndroid,
])
/** One Processor Host. Pass `Processor.Host.React()`, not `'react'`. */
export type Host = typeof Host.Type

/** Prints the Instant `from` string for one Host. */
export const print = (host: Host): string =>
  M.value(host).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Cli: () => 'cli',
      Tui: () => 'tui',
      OpenTui: () => 'opentui',
      Headless: () => 'headless',
      Foldkit: () => 'foldkit',
      React: () => 'react',
      Svelte: () => 'svelte',
      ExpoIos: () => 'expo-ios',
      ExpoAndroid: () => 'expo-android',
    }),
  )
