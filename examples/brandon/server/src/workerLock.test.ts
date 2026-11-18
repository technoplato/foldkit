import { Option } from 'effect'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { takeWorkerLock } from './workerLock.js'

const lockIn = (): string =>
  join(mkdtempSync(join(tmpdir(), 'held-claims-lock-')), 'held-claims.lock')

const ownerMode = 0o777

describe('one claims worker on this Mac', () => {
  it('takes the lock when no worker holds it, and writes its process id for this user alone', () => {
    const path = lockIn()
    expect(takeWorkerLock({ path, pid: 4242, isAlive: () => false })).toEqual(
      Option.none(),
    )
    expect(readFileSync(path, 'utf8').trim()).toBe('4242')
    expect(statSync(path).mode & ownerMode).toBe(0o600)
  })

  it('is refused while a live worker holds it, and names that worker', () => {
    const path = lockIn()
    takeWorkerLock({ path, pid: 4242, isAlive: () => false })
    expect(
      takeWorkerLock({ path, pid: 4343, isAlive: pid => pid === 4242 }),
    ).toEqual(Option.some(4242))
    expect(readFileSync(path, 'utf8').trim()).toBe('4242')
  })

  it('takes over the lock of a worker that is gone, or a lock that names no one', () => {
    const path = lockIn()
    takeWorkerLock({ path, pid: 4242, isAlive: () => false })
    expect(takeWorkerLock({ path, pid: 4343, isAlive: () => false })).toEqual(
      Option.none(),
    )
    expect(readFileSync(path, 'utf8').trim()).toBe('4343')
    writeFileSync(path, 'not a process id')
    expect(takeWorkerLock({ path, pid: 4444, isAlive: () => true })).toEqual(
      Option.none(),
    )
    expect(readFileSync(path, 'utf8').trim()).toBe('4444')
  })

  it('keeps its own lock when it asks again', () => {
    const path = lockIn()
    takeWorkerLock({ path, pid: 4242, isAlive: () => true })
    expect(takeWorkerLock({ path, pid: 4242, isAlive: () => true })).toEqual(
      Option.none(),
    )
  })
})
