import { Array, Option } from 'effect'

import { defaultReplicateStep } from './replicate.js'
import {
  CategoryHint,
  GuessStep,
  HintRequest,
  HintStep,
  type IdentityPayload,
  InitialHint,
  LabelStep,
  OperatorDispatched,
  OperatorObserved,
  OperatorOpened,
  type OperatorPhase,
  OperatorPosted,
  OperatorStep,
  OperatorVerified,
  PlainHint,
  type Prompt,
  type Step,
  operatorOrigin,
} from './step.js'

/** Demo hash tape from the Knophy puzzle brief. */
export const demoHashTape =
  '#codex=n/behind?cat=sports/basketball?F/football=y/mascot/Giants=y'

const isGuessAnswer = (value: string): value is 'y' | 'n' =>
  value === 'y' || value === 'n'

const printHint = (hint: HintRequest): string => {
  if (hint._tag === 'CategoryHint') {
    return `cat=${hint.category}`
  }
  if (hint._tag === 'InitialHint') {
    return hint.letter
  }
  return hint.text
}

const parseHint = (raw: string): HintRequest => {
  if (raw.startsWith('cat=')) {
    return CategoryHint.make({ category: raw.slice('cat='.length) })
  }
  if (raw.length === 1) {
    return InitialHint.make({ letter: raw })
  }
  return PlainHint.make({ text: raw })
}

const printGuess = (step: typeof GuessStep.Type): string => {
  const base = `${step.label}=${step.answer}`
  if (Option.isNone(step.hint)) {
    return base
  }
  return `${base}?${printHint(step.hint.value)}`
}

const printStep = (step: Step): Option.Option<string> => {
  if (step._tag === 'LabelStep') {
    return Option.some(step.label)
  }
  if (step._tag === 'GuessStep') {
    return Option.some(printGuess(step))
  }
  if (step._tag === 'HintStep') {
    return Option.some(`${step.label}?${printHint(step.hint)}`)
  }
  if (step._tag === 'ReplicateStep') {
    return Option.some('replicate')
  }
  return Option.none()
}

const parseSegment = (segment: string): Option.Option<Step> => {
  if (segment === '') {
    return Option.none()
  }
  const hintIndex = segment.indexOf('?')
  const body = hintIndex === -1 ? segment : segment.slice(0, hintIndex)
  const maybeHint =
    hintIndex === -1
      ? Option.none<HintRequest>()
      : Option.some(parseHint(segment.slice(hintIndex + 1)))
  const equalsIndex = body.lastIndexOf('=')
  if (equalsIndex !== -1) {
    const label = body.slice(0, equalsIndex)
    const answer = body.slice(equalsIndex + 1)
    if (label !== '' && isGuessAnswer(answer)) {
      return Option.some(
        GuessStep.make({
          label,
          answer,
          hint: maybeHint,
        }),
      )
    }
  }
  if (body === '') {
    return Option.none()
  }
  if (body === 'replicate' && Option.isNone(maybeHint)) {
    return Option.some(defaultReplicateStep())
  }
  if (Option.isSome(maybeHint)) {
    return Option.some(
      HintStep.make({
        label: body,
        hint: maybeHint.value,
      }),
    )
  }
  return Option.some(LabelStep.make({ label: body }))
}

const printedSegments = (steps: ReadonlyArray<Step>): ReadonlyArray<string> =>
  Array.flatMap(steps, step => {
    const printed = printStep(step)
    if (Option.isNone(printed)) {
      return []
    }
    return [printed.value]
  })

/** Prints settled hash-tape steps. Operator is not flattened into the hash. */
export const printHashTape = (steps: ReadonlyArray<Step>): string => {
  const segments = printedSegments(steps)
  if (Option.isNone(Array.head(segments))) {
    return ''
  }
  return `#${segments.join('/')}`
}

/** Parses a hash tape. Missing `#` is accepted. Operator is not a hash segment. */
export const parseHashTape = (hash: string): ReadonlyArray<Step> => {
  const trimmed = hash.startsWith('#') ? hash.slice(1) : hash
  if (trimmed === '') {
    return []
  }
  return Array.flatMap(trimmed.split('/'), segment => {
    const parsed = parseSegment(segment)
    if (Option.isNone(parsed)) {
      return []
    }
    return [parsed.value]
  })
}

/** Prints the portable puzzle URI for a tape plus current prompt. */
export const printPuzzleUri = (
  steps: ReadonlyArray<Step>,
  prompt: Prompt,
): string => {
  const withPrompt = [...steps, prompt]
  const hash = printHashTape(withPrompt)
  if (hash === '') {
    return '/puzzle'
  }
  return `/puzzle${hash}`
}

/** Demo settled tape. Last label stays the prompt. */
export const demoTape = parseHashTape(demoHashTape)

/** Default prompt after the demo tape: next open label. */
export const defaultPrompt = LabelStep.make({ label: 'next' })

/** Public Operator URLs returned by `post()`. */
export const operatorUrls = {
  observe: 'wss://grok.knophy.com/observe',
  verify: 'https://grok.knophy.com/operator-verify',
  dispatch: 'https://grok.knophy.com/operator-dispatch',
} as const

/** Knophy Operator mailbox. Public, not a private inbox. */
export const operatorEmail = 'operator@knophy.com'

/** Builds the identity payload `post()` fans out. */
export const fanOutIdentity = (
  subject: string,
  session: string,
): IdentityPayload => ({
  subject,
  session,
})

/** Opens Operator after `post()` returns URLs. */
export const openedOperator = (identity: IdentityPayload): OperatorPhase =>
  OperatorOpened.make({
    origin: operatorOrigin,
    identity,
    urls: operatorUrls,
  })

/** Posted Operator before URLs return. */
export const postedOperator = (identity: IdentityPayload): OperatorPhase =>
  OperatorPosted.make({
    origin: operatorOrigin,
    identity,
  })

/** Observe phase after websocket analytics and logs. */
export const observedOperator = (
  opened: typeof OperatorOpened.Type,
  observation: {
    readonly analytics: ReadonlyArray<string>
    readonly logs: ReadonlyArray<string>
  },
): OperatorPhase =>
  OperatorObserved.make({
    origin: opened.origin,
    identity: opened.identity,
    urls: opened.urls,
    observation,
  })

/** Verify phase after `[operator-verify]` email. */
export const verifiedOperator = (
  observed: typeof OperatorObserved.Type,
  email: string,
): OperatorPhase =>
  OperatorVerified.make({
    origin: observed.origin,
    identity: observed.identity,
    urls: observed.urls,
    observation: observed.observation,
    email,
  })

/** Dispatch phase after `[operator-dispatch]`. */
export const dispatchedOperator = (
  verified: typeof OperatorVerified.Type,
  target: string,
): OperatorPhase =>
  OperatorDispatched.make({
    origin: verified.origin,
    identity: verified.identity,
    urls: verified.urls,
    observation: verified.observation,
    email: verified.email,
    dispatch: { target },
  })

/** Wraps a phase as a Step. */
export const operatorStep = (phase: OperatorPhase): typeof OperatorStep.Type =>
  OperatorStep.make({ phase })

/** Builds a Model from a hash. Last ReplicateStep becomes the prompt. */
export const modelFromHashTape = (hash: string) => {
  const steps = parseHashTape(hash)
  const last = steps.at(-1)
  if (last !== undefined && last._tag === 'ReplicateStep') {
    return { tape: steps.slice(0, -1), prompt: last }
  }
  return { tape: steps, prompt: defaultPrompt }
}
