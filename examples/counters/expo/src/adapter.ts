import {
  countersProcessorIds,
  startNativeCountersWindow,
} from 'counters-instant-example/native'
import { Platform } from 'react-native'

import { loadStoredAccessToken, requestKnophyAccessToken } from './access'
import { nativeDatabase } from './nativeDatabase'
import { setDefaultCountersWindowStart } from './windowHooks'

const instantAppId = (): string | undefined => {
  const appId = process.env['EXPO_PUBLIC_INSTANT_APP_ID']
  if (appId === undefined || appId === '') {
    return undefined
  }
  return appId
}

const processorId = (): string =>
  Platform.OS === 'ios'
    ? countersProcessorIds.expoIos
    : countersProcessorIds.expoAndroid

setDefaultCountersWindowStart(() => {
  const sessionUrl = process.env['EXPO_PUBLIC_COUNTERS_DEMO_SESSION_URL']
  if (sessionUrl === undefined || sessionUrl === '') {
    return startNativeCountersWindow({
      appId: instantAppId(),
      database: nativeDatabase === null ? null : nativeDatabase.core,
      loadAccessToken: loadStoredAccessToken,
      processorId: processorId(),
      requestAccessToken: requestKnophyAccessToken,
    })
  }
  return startNativeCountersWindow({
    appId: instantAppId(),
    database: nativeDatabase === null ? null : nativeDatabase.core,
    loadAccessToken: loadStoredAccessToken,
    processorId: processorId(),
    requestAccessToken: requestKnophyAccessToken,
    sessionUrl,
  })
})

export {
  installCountersWindowRuntime,
  useActions,
  useModel,
} from './windowHooks'
