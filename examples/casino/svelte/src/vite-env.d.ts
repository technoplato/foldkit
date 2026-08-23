/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_INSTANT_APP_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.svelte' {
  import type { Component } from 'svelte'
  const component: Component
  export default component
}
