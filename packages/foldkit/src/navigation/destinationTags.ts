import { Array, Option, Predicate } from 'effect'

import type { DeclaredNavigation, ProgramNavigation } from './declaration.js'

// TAGS

const tagOfLiteral = (type: unknown): Option.Option<string> =>
  Predicate.hasProperty(type, 'literal') && typeof type.literal === 'string'
    ? Option.some(type.literal)
    : Option.none()

const tagsOfAst = (ast: unknown): ReadonlyArray<string> => {
  if (
    Predicate.hasProperty(ast, 'types') &&
    globalThis.Array.isArray(ast.types)
  ) {
    return Array.flatMap(ast.types, tagsOfAst)
  } else if (
    Predicate.hasProperty(ast, 'propertySignatures') &&
    globalThis.Array.isArray(ast.propertySignatures)
  ) {
    return Array.getSomes(
      Array.map(ast.propertySignatures, signature =>
        Predicate.hasProperty(signature, 'name') &&
        signature.name === '_tag' &&
        Predicate.hasProperty(signature, 'type')
          ? tagOfLiteral(signature.type)
          : Option.none(),
      ),
    )
  } else {
    return []
  }
}

/**
 * The tags of the Destinations a Program declares, in the order its
 * Destination union lists them: `['Counter', 'SessionSettings',
 * 'ActionMenu']`. It reads the declaration's Schema alone, so a Client
 * can name what it shows after them before any Model exists: a native
 * stack declares one screen for each.
 *
 * @example
 * ```typescript
 * destinationTagsOf(navigation) // ['LibraryPage', 'ProfilePage', 'TitlePage', …]
 * ```
 */
export const destinationTagsOf = (
  navigation: ProgramNavigation<any, any> | DeclaredNavigation<any>,
): ReadonlyArray<string> =>
  Array.dedupe(
    tagsOfAst(
      Predicate.hasProperty(navigation.Destination, 'ast')
        ? navigation.Destination.ast
        : undefined,
    ),
  )
