import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const cliEntryPath = fileURLToPath(new URL('../dist/entry.js', import.meta.url))

const sampleUrl = 'https://www.tiktok.com/@x/video/1'

const runCli = (args: ReadonlyArray<string>): string => {
  const result = spawnSync(process.execPath, [cliEntryPath, ...args], {
    encoding: 'utf8',
  })

  expect(result.status, result.stderr).toBe(0)
  return result.stdout
}

describe('Archiver CLI process', () => {
  it('lists, archives a URL, and opens one', () => {
    expect(runCli(['list'])).toBe('No archives.\n')
    expect(runCli(['archive', sampleUrl])).toBe(`Queued  ${sampleUrl}\n`)
    expect(
      runCli(['do', `url:${sampleUrl}`, 'submit', `open:${sampleUrl}`]),
    ).toBe(`Queued  ${sampleUrl}\n`)
  })

  it('prints progress before the shelf when verbose', () => {
    expect(runCli(['archive', sampleUrl, '--verbose'])).toBe(
      'Initial Model: Model({ urlDraft: "", archives: 0 })\n' +
        `Message: UpdatedUrlDraft(${sampleUrl})\n` +
        'Message: SubmittedArchiveUrl()\n' +
        'Final Model: Model({ urlDraft: "", archives: 1 })\n' +
        `Queued  ${sampleUrl}\n`,
    )
  })
})
