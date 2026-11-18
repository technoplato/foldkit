import { Effect, Layer } from 'effect'
import { spawn } from 'node:child_process'

import { LinkSharing, LinkSharingError, copied } from './share.js'

// SHARE

const copyText = (text: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const copy = spawn('pbcopy', [], { stdio: ['pipe', 'ignore', 'ignore'] })
    copy.on('error', reject)
    copy.on('exit', code => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error('pbcopy failed'))
      }
    })
    copy.stdin.end(text)
  })

/**
 * A terminal's link sharing: the full link copied to this machine's
 * clipboard with `pbcopy`, on the reader's public address.
 *
 * @example
 * ```typescript
 * terminalLinkSharing('https://books.pisspoursoftware.xyz')
 * ```
 */
export const terminalLinkSharing = (origin: string) =>
  Layer.succeed(LinkSharing, {
    share: link =>
      Effect.as(
        Effect.tryPromise({
          try: () => copyText(new URL(link.path, origin).toString()),
          catch: () =>
            new LinkSharingError({
              reason: 'this terminal cannot copy to the clipboard',
            }),
        }),
        copied,
      ),
  })
