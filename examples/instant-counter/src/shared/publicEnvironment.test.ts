import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const wrapperPath = resolve(process.cwd(), 'scripts/with-public-instant-env')

describe('public Instant child environment', () => {
  it('keeps the admin token for origin minting and drops the CLI token', () => {
    const output = execFileSync(
      wrapperPath,
      [
        process.execPath,
        '-e',
        "process.stdout.write(JSON.stringify({admin:process.env.INSTANT_APP_ADMIN_TOKEN===undefined,cli:process.env.INSTANT_CLI_AUTH_TOKEN===undefined,public:process.env.VITE_INSTANT_APP_ID==='public-app'}))",
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          INSTANT_APP_ADMIN_TOKEN: 'test-admin-secret',
          INSTANT_CLI_AUTH_TOKEN: 'test-cli-secret',
          VITE_INSTANT_APP_ID: 'public-app',
        },
      },
    )

    expect(JSON.parse(output)).toStrictEqual({
      admin: false,
      cli: true,
      public: true,
    })
  })
})
