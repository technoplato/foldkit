import { describe, expect, it } from 'vitest'

const fromSpecifierPattern = /\bfrom\s+['"]([^'"]+)['"]/g
const sideEffectImportPattern = /\bimport\s+['"]([^'"]+)['"]/g

const importSpecifiers = (source: string): ReadonlyArray<string> =>
  [
    ...source.matchAll(fromSpecifierPattern),
    ...source.matchAll(sideEffectImportPattern),
  ].flatMap(([, specifier]) => (specifier === undefined ? [] : [specifier]))

const sources = import.meta.glob<string>('../**/*.ts', {
  eager: true,
  import: 'default',
  query: '?raw',
})

const resolveSourceImport = (
  importer: string,
  specifier: string,
): string | undefined => {
  const importerURL = new URL(importer.replace('../', ''), 'https://foldkit/')
  const resolvedURL = new URL(specifier, importerURL)
  const resolved = `..${resolvedURL.pathname}`
  const sourceFile = resolved.endsWith('.js')
    ? `${resolved.slice(0, -3)}.ts`
    : `${resolved}.ts`
  const indexFile = `${resolved}/index.ts`
  if (sourceFile in sources) {
    return sourceFile
  } else if (indexFile in sources) {
    return indexFile
  } else {
    return undefined
  }
}

const dependencyGraph = (
  entry: string,
): Readonly<{
  files: ReadonlySet<string>
  externalSpecifiers: ReadonlySet<string>
}> => {
  const files = new Set<string>()
  const externalSpecifiers = new Set<string>()

  const visit = (file: string): void => {
    if (files.has(file)) {
      return
    }
    files.add(file)
    const source = sources[file]
    if (source === undefined) {
      return
    }
    for (const specifier of importSpecifiers(source)) {
      if (specifier.startsWith('.')) {
        const sourceImport = resolveSourceImport(file, specifier)
        if (sourceImport !== undefined) {
          visit(sourceImport)
        }
      } else {
        externalSpecifiers.add(specifier)
      }
    }
  }

  visit(entry)
  return { files, externalSpecifiers }
}

describe('program-runtime public boundary', () => {
  it('does not depend on browser or DOM modules', () => {
    const entry = '../programRuntime/public.ts'
    const graph = dependencyGraph(entry)
    const localDependencies = Array.from(graph.files, file =>
      file.replace('../', ''),
    )

    expect(graph.externalSpecifiers.has('@effect/platform-browser')).toBe(false)
    expect(
      localDependencies.filter(file =>
        /^(dom|html|render|snabbdom)\//.test(file),
      ),
    ).toEqual([])
    expect(localDependencies).not.toContain('runtime/runtime.ts')
    expect(localDependencies).not.toContain('runtime/browserListeners.ts')
  })
})
