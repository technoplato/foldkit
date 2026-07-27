import { Array, Match as M, Option, Schema as S, pipe } from 'effect'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const WalletClient = S.Literals(['cli', 'terminal', 'tui'])
type WalletClient = typeof WalletClient.Type

const usage =
  'Usage: pnpm demo:wallet[:terminal|:tui] [operation-or-portable-uri]'

const maybeClient = pipe(
  process.argv,
  Array.drop(2),
  Array.head,
  Option.flatMap(value => S.decodeUnknownOption(WalletClient)(value)),
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

const packageName = M.value<WalletClient>(client).pipe(
  M.when('cli', () => 'wallet-cli-example'),
  M.when('terminal', () => 'wallet-terminal-example'),
  M.when('tui', () => 'wallet-tui-example'),
  M.exhaustive,
)

const clientLabel = M.value<WalletClient>(client).pipe(
  M.when('cli', () => 'wallet CLI'),
  M.when('terminal', () => 'wallet Effect Terminal client'),
  M.when('tui', () => 'wallet OpenTUI client'),
  M.exhaustive,
)

const entryPath = M.value<WalletClient>(client).pipe(
  M.when('cli', () =>
    fileURLToPath(
      new URL('../examples/wallet/cli/dist/entry.js', import.meta.url),
    ),
  ),
  M.when('terminal', () =>
    fileURLToPath(
      new URL('../examples/wallet/terminal/dist/entry.js', import.meta.url),
    ),
  ),
  M.when('tui', () =>
    fileURLToPath(
      new URL('../examples/wallet/tui/src/entry.tsx', import.meta.url),
    ),
  ),
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
const executable = client === 'tui' ? 'bun' : process.execPath
const executableArgs =
  client === 'tui'
    ? ['run', entryPath, ...clientArgs]
    : [entryPath, ...clientArgs]
const runResult = spawnSync(executable, executableArgs, { stdio: 'inherit' })
if (runResult.status !== 0) {
  process.exit(runResult.status ?? 1)
}
