/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_INSTANT_APP_ID?: string
  readonly VITE_WALLET_DATA_SOURCE?: string
  readonly VITE_STRIPE_SECRET_KEY?: string
  readonly VITE_STRIPE_API_KEY?: string
  readonly VITE_STRIPE_SECRET_PRESENT?: string
  readonly VITE_STRIPE_CONFIG_FILE_PRESENT?: string
  readonly [key: string]: string | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
