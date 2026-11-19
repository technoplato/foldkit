import { describe, expect, it } from 'vitest'

import { staleTraceFilesOf, traceFolderName } from './traceFiles.names'

describe('the trace files a build with no dev server keeps', () => {
  it('lives in one folder of the app’s own documents', () => {
    expect(traceFolderName).toBe('foldkit-telemetry')
  })

  it('lets go of files from before yesterday, and keeps today’s and yesterday’s', () => {
    const names = [
      '20261117T235959Z-000004.ndjson',
      '20261118T000000Z-000001.ndjson',
      '20261119T142712Z-000007.ndjson',
      'notes.txt',
    ]
    expect(
      staleTraceFilesOf(names, new Date('2026-11-19T15:00:00.000Z')),
    ).toEqual(['20261117T235959Z-000004.ndjson'])
  })
})
