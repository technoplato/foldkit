declare const process: {
  env: {
    readonly EXPO_PUBLIC_BOOKS_INSTANT_APP_ID?: string
    readonly EXPO_PUBLIC_BOOKS_MADE_UP?: string
    readonly EXPO_PUBLIC_BOOKS_MADE_UP_SHELF?: string
    readonly [key: string]: string | undefined
  }
}

declare const require: (path: string) => number
