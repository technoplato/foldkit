/** Browser stand-in for Node modules pulled in by the Instant package entry. */
export const randomUUID = (): string => crypto.randomUUID()

export const existsSync = (): boolean => false

export const readFileSync = (): string => {
  throw new Error('Node fs is not available in the browser')
}

export const createRequire = (): never => {
  throw new Error('Node createRequire is not available in the browser')
}

export const mkdirSync = (): void => {}

export const renameSync = (): void => {}

export const unlinkSync = (): void => {}

export const copyFileSync = (): void => {}

export const writeFileSync = (): void => {}

export const rmSync = (): void => {}

export const readdirSync = (): ReadonlyArray<string> => []

export const statSync = (): Readonly<{
  isDirectory: () => boolean
  isFile: () => boolean
}> => ({
  isDirectory: () => false,
  isFile: () => false,
})
