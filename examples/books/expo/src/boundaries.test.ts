import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const appDir = join(here, '../app')
const read = (file: string): string => readFileSync(join(appDir, file), 'utf8')

const sourcesIn = (directory: string): ReadonlyArray<string> =>
  readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory()
      ? sourcesIn(join(directory, entry.name))
      : /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts')
        ? [join(directory, entry.name)]
        : [],
  )

describe('Books Expo boundaries', () => {
  it('has the one catch-all route and the bare address, both the generic screen', () => {
    expect(existsSync(join(appDir, '[...path].tsx'))).toBe(true)
    expect(read('[...path].tsx')).toContain('FoldkitRouterScreen as default')
    expect(read('index.tsx')).toContain('FoldkitRouterScreen as default')
  })

  it('keeps the layout a host: no title, no Action, no address of its own', () => {
    const layout = read('_layout.tsx')
    expect(layout).toContain('FoldkitRouterStack')
    expect(layout).toContain('ProgramProvider')
    expect(layout).not.toContain('@instantdb')
    expect(layout).not.toContain("'/books")
    expect(layout).not.toMatch(/press\(['"`]/)
    expect(layout).not.toMatch(/lantern|keeper/i)
  })

  it('writes no books logic and no color of its own', () => {
    const sources = [...sourcesIn(appDir), ...sourcesIn(here)]
    for (const file of sources) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(source, file).not.toMatch(/rgba?\(/)
      expect(source, file).not.toContain('useColorScheme')
      expect(source, file).not.toMatch(/SeekTo|AddBookmark|ShowWordMenu/)
    }
  })

  it('starts the made-up library the core gives every client', () => {
    const start = readFileSync(join(here, 'startExpoBooks.ts'), 'utf8')
    expect(start).toContain('startMadeUpBooks')
    expect(start).toContain('books-core-example')
  })

  it('keeps a sign-in session in the device’s secure store and nowhere else', () => {
    const sources = [...sourcesIn(appDir), ...sourcesIn(here)]
    for (const file of sources) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).not.toMatch(/AsyncStorage\.setItem|console\./)
      expect(source, file).not.toMatch(/react-native-webview|password/i)
      if (!file.endsWith('access.ts')) {
        expect(source, file).not.toMatch(/SecureStore|cf_authorization/i)
      }
    }
    const access = readFileSync(join(here, 'access.ts'), 'utf8')
    expect(access).toContain('openAuthSessionAsync')
    expect(access).toContain('SecureStore.setItemAsync')
  })

  it('asks the phone for nothing it does not use: sound in the background, never the microphone', () => {
    const config = readFileSync(join(here, '../app.json'), 'utf8')
    const app: unknown = JSON.parse(config)
    expect(config).toContain('"UIBackgroundModes"')
    expect(JSON.stringify(app)).toContain(
      '["expo-audio",{"microphonePermission":false}]',
    )
  })

  it('builds no native half of a package the iPhone app never runs', () => {
    // NOTE: The router asks for @expo/ui and uses it on Android only, and
    // the two animation libraries arrive only as its companions. Their iOS
    // halves do not compile beside the Expo core this fork installs, so the
    // iOS app leaves them out; nothing in the app imports any of them.
    const unused = [
      '@expo/ui',
      'react-native-reanimated',
      'react-native-worklets',
    ]
    const manifest: unknown = JSON.parse(
      readFileSync(join(here, '../package.json'), 'utf8'),
    )
    expect(JSON.stringify(manifest)).toContain(
      `"autolinking":{"ios":{"exclude":${JSON.stringify(unused)}}}`,
    )
    for (const file of [...sourcesIn(appDir), ...sourcesIn(here)]) {
      const source = readFileSync(file, 'utf8')
      for (const name of unused) {
        expect(source, file).not.toContain(`'${name}`)
      }
    }
  })
})
