import { Array, Option, Record, pipe } from 'effect'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import * as Decode from './decode.js'

// The guard of #1322: every reader of transcript lines in the words site goes through the one line rule in
// core/src/decode.ts, which skips a retired line (ADR 0064 section 8; docs/FEATURES.md item 2, Michael's contract:
// "a wrong line is retired, never edited or deleted") and shows a sealed line as sealed (ADR 0097, #1183). It reads
// the source of examples/words and fails when a file outside decode.ts queries, reads or declares line rows itself,
// or when anything names the sealed words' envelope. Writes stay allowed: a transaction step on `tx` and a `link`.

const coreSourceDirectory = path.dirname(fileURLToPath(import.meta.url))
const wordsDirectory = path.resolve(coreSourceDirectory, '..', '..')
const ruleFile = path.join(coreSourceDirectory, 'decode.ts')

const SCANNED_DIRECTORIES: ReadonlyArray<string> = [
  path.join(wordsDirectory, 'core', 'src'),
  path.join(wordsDirectory, 'foldkit', 'src'),
]
const SCANNED_TOP_LEVEL_DIRECTORIES: ReadonlyArray<string> = [
  path.join(wordsDirectory, 'core'),
  path.join(wordsDirectory, 'foldkit'),
]
const SKIPPED_DIRECTORIES: ReadonlyArray<string> = ['node_modules', 'dist']
const SCHEMA_COPY = 'scribeSchema.ts'

/** The links and namespaces whose rows are transcript lines, or point at them. */
const LINE_SOURCES: ReadonlyArray<string> = [
  'segments',
  'previewSegmentA',
  'previewSegmentB',
  'scrubbedLines',
  'supersededBy',
  'supersedes',
  'transcriptionSegments',
  'shareScrubbedLines',
  'transcriptionWords',
]

/** decode.ts's selections: the only query shapes a line source may take. */
const RULE_SELECTIONS: ReadonlyArray<string> = [
  'recordingLinesQuery',
  'previewLineQuery',
  'scrubbedLinesQuery',
]

const ENVELOPE = 'sealedWords'
const RULE_PACKAGE = 'words-core-example'
const WRITE_CALLS: ReadonlyArray<string> = ['link', 'unlink']
const TRANSACTION_ROOT = 'tx'

/** One place that bypasses the rule: the file, its line, the name, and why it fails. */
type Finding = Readonly<{
  file: string
  line: number
  name: string
  why: string
}>

const isScannedFile = (fileName: string): boolean =>
  fileName.endsWith('.ts') &&
  !fileName.endsWith('.test.ts') &&
  fileName !== SCHEMA_COPY

const sourceFilesUnder = (directory: string): ReadonlyArray<string> =>
  Array.flatMap(readdirSync(directory, { withFileTypes: true }), entry => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      return Array.contains(SKIPPED_DIRECTORIES, entry.name)
        ? []
        : sourceFilesUnder(entryPath)
    } else {
      return isScannedFile(entry.name) ? [entryPath] : []
    }
  })

const topLevelSourceFilesOf = (directory: string): ReadonlyArray<string> =>
  pipe(
    readdirSync(directory, { withFileTypes: true }),
    Array.filter(entry => entry.isFile() && isScannedFile(entry.name)),
    Array.map(entry => path.join(directory, entry.name)),
  )

const scannedFiles = (): ReadonlyArray<string> =>
  Array.dedupe([
    ...Array.flatMap(SCANNED_DIRECTORIES, sourceFilesUnder),
    ...Array.flatMap(SCANNED_TOP_LEVEL_DIRECTORIES, topLevelSourceFilesOf),
  ])

const isRuleModule = (importingFile: string, specifier: string): boolean =>
  specifier === RULE_PACKAGE ||
  (specifier.startsWith('.') &&
    path.resolve(path.dirname(importingFile), specifier) ===
      ruleFile.replace(/\.ts$/, '.js'))

