declare const process: {
  env: {
    readonly EXPO_PUBLIC_BOOKS_INSTANT_APP_ID?: string
    readonly EXPO_PUBLIC_BOOKS_MADE_UP?: string
    readonly EXPO_PUBLIC_BOOKS_MADE_UP_SHELF?: string
    readonly EXPO_PUBLIC_BOOKS_TELEMETRY?: string
    readonly EXPO_PUBLIC_BOOKS_MADE_UP_SOUND?: string
    readonly EXPO_PUBLIC_FOLDKIT_SILENT?: string
    readonly EXPO_PUBLIC_FOLDKIT_SOUND_ON_SIMULATOR?: string
    readonly [key: string]: string | undefined
  }
}

declare const require: (path: string) => number

// NOTE: React Native's own reading of one of its feature flags. The file is
// part of React Native without types of its own.
declare module 'react-native/src/private/featureflags/ReactNativeFeatureFlags' {
  export const enableSchedulerDelegateInvalidation: () => boolean
}
