/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_INSTANT_APP_ID?: string
  readonly VITE_SCRIBE_APP_SCHEME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
