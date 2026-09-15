import { Effect, Layer } from 'effect'
import { Notifier } from 'personal-cfo-core'
import { Alert, Platform } from 'react-native'

type WebNotification = {
  new (title: string, options?: Readonly<{ body?: string }>): unknown
  requestPermission: () => Promise<string>
}

const webNotification = (): WebNotification | undefined => {
  if (Platform.OS !== 'web') {
    return undefined
  }
  const candidate = (globalThis as { Notification?: WebNotification })
    .Notification
  if (typeof candidate !== 'function') {
    return undefined
  }
  return candidate
}

/** Expo local notify: Web Notification API, else Alert. Push is a Hands blocker. */
export const layerExpoNotifier = Layer.succeed(Notifier, {
  deliverLocal: notification =>
    Effect.promise(async () => {
      const NotificationCtor = webNotification()
      if (NotificationCtor !== undefined) {
        const permission = await NotificationCtor.requestPermission()
        if (permission === 'granted') {
          new NotificationCtor(notification.title, { body: notification.body })
          return
        }
      }
      Alert.alert(notification.title, notification.body)
    }),
})
