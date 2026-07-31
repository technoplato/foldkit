import schema from 'instant-counter-example/schema'
import 'react-native-get-random-values'

import { init } from '@instantdb/react-native'

const instantAppId = process.env['EXPO_PUBLIC_INSTANT_APP_ID']

if (instantAppId === undefined || instantAppId.length === 0) {
  throw new Error(
    'EXPO_PUBLIC_INSTANT_APP_ID is required. Start through the public Instant environment wrapper.',
  )
}

/** The React Native Instant wrapper initialized with the complete shared schema. */
export const nativeDatabase = init({
  appId: instantAppId,
  schema,
})

/** The exact initialized React Native Instant database type. */
export type NativeDatabase = typeof nativeDatabase
