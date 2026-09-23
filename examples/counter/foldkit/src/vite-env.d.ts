/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COUNTER_TAPE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
