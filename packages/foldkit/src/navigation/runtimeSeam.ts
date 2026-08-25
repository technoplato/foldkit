import { Equal, Option, Result } from 'effect'

import {
  type NavigationStack,
  type StackInstruction,
  stackInstructions,
} from './structure.js'

// RUNTIME NAVIGATION SEAM (ADR 0010)
//
// The Program declares HOW its Model carries a navigation stack and how
// stacks print to URIs; this module performs the WHEN: diffing observed
// models and driving browser history through one HistoryPort. Router
// plugins remain the only router-specific code.

/**
 * The navigation declaration a Program attaches to opt into the runtime
 * URI loop. Printers and parsers must be inverses on canonical paths;
 * transient session identities never enter the printed URI.
 */
export interface ProgramNavigation<Destination> {
  /** Prints one destination as its carrier path fragment. */
  readonly printDestination: (destination: Destination) => string
  /** Prints the canonical carrier path of one navigation stack. */
  readonly printStack: (stack: NavigationStack<Destination>) => string
  /**
   * Parses a carrier path back to its stack. Returns None when the URI
   * names no route of this Program.
   */
  readonly parseUri: (
    uri: string,
  ) => Option.Option<NavigationStack<Destination>>
  /**
   * Reads the stack out of the app Model and writes a new one back.
   * Keeps Model ownership in the app while the runtime owns sync.
   */
  readonly stackOf: (model: unknown) => NavigationStack<Destination>
  readonly withStack: (
    model: unknown,
    stack: NavigationStack<Destination>,
  ) => unknown
}

/** The imperative history surface the seam drives. Host-supplied. */
export interface HistoryPort {
  readonly push: (path: string) => void
  readonly replace: (path: string) => void
  readonly back: () => void
}

/** One configured URI loop over one Program's navigation declaration. */
export interface UriSync {
  /**
   * Diffs two observed models' stacks and performs history moves for
   * every instruction. No-op when both models project equal stacks.
   */
  readonly apply: (previousModel: unknown, nextModel: unknown) => void
  /**
   * Carrier -> Program: parses `uri`, returns the new Model with that
   * stack written back, or None when the URI is unparseable or
   * non-canonical (callers redirect instead of guessing).
   */
  readonly open: (
    uri: string,
    model: unknown,
  ) => Option.Option<{ readonly model: unknown }>
}

const perform = <Destination>(
  instructions: ReadonlyArray<StackInstruction<Destination>>,
  printDestination: ProgramNavigation<Destination>['printDestination'],
  history: HistoryPort,
): void => {
  for (const instruction of instructions) {
    switch (instruction._tag) {
      case 'SetRoot': {
        history.replace(printDestination(instruction.root))
        break
      }
      case 'Push': {
        history.push(printDestination(instruction.destination))
        break
      }
      case 'Pop': {
        history.back()
        break
      }
      case 'ReplaceTop': {
        history.replace(printDestination(instruction.entry.destination))
        break
      }
    }
  }
}

/**
 * Builds the runtime side of the ADR 0010 navigation seam: feed it every
 * observed model pair and every carrier URI; it owns the history moves
 * and the canonical write-backs.
 */
export const makeUriSync = <Destination>(
  navigation: ProgramNavigation<Destination>,
  history: HistoryPort,
): UriSync => ({
  apply: (previousModel, nextModel) => {
    const instructions = stackInstructions(
      navigation.stackOf(previousModel),
      navigation.stackOf(nextModel),
    )
    perform(instructions, navigation.printDestination, history)
  },
  open: (uri, model) => {
    const parsed = navigation.parseUri(uri)
    if (Option.isNone(parsed)) {
      return Option.none()
    }
    // Canonicalize: re-printing must reproduce the URI exactly, else the
    // caller redirects rather than silently accepting a spelling drift.
    const printed = navigation.printStack(parsed.value)
    if (printed !== uri) {
      return Option.none()
    }
    return Option.some({
      model: navigation.withStack(model, parsed.value),
    })
  },
})

/** True when two stacks differ only by reference, not by value. */
export const sameStack = <Destination>(
  a: NavigationStack<Destination>,
  b: NavigationStack<Destination>,
): boolean => Equal.equals(a, b)

/** Exposed for hosts asserting parse failures without importing Result. */
export const parseResultToOption = <Destination>(
  result: Result.Result<NavigationStack<Destination>, unknown>,
): Option.Option<NavigationStack<Destination>> =>
  Result.isFailure(result) ? Option.none() : Option.some(result.success)
