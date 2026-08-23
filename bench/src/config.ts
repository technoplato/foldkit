import { Schema as S } from 'effect'

import { Timeout } from './timeout.js'

/**
 * Reasoning effort. Matches the Vercel AI SDK request-config vocabulary.
 */
export const Reasoning = S.Literals([
  'provider-default',
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
])
/** Reasoning effort. */
export type Reasoning = typeof Reasoning.Type

/**
 * One request config. `model` is `provider/model-id`. Other fields follow
 * the Vercel AI SDK request-config shape. Many JSON files, one command.
 */
export const RequestConfig = S.Struct({
  model: S.String,
  temperature: S.optionalKey(S.Number),
  maxOutputTokens: S.optionalKey(S.Number),
  topP: S.optionalKey(S.Number),
  topK: S.optionalKey(S.Number),
  presencePenalty: S.optionalKey(S.Number),
  frequencyPenalty: S.optionalKey(S.Number),
  stopSequences: S.optionalKey(S.Array(S.String)),
  seed: S.optionalKey(S.Number),
  reasoning: S.optionalKey(Reasoning),
  maxRetries: S.optionalKey(S.Number),
  timeout: S.optionalKey(Timeout),
  headers: S.optionalKey(S.Record(S.String, S.String)),
  providerOptions: S.optionalKey(S.Record(S.String, S.Unknown)),
})
/** One request config. */
export type RequestConfig = typeof RequestConfig.Type

const RequestConfigFromJson = S.fromJsonString(RequestConfig)

/** Decodes a JSON request-config string. */
export const decodeRequestConfigJson = S.decodeEffect(RequestConfigFromJson)

/** Request-config field names in declaration order. */
export const requestConfigFields: ReadonlyArray<string> = [
  'model',
  'temperature',
  'maxOutputTokens',
  'topP',
  'topK',
  'presencePenalty',
  'frequencyPenalty',
  'stopSequences',
  'seed',
  'reasoning',
  'maxRetries',
  'timeout',
  'headers',
  'providerOptions',
]
