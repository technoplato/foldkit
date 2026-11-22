/**
 * What a Program on the shared Instant project starts with in a terminal,
 * beside the Program itself: the project's log under the Program's id,
 * read through a database kept in `~/.cache/foldkit/<program id>`, and a
 * local snapshot, so a Background Processor that starts again folds only
 * the rows written since it last ran.
 *
 * @example
 * ```typescript
 * Runtime.startHandle({
 *   program: SyncedStudio,
 *   ...onNode('foldkit-studio', makeStudioInstance(), host),
 * })
 * ```
 */
import { type Processor } from 'foldkit'
import { localSnapshotFile, localSnapshotPath } from 'foldkit/cli'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { makeNodeInstantDatabase } from '@foldkit/instant'
import { Instant, SharedInstantProject } from '@foldkit/instant/browser'

export const onNode = (
  programId: string,
  instance: string,
  host: Processor.Host.Host,
) => ({
  sync: Instant({
    app: SharedInstantProject,
    processor: host,
    instance,
    programLog: programId,
    database: makeNodeInstantDatabase(
      SharedInstantProject.id,
      join(homedir(), '.cache', 'foldkit', programId),
    ),
  }),
  localSnapshot: localSnapshotFile(localSnapshotPath(programId)),
  host,
})
