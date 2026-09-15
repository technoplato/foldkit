#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const appTitle = 'Personal CFO clone'
const defaultCredentialFile = join(
  homedir(),
  '.config',
  'personal-cfo',
  'instant.env',
)
const credentialFile =
  process.env.PERSONAL_CFO_INSTANT_ENV ?? defaultCredentialFile

const requireExistingCredentials = () => {
  const contents = readFileSync(credentialFile, 'utf8')
  if (
    contents.includes('INSTANT_APP_ID=') &&
    contents.includes('INSTANT_APP_ADMIN_TOKEN=')
  ) {
    process.stdout.write(
      `Reusing Personal CFO Instant credentials at ${credentialFile}\n`,
    )
    process.exit(0)
  }
  process.stderr.write(
    `The existing credential file is incomplete: ${credentialFile}\n`,
  )
  process.exit(78)
}

if (existsSync(credentialFile)) {
  requireExistingCredentials()
}

const creation = spawnSync(
  'npx',
  ['instant-cli@latest', 'init-without-files', '--title', appTitle],
  {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  },
)

if (creation.status !== 0) {
  process.stderr.write(
    'Instant app creation failed. Run `npx instant-cli@latest login`, complete browser authentication, and retry.\n',
  )
  process.exit(creation.status ?? 1)
}

const jsonStart = creation.stdout.indexOf('{')
const jsonEnd = creation.stdout.lastIndexOf('}')
if (jsonStart < 0 || jsonEnd < jsonStart) {
  process.stderr.write(
    'Instant CLI did not return the expected application credential document.\n',
  )
  process.exit(65)
}

const result = JSON.parse(creation.stdout.slice(jsonStart, jsonEnd + 1))
const app = result.app
if (typeof app?.appId !== 'string' || typeof app?.adminToken !== 'string') {
  process.stderr.write(
    'Instant CLI returned an application without reusable credentials.\n',
  )
  process.exit(65)
}

mkdirSync(dirname(credentialFile), { recursive: true })
writeFileSync(
  credentialFile,
  [
    `INSTANT_APP_ID=${app.appId}`,
    `VITE_INSTANT_APP_ID=${app.appId}`,
    `EXPO_PUBLIC_INSTANT_APP_ID=${app.appId}`,
    `INSTANT_APP_ADMIN_TOKEN=${app.adminToken}`,
    '',
  ].join('\n'),
  { encoding: 'utf8' },
)
chmodSync(credentialFile, 0o600)
process.stdout.write(
  `Wrote Personal CFO Instant credentials to ${credentialFile}\n`,
)
