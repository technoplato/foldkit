import { Array, Match as M, Option, Schema as S, pipe } from 'effect'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ReplayClient = S.Literals(['cli', 'tui'])
type ReplayClient = typeof ReplayClient.Type

const usage = 'Usage: pnpm demo:replay[:tui] [state-or-replay-uri]'

const maybeClient = pipe(
  process.argv,
  Array.drop(2),
  Array.head,
  Option.flatMap(value => S.decodeUnknownOption(ReplayClient)(value)),
)

if (Option.isNone(maybeClient)) {
  console.error(usage)
  process.exit(1)
}

const client = maybeClient.value
const clientArgs = pipe(
  process.argv,
  Array.drop(3),
  Array.dropWhile(argument => argument === '--'),
)

const packageName = M.value<ReplayClient>(client).pipe(
  M.when('cli', () => 'replayability-cli-example'),
  M.when('tui', () => 'replayability-tui-example'),
  M.exhaustive,
)

const entryPath = M.value<ReplayClient>(client).pipe(
  M.when('cli', () =>
    fileURLToPath(
      new URL('../examples/replayability/cli/dist/entry.js', import.meta.url),
    ),
  ),
  M.when('tui', () =>
    fileURLToPath(
      new URL('../examples/replayability/tui/dist/entry.js', import.meta.url),
    ),
  ),
  M.exhaustive,
)

const clientLabel = M.value<ReplayClient>(client).pipe(
  M.when('cli', () => 'replay CLI'),
  M.when('tui', () => 'replay TUI'),
  M.exhaustive,
)

console.error(`Preparing ${clientLabel}…`)
const foldkitBuildResult = spawnSync(
  'pnpm',
  ['--filter', 'foldkit', 'exec', 'tsc', '-b', 'tsconfig.build.json'],
  { stdio: 'inherit' },
)
if (foldkitBuildResult.status !== 0) {
  process.exit(foldkitBuildResult.status ?? 1)
}

const buildResult = spawnSync(
  'pnpm',
  [
    '--filter',
    `${packageName}...`,
    '--filter',
    '!foldkit',
    '--workspace-concurrency=4',
    '-r',
    '--stream',
    'exec',
    'tsc',
    '-p',
    'tsconfig.build.json',
  ],
  { stdio: 'inherit' },
)
if (buildResult.status !== 0) {
  process.exit(buildResult.status ?? 1)
}

console.error(`Starting ${clientLabel}…`)
const runResult = spawnSync(process.execPath, [entryPath, ...clientArgs], {
  stdio: 'inherit',
})
if (runResult.status !== 0) {
  process.exit(runResult.status ?? 1)
}
