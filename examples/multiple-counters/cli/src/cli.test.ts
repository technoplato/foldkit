import { Interaction, Processor, Runtime } from 'foldkit'
import { runProgramCommand } from 'foldkit/cli'
import {
  type BoundCounters,
  bindCounters,
  startCountersOn,
} from 'multiple-counters-core-example'
import { afterEach, describe, expect, it } from 'vitest'

const started: Array<{ stop: () => Promise<void> }> = []

afterEach(async () => {
  await Promise.all(started.splice(0).map(handle => handle.stop()))
})

const openCounters = async (): Promise<BoundCounters> => {
  const handle = startCountersOn(
    Runtime.Memory({ processor: 'cli-test' }),
    undefined,
    Processor.Host.Cli(),
  )
  started.push(handle)
  const bound = bindCounters(handle)
  await Interaction.whenSettled(bound, 2_000)
  return bound
}

const run = (bound: BoundCounters, ...words: ReadonlyArray<string>) =>
  runProgramCommand(bound, 'counters', words, {})

describe('counters CLI', () => {
  it('counts one counter with the Counter’s own word, then the counter', async () => {
    const bound = await openCounters()
    expect(run(bound, 'add').exitCode).toBe(0)
    const counted = run(bound, 'increment', '2')
    expect(counted.exitCode).toBe(0)
    expect(counted.stdout).toMatch(/^Counter 2 1 /m)
    expect(counted.stdout).toMatch(/^ {2}increment <counter-id> +Increments/m)
    expect(counted.stdout).toMatch(/^ +Choose one of: 1, 2$/m)
    expect(counted.stdout).toMatch(/^ +\$ counters increment 1$/m)
  })

  it('asks which counter with a full command to run', async () => {
    const asked = run(await openCounters(), 'decrement')
    expect(asked.exitCode).toBe(2)
    expect(asked.stderr).toBe(
      'decrement <counter-id> needs one of: 1. Try: counters decrement 1',
    )
  })

  it('opens a counter by its number and a page by its URI', async () => {
    const bound = await openCounters()
    expect(run(bound, 'open', '1').stdout).toContain('at /counters/1')
    expect(run(bound, 'open', '/counters').stdout).toContain('at /counters\n')
  })

  it('asks before deleting, then deletes on confirm', async () => {
    const bound = await openCounters()
    const asked = run(bound, 'delete', '1')
    expect(asked.stdout).toContain('at /counters/delete/1')
    expect(asked.stdout).toContain('Delete Counter 1?')
    const deleted = run(bound, 'confirm-delete')
    expect(deleted.exitCode).toBe(0)
    expect(deleted.stdout).toContain('No counters yet.')
  })

  it('refuses a delete nobody was asked about, with its sentence', async () => {
    const refused = run(await openCounters(), 'confirm-delete')
    expect(refused.exitCode).toBe(1)
    expect(refused.stderr).toBe(
      'confirm-delete is disabled: no delete is waiting for an answer.',
    )
  })
})
