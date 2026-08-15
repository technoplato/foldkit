import { InstantProgramSchema } from '@foldkit/instant/browser'
import { init } from '@instantdb/react-native'

const instantAppId = process.env['EXPO_PUBLIC_INSTANT_APP_ID']

/** React Native Instant client for the Multiple Counters Program schema. */
export const nativeDatabase =
  instantAppId === undefined || instantAppId === ''
    ? null
    : init({
        appId: instantAppId,
        schema: InstantProgramSchema,
      })
