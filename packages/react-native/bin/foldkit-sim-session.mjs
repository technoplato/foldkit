#!/usr/bin/env node
// Runs a test of a phone app on a simulator, and always cleans up after it.
//
//   foldkit-sim-session --cleanup "<command>" [--cleanup "<command>" …] -- <command> [args…]
//
// The command after `--` is the test. When it ends, however it ends
// (passed, failed, broke, or the session was told to stop), each cleanup
// runs in the order given, each through `sh -c` with a minute to finish; a
// cleanup that fails does not stop the ones after it. The session exits
// with the test's own code, or with a failure if the test passed and a
// cleanup did not.
//
// A test that plays anything names the cleanups that pause it, close the
// app and shut the simulator down, so nothing is left playing on the
// machine the simulator runs on. A phone app under test is silent besides:
// see `isSilentOn` in the phone audio output.
//
// It uses nothing but Node.
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const messageOf = error =>
  error instanceof Error ? error.message : String(error)

/**
 * Runs `body`, then every cleanup in order whatever became of `body`, and
 * gives the exit code: the body's, or a failure when the body broke or a
 * cleanup failed.
 */
export const withCleanup = async ({ body, cleanups, report }) => {
  const afterBody = await body().then(
    code => code,
    error => {
      report(`the test broke: ${messageOf(error)}`)
      return 1
    },
  )
  return cleanups.reduce(
    (before, cleanup) =>
      before.then(code =>
        cleanup.run().then(
          () => code,
          error => {
            report(`cleanup "${cleanup.name}" failed: ${messageOf(error)}`)
            return code === 0 ? 1 : code
          },
        ),
      ),
    Promise.resolve(afterBody),
  )
}

const cleanupTimeoutMs = 60_000

const shell = command =>
  new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', command], {
      stdio: 'inherit',
      timeout: cleanupTimeoutMs,
    })
    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`exit ${String(code)}`))
      }
    })
  })

const main = async () => {
  const words = process.argv.slice(2)
  const split = words.indexOf('--')
  const before = split < 0 ? words : words.slice(0, split)
  const test = split < 0 ? [] : words.slice(split + 1)
  const cleanups = before
    .map((word, index) => [word, before[index + 1]])
    .filter(([word, command]) => word === '--cleanup' && command !== undefined)
    .map(([, command]) => ({ name: command, run: () => shell(command) }))
  if (test.length === 0) {
    console.error(
      'usage: foldkit-sim-session --cleanup "<command>" … -- <command> [args…]',
    )
    process.exit(2)
  }
  const running = { child: undefined }
  const stop = () => {
    running.child?.kill('SIGTERM')
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  const code = await withCleanup({
    body: () =>
      new Promise((resolve, reject) => {
        const child = spawn(test[0], test.slice(1), { stdio: 'inherit' })
        running.child = child
        child.on('error', reject)
        child.on('exit', (exitCode, signal) => {
          resolve(exitCode ?? (signal === null ? 1 : 130))
        })
      }),
    cleanups,
    report: line => {
      console.error(`foldkit-sim-session: ${line}`)
    },
  })
  process.exit(code)
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main()
}