const ruleImportsOf = (
  file: string,
  source: ts.SourceFile,
): ReadonlyArray<string> =>
  Array.flatMap(source.statements, statement => {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      isRuleModule(file, statement.moduleSpecifier.text)
    ) {
      const bindings = statement.importClause?.namedBindings
      return bindings !== undefined && ts.isNamedImports(bindings)
        ? Array.map(bindings.elements, element => element.name.text)
        : []
    } else {
      return []
    }
  })

const nameTextOf = (name: ts.Node): Option.Option<string> =>
  ts.isIdentifier(name) ||
  ts.isStringLiteral(name) ||
  ts.isNoSubstitutionTemplateLiteral(name)
    ? Option.some(name.text)
    : Option.none()

const isWriteCallArgument = (objectLiteral: ts.Node): boolean => {
  const parent = objectLiteral.parent
  return (
    ts.isCallExpression(parent) &&
    ts.isPropertyAccessExpression(parent.expression) &&
    Array.contains(WRITE_CALLS, parent.expression.name.text)
  )
}

const isTransactionStep = (access: ts.PropertyAccessExpression): boolean =>
  ts.isPropertyAccessExpression(access.expression) &&
  access.expression.name.text === TRANSACTION_ROOT

/** Why a node that names a line source bypasses the rule, or none when it is a write or a rule selection. */
const bypassOf = (
  node: ts.Node,
  ruleImports: ReadonlyArray<string>,
): Option.Option<string> => {
  if (ts.isPropertyAccessExpression(node)) {
    return isTransactionStep(node)
      ? Option.none()
      : Option.some('reads line rows outside decode.ts')
  } else if (ts.isPropertyAssignment(node)) {
    if (isWriteCallArgument(node.parent)) {
      return Option.none()
    } else if (
      ts.isIdentifier(node.initializer) &&
      Array.contains(RULE_SELECTIONS, node.initializer.text) &&
      Array.contains(ruleImports, node.initializer.text)
    ) {
      return Option.none()
    } else if (ts.isObjectLiteralExpression(node.initializer)) {
      return Option.some(
        "queries line rows without decode.ts's selection (recordingLinesQuery, previewLineQuery, scrubbedLinesQuery)",
      )
    } else {
      return Option.some('declares or passes line rows outside decode.ts')
    }
  } else if (ts.isShorthandPropertyAssignment(node)) {
    return isWriteCallArgument(node.parent)
      ? Option.none()
      : Option.some('passes line rows outside decode.ts')
  } else if (ts.isElementAccessExpression(node) || ts.isBindingElement(node)) {
    return Option.some('reads line rows outside decode.ts')
  } else if (ts.isPropertySignature(node)) {
    return Option.some('declares line rows outside decode.ts')
  } else {
    return Option.some('names a line source outside decode.ts')
  }
}

