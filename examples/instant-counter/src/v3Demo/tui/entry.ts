#!/usr/bin/env node
import { Array, Effect, Option, pipe } from 'effect'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runMultipleCountersV3Tui } from './host.js'

const argumentsAfterDashes: ReadonlyArray<string> = pipe(
  Array.drop(process.argv, 2),
  Array.dropWhile(argument => argument === '--'),
)

const flagValue = (flag: string): Option.Option<string> => {
  const maybePair = Array.findFirst(
    Array.zip(argumentsAfterDashes, Array.drop(argumentsAfterDashes, 1)),
    pair => {
      const [name] = pair
      return name === flag
    },
  )
  if (Option.isNone(maybePair)) {
    return Option.none()
  }
  const [, value] = maybePair.value
  return typeof value === 'string' ? Option.some(value) : Option.none()
}

const maybeFollow = Option.map(
  flagValue('--follow-leader'),
  leaderProcessorId => ({
    control: Option.getOrElse(flagValue('--control'), () => 'observe'),
    leaderProcessorId,
  }),
)

runMultipleCountersV3Tui(maybeFollow).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
