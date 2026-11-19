import { Directory, File, Paths } from 'expo-file-system'

import {
  type ChunkedLines,
  chunkedLines,
} from '@foldkit/react-native/telemetry'

import { staleTraceFilesOf, traceFolderName } from './traceFiles.names'

/**
 * The app's trace kept as small files in its own documents, for a build
 * that carries its own code and has no dev server reading what it prints.
 * The Mac that built the app reads the folder from the device. Files from
 * before yesterday are let go of when the app starts.
 *
 * @example
 * ```typescript
 * const lines = traceFiles()
 * attachDevelopmentTelemetry(handle, { app: 'books', isDevelopment: true, write: lines.write })
 * ```
 */
export const traceFiles = (): ChunkedLines => {
  const folder = new Directory(Paths.document, traceFolderName)
  try {
    folder.create({ intermediates: true, idempotent: true })
    const names = folder.list().map(entry => entry.name)
    staleTraceFilesOf(names, new Date()).forEach(name => {
      new File(folder, name).delete()
    })
  } catch {
    // NOTE: a folder that cannot be made is found out at the first write,
    // which drops its lines; the app goes on.
  }
  return chunkedLines({
    writeChunk: (name, text) => {
      const file = new File(folder, name)
      file.create({ overwrite: true })
      file.write(text)
    },
  })
}
