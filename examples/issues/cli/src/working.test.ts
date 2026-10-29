import { Option, Result } from 'effect'
import { AgentSurvey, EndedRun, LiveAgent } from 'issues-core-example'
import { describe, expect, it } from 'vitest'

import {
  BinaryFile,
  ChangedFile,
  IssueTouchedFiles,
  UntrackedFile,
} from '@foldkit/instant-tools/issues'

import {
  issueIdsToCheck,
  surveyFromProgressCheck,
  touchedFilesFromGit,
} from './working.js'

describe('the agent survey', () => {
  it('reads running agents from the progress check and ended runs from the registry', () => {
    const progressCheck = {
      agents: [
        {
          account: 'grok',
          agentId: 'grok/privacy-tests-1350@grok',
          branch: 'agent/grok/privacy-tests-1350',
          harness: 'grok',
          issue: 1350,
          kind: 'run',
          name: 'privacy-tests-1350',
          startedAtMs: 1_793_289_364_000,
          worktree: '/Users/laptop/Sync/worktrees/privacy-tests-1350',
        },
        {
          account: 'max',
          agentId: null,
          harness: 'claude-code',
          issue: 42,
          kind: 'run',
          name: 'hand-started',
          startedAtMs: null,
        },
        { agentId: null, issue: null, kind: 'subagent', name: null },
      ],
      dead: [
        {
          exit: '143',
          issue: 1336,
          name: 'mac-idle-1336',
          startedAtMs: 1_793_200_000_000,
        },
      ],
      generatedAtMs: 1_793_312_400_000,
    }
    const registry = {
      agents: [
        {
          ended: '2026-10-29T17:00:00-04:00',
          issue: 1201,
          name: 'sweep-1201',
          state: 'done',
        },
        {
          issue: 1302,
          name: 'stalled-1302',
          state:
            'STALLED (ended its turn while waiting; resume it with a new run from its worktree)',
          stopped: '2026-10-29T16:00:00-04:00',
        },
        { issue: 1374, name: 'issue-wip-1374', state: 'running' },
        { id: 'no name', state: 'done' },
      ],
    }

    expect(
      surveyFromProgressCheck(progressCheck, Option.some(registry), 1),
    ).toEqual(
      Result.succeed(
        AgentSurvey.make({
          ended: [
            EndedRun.make({
              endedAtMs: Option.some(1_793_312_400_000),
              how: 'exit 143',
              issueId: Option.some('1336'),
              name: 'mac-idle-1336',
            }),
            EndedRun.make({
              endedAtMs: Option.some(1_793_307_600_000),
              how: 'done',
              issueId: Option.some('1201'),
              name: 'sweep-1201',
            }),
            EndedRun.make({
              endedAtMs: Option.some(1_793_304_000_000),
              how: 'STALLED',
              issueId: Option.some('1302'),
              name: 'stalled-1302',
            }),
          ],
          live: [
            LiveAgent.make({
              account: Option.some('grok'),
              agentId: 'grok/privacy-tests-1350@grok',
              branch: Option.some('agent/grok/privacy-tests-1350'),
              harness: Option.some('grok'),
              issueId: Option.some('1350'),
              name: 'privacy-tests-1350',
              startedAtMs: Option.some(1_793_289_364_000),
              worktree: Option.some(
                '/Users/laptop/Sync/worktrees/privacy-tests-1350',
              ),
            }),
            LiveAgent.make({
              account: Option.some('max'),
              agentId: 'claude-code/hand-started@max',
              branch: Option.none(),
              harness: Option.some('claude-code'),
              issueId: Option.some('042'),
              name: 'hand-started',
              startedAtMs: Option.none(),
              worktree: Option.none(),
            }),
          ],
          observedAtMs: 1_793_312_400_000,
        }),
      ),
    )
  })

  it('refuses a progress check that is not one', () => {
    expect(
      Result.isFailure(surveyFromProgressCheck({ nope: 1 }, Option.none(), 1)),
    ).toBe(true)
  })
})

describe('the Issues a sync reads by number', () => {
  it('reads the Issues of running agents and of runs that ended in the last six hours, each once', () => {
    const observedAtMs = 1_793_312_400_000
    const survey = surveyFromProgressCheck(
      {
        agents: [
          { agentId: 'claude-code/a@x', issue: 1374, name: 'a' },
          { agentId: 'claude-code/b@x', issue: 1374, name: 'b' },
        ],
        dead: [{ exit: '143', issue: 1336, lastSignMs: 1, name: 'dead' }],
        generatedAtMs: observedAtMs,
      },
      Option.some({
        agents: [
          {
            finished: '2026-10-29T17:00:00-04:00',
            issue: 1201,
            name: 'recent',
            state: 'done',
          },
          {
            issue: 867,
            name: 'started-long-ago',
            started: '2026-10-17T18:35:46',
            state: 'stopped',
          },
          { issue: 721, name: 'no-time', state: 'stopped' },
          {
            issue: 1336,
            name: 'dead',
            started: '2026-10-29T17:30:00-04:00',
            state: 'running',
          },
        ],
      }),
      observedAtMs,
    )

    expect(Result.map(survey, issueIdsToCheck)).toEqual(
      Result.succeed(['1374', '1201']),
    )
    const deadNow = surveyFromProgressCheck(
      {
        agents: [],
        dead: [{ exit: '143', issue: 1336, name: 'dead' }],
        generatedAtMs: observedAtMs,
      },
      Option.none(),
      observedAtMs,
    )
    expect(Result.map(deadNow, issueIdsToCheck)).toEqual(
      Result.succeed(['1336']),
    )
  })
})

describe('touched files', () => {
  it('reads git numstat and untracked paths, keeping at most the cap', () => {
    const numstat = [
      '40\t2\tpackages/instant-tools/src/issues/domain.ts',
      '-\t-\tdocs/shot.png',
      '3\t0\texamples/issues/core/src/{old.ts => new.ts}',
      '',
    ].join('\n')
    const untracked = 'examples/issues/core/src/nowWorking.ts\n'

    expect(
      touchedFilesFromGit({
        base: 'technoplato/main',
        checkedAtMs: 5,
        maximumFiles: 3,
        numstat,
        untracked,
      }),
    ).toEqual(
      IssueTouchedFiles.make({
        base: 'technoplato/main',
        checkedAtMs: 5,
        fileCount: 4,
        files: [
          ChangedFile.make({
            deletions: 2,
            insertions: 40,
            path: 'packages/instant-tools/src/issues/domain.ts',
          }),
          BinaryFile.make({ path: 'docs/shot.png' }),
          ChangedFile.make({
            deletions: 0,
            insertions: 3,
            path: 'examples/issues/core/src/{old.ts => new.ts}',
          }),
        ],
      }),
    )
    expect(
      touchedFilesFromGit({
        base: 'main',
        checkedAtMs: 5,
        maximumFiles: 40,
        numstat: '',
        untracked,
      }).files,
    ).toEqual([
      UntrackedFile.make({ path: 'examples/issues/core/src/nowWorking.ts' }),
    ])
  })
})