const namedOf = (node: ts.Node): Option.Option<string> => {
  if (ts.isPropertyAccessExpression(node)) {
    return Option.some(node.name.text)
  } else if (
    ts.isPropertyAssignment(node) ||
    ts.isPropertySignature(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isPropertyDeclaration(node)
  ) {
    return nameTextOf(node.name)
  } else if (ts.isShorthandPropertyAssignment(node)) {
    return Option.some(node.name.text)
  } else if (ts.isBindingElement(node)) {
    return nameTextOf(node.propertyName ?? node.name)
  } else if (ts.isElementAccessExpression(node)) {
    return nameTextOf(node.argumentExpression)
  } else if (
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
    !ts.isImportDeclaration(node.parent) &&
    !ts.isExportDeclaration(node.parent)
  ) {
    return Option.some(node.text)
  } else {
    return Option.none()
  }
}

const isNameOfAnotherNode = (node: ts.Node): boolean => {
  const parent = node.parent
  return (
    parent !== undefined &&
    ((ts.isPropertyAssignment(parent) && parent.name === node) ||
      (ts.isPropertySignature(parent) && parent.name === node) ||
      (ts.isMethodDeclaration(parent) && parent.name === node) ||
      (ts.isPropertyDeclaration(parent) && parent.name === node) ||
      (ts.isBindingElement(parent) &&
        (parent.propertyName === node || parent.name === node)) ||
      (ts.isElementAccessExpression(parent) &&
        parent.argumentExpression === node) ||
      (ts.isPropertyAccessExpression(parent) && parent.name === node))
  )
}

const findingsIn = (file: string): ReadonlyArray<Finding> => {
  const text = readFileSync(file, 'utf8')
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const ruleImports = ruleImportsOf(file, source)
  const isRule = file === ruleFile
  const relativeFile = path.relative(wordsDirectory, file)
  const findingsAt = (node: ts.Node): ReadonlyArray<Finding> => {
    const maybeName = isNameOfAnotherNode(node) ? Option.none() : namedOf(node)
    if (Option.isNone(maybeName)) {
      return []
    } else {
      const name = maybeName.value
      const line =
        source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
      if (name === ENVELOPE) {
        return [
          {
            file: relativeFile,
            line,
            name,
            why: 'names the sealed words, which no reader selects, decodes or keeps',
          },
        ]
      } else if (!isRule && Array.contains(LINE_SOURCES, name)) {
        return Option.match(bypassOf(node, ruleImports), {
          onNone: () => [],
          onSome: why => [{ file: relativeFile, line, name, why }],
        })
      } else {
        return []
      }
    }
  }
  const visit = (node: ts.Node): ReadonlyArray<Finding> => [
    ...findingsAt(node),
    ...Array.flatMap(node.getChildren(source), visit),
  ]
  return visit(source)
}

const describeFinding = ({ file, line, name, why }: Finding): string =>
  `${file}:${line} ${name}: ${why}`

describe('every reader of transcript lines goes through decode.ts (#1322)', () => {
  it('finds no file outside decode.ts that queries, reads or declares line rows, and none that names the envelope', () => {
    const files = scannedFiles()
    expect(Array.contains(files, ruleFile)).toBe(true)
    expect(Array.length(files)).toBeGreaterThan(40)
    expect(
      Array.map(Array.flatMap(files, findingsIn), describeFinding),
    ).toEqual([])
  })

  it('names only selections decode.ts exports, which read retiredAtMs, wordsSeal and the replacing line, and never the envelope', () => {
    const exported = Object.keys(Decode)
    expect(
      Array.filter(RULE_SELECTIONS, name => !Array.contains(exported, name)),
    ).toEqual([])
    expect(Decode.LINE_FIELDS).toEqual(
      expect.arrayContaining([
        'id',
        'segmentIndex',
        'startTimeSeconds',
        'endTimeSeconds',
        'text',
        'speaker',
        'wordsJSON',
        'isFinal',
        'retiredAtMs',
        'wordsSeal',
      ]),
    )
    expect(Decode.recordingLinesQuery).toEqual({
      $: { fields: Decode.LINE_FIELDS },
      supersededBy: { $: { fields: ['id'] } },
    })
    expect(Decode.previewLineQuery).toEqual({
      $: { fields: Decode.LINE_FIELDS },
    })
    expect(
      JSON.stringify([
        Decode.recordingLinesQuery,
        Decode.previewLineQuery,
        Decode.scrubbedLinesQuery,
      ]),
    ).not.toContain(ENVELOPE)
  })

  it('decodes a row that carries only the selected fields, so the selection never starves the rule', () => {
    const sampleValues: Readonly<Record<string, unknown>> = {
      id: 'line-1',
      segmentIndex: 0,
      startTimeSeconds: 1,
      endTimeSeconds: 2,
      text: 'alpha',
      speaker: 1,
      wordsJSON: '[]',
      isFinal: true,
      retiredAtMs: null,
      wordsSeal: null,
    }
    expect(
      Array.filter(
        Decode.LINE_FIELDS,
        field => !Record.has(sampleValues, field),
      ),
    ).toEqual([])
    const row = Object.fromEntries(
      Array.map(Decode.LINE_FIELDS, field => [
        field,
        Option.getOrNull(Record.get(sampleValues, field)),
      ]),
    )
    expect(
      Array.map(Decode.decodeSections([row]), section => section.text),
    ).toEqual(['alpha'])
  })
})
