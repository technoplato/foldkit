// NOTE: what an Expo app is built or served with reaches its code as
// `process.env.EXPO_PUBLIC_…`, written out in full so the bundler can put
// the value in.
declare namespace NodeJS {
  interface ProcessEnv {
    readonly EXPO_PUBLIC_FOLDKIT_SILENT?: string
  }
}
