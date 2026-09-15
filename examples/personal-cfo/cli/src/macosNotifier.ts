import { Effect, Layer } from 'effect'
import { spawnSync } from 'node:child_process'
import { Notifier } from 'personal-cfo-core'

const escapeAppleScript = (value: string): string =>
  value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')

/** macOS local notification. Skips osascript when PERSONAL_CFO_NOTIFY=0. */
export const layerMacosNotifier = Layer.succeed(Notifier, {
  deliverLocal: notification =>
    Effect.sync(() => {
      if (process.env['PERSONAL_CFO_NOTIFY'] === '0') {
        process.stdout.write(
          `notify  ${notification.channel}  ${notification.title}  ${notification.body}\n`,
        )
        return
      }
      const script = `display notification "${escapeAppleScript(notification.body)}" with title "${escapeAppleScript(notification.title)}"`
      const result = spawnSync('osascript', ['-e', script], {
        encoding: 'utf8',
      })
      if (result.status !== 0) {
        process.stdout.write(
          `notify  ${notification.channel}  ${notification.title}  ${notification.body}\n`,
        )
      }
    }),
})
