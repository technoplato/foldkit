/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_INSTANT_APP_ID?: string
  readonly VITE_SCRIBE_APP_SCHEME?: string
  readonly VITE_WORDS_BUILD_BRANCH?: string
  readonly VITE_WORDS_BUILD_COMMIT?: string
  readonly VITE_WORDS_BUILD_TIME?: string
  readonly VITE_WORDS_BUILD_WORKTREE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
