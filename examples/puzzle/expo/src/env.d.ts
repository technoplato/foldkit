declare const process: {
  env: {
    readonly PUZZLE_TAPE?: string
    readonly EXPO_PUBLIC_PUZZLE_TAPE?: string
    readonly [key: string]: string | undefined
  }
}
