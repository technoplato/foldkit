import { Array, Match as M, Option, Schema as S, pipe } from 'effect'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const DemoClient = S.Literals(['counter', 'counter-tui'])
type DemoClient = typeof DemoClient.Type

const usage = 'Usage: pnpm demo <counter|counter-tui> [command] [--verbose]'

const maybeClient = pipe(
  process.argv,
  Array.drop(2),
  Array.head,
  Option.flatMap(value => S.decodeUnknownOption(DemoClient)(value)),
)

if (Option.isNone(maybeClient)) {
  console.error(usage)
  process.exit(1)
}

const client = maybeClient.value
const clientArgs = pipe(process.argv, Array.drop(3))

const packageName = M.value<DemoClient>(client).pipe(
  M.when('counter', () => 'counter-cli-example'),
  M.when('counter-tui', () => 'counter-tui-example'),
  M.exhaustive,
)

const entryPath = M.value<DemoClient>(client).pipe(
  M.when('counter', () =>
    fileURLToPath(
      new URL('../examples/counter/cli/dist/entry.js', import.meta.url),
    ),
  ),
  M.when('counter-tui', () =>
    fileURLToPath(
      new URL('../examples/counter/tui/dist/entry.js', import.meta.url),
    ),
  ),
  M.exhaustive,
)

const buildResult = spawnSync('pnpm', ['--filter', packageName, 'build'], {
  encoding: 'utf8',
})
if (buildResult.status !== 0) {
  process.stdout.write(buildResult.stdout)
  process.stderr.write(buildResult.stderr)
  process.exit(buildResult.status ?? 1)
}

const runResult = spawnSync(process.execPath, [entryPath, ...clientArgs], {
  stdio: 'inherit',
})
if (runResult.status !== 0) {
  process.exit(runResult.status ?? 1)
}
