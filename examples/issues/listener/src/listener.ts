import { Effect, Option, Schema as S } from 'effect'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

import {
  InstantToolsSchema,
  makeInstantEntityStore,
  makeTriageInbox,
} from '@foldkit/instant-tools/instant'
import { init } from '@instantdb/core'

import {
  type ListenerAnalysisConfig,
  ScribeSegmentEvent,
  analyzeScribeSegment,
} from './analysis.js'

/** Complete runtime configuration for the Mac listener process. */
export type ListenerConfig = Readonly<{
  analysis: ListenerAnalysisConfig
  instantAppId: string
  observerScript: string
}>

/** Follows fresh Scribe segments and saves review-only drafts to Instant. */
export const runListener = (config: ListenerConfig): Promise<void> => {
  const database = init({
    appId: config.instantAppId,
    schema: InstantToolsSchema,
  })
  const inbox = makeTriageInbox(makeInstantEntityStore(database))
  const child = spawn(
    process.execPath,
    [
      config.observerScript,
      '--follow',
      '--idle-timeout',
      '0',
      '--max-segments',
      '100',
      '--json',
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  )
  const lines = createInterface({ input: child.stdout })
  const pending = new Set<Promise<void>>()

  lines.on('line', line => {
    let payload: unknown
    try {
      payload = JSON.parse(line)
    } catch {
      return
    }
    const decoded = S.decodeUnknownOption(ScribeSegmentEvent)(payload)
    if (Option.isNone(decoded)) return
    const candidate = analyzeScribeSegment(
      decoded.value,
      config.analysis,
      Date.now(),
    )
    if (Option.isNone(candidate)) return
    const save = Effect.runPromise(
      Effect.all([
        inbox.saveSegment(candidate.value.segment),
        inbox.saveCandidate(candidate.value),
      ]),
    ).then(() => {
      process.stdout.write(
        `${JSON.stringify({ event: 'triage-draft-saved', candidateId: candidate.value.id })}\n`,
      )
    })
    pending.add(save)
    void save.then(
      () => pending.delete(save),
      () => pending.delete(save),
    )
  })

  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', code => {
      Promise.all(pending).then(() => {
        if (code === 0) resolve()
        else
          reject(new Error(`Scribe observer exited with code ${String(code)}`))
      }, reject)
    })
  })
}
