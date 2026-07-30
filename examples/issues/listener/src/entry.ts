#!/usr/bin/env node
import { Schema as S } from 'effect'

import {
  ApplicationProduct,
  LibraryProduct,
} from '@foldkit/instant-tools/issues'

import { ListenerAnalysisConfig } from './analysis.js'
import { runListener } from './listener.js'

const required = (name: string): string => {
  const value = process.env[name]
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable ${name}.`)
  }
  return value
}

const kind = required('ISSUES_PRODUCT_KIND')
const productInput = {
  _tag: kind,
  id: required('ISSUES_PRODUCT_ID'),
  name: required('ISSUES_PRODUCT_NAME'),
}
const product =
  kind === 'Application'
    ? S.decodeUnknownSync(ApplicationProduct)(productInput)
    : S.decodeUnknownSync(LibraryProduct)(productInput)

await runListener({
  analysis: ListenerAnalysisConfig.make({
    product,
    shareBaseUrl:
      process.env['ISSUES_SHARE_BASE_URL'] ?? 'https://issues.knophy.com',
  }),
  instantAppId: required('ISSUES_INSTANT_APP_ID'),
  observerScript:
    process.env['SCRIBE_OBSERVER_SCRIPT'] ??
    '/Users/laptop/.codex/skills/scribe-active-transcript/scripts/scribe-transcript.mjs',
})
