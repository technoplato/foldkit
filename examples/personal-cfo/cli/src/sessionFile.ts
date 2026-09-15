import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** On-disk CLI session. Instant refresh tokens stay out of stdout. */
export type StoredSession = Readonly<{
  email: string
  userId: string
}>

const defaultDir = (): string =>
  process.env['PERSONAL_CFO_SESSION_DIR'] ??
  join(homedir(), '.config', 'personal-cfo')

/** Path of the CLI session file. */
export const sessionPath = (): string => join(defaultDir(), 'session.json')

/** Reads a stored session or undefined. */
export const readSession = (): StoredSession | undefined => {
  const path = sessionPath()
  if (!existsSync(path)) {
    return undefined
  }
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('email' in parsed) ||
    !('userId' in parsed) ||
    typeof parsed.email !== 'string' ||
    typeof parsed.userId !== 'string'
  ) {
    return undefined
  }
  return { email: parsed.email, userId: parsed.userId }
}

/** Writes a stored session with mode 0600. */
export const writeSession = (session: StoredSession): void => {
  const path = sessionPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(session)}\n`, { mode: 0o600 })
}

/** Deletes the stored session if it exists. */
export const clearSession = (): void => {
  const path = sessionPath()
  if (existsSync(path)) {
    rmSync(path)
  }
}
