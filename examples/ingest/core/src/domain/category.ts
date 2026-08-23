import { Array, Option, Schema as S, String as Str } from 'effect'
import { ts } from 'foldkit/schema'

/** Recipe bookmark. */
export const Recipe = ts('Recipe')
/** Restaurant bookmark. */
export const Restaurant = ts('Restaurant')
/** Place to visit. */
export const Place = ts('Place')
/** Show to watch. */
export const Show = ts('Show')
/** Article to read. */
export const Article = ts('Article')
/** Unclassified bookmark. */
export const Other = ts('Other')

/** A bookmark is classified as exactly one category. */
export const Category = S.Union([
  Recipe,
  Restaurant,
  Place,
  Show,
  Article,
  Other,
])
/** A bookmark is classified as exactly one category. */
export type Category = typeof Category.Type

const CATEGORIES = [Recipe, Restaurant, Place, Show, Article, Other] as const

/** Category constructors in display order. */
export const categories = CATEGORIES

/** Prints the category tag. */
export const categoryLabel = (category: Category): string => category._tag

const KEYWORDS: ReadonlyArray<readonly [Category, ReadonlyArray<string>]> = [
  [Recipe(), ['recipe', 'cook', 'ingredient', 'bake', 'oven', 'kitchen']],
  [
    Restaurant(),
    ['restaurant', 'menu', 'reservation', 'dine', 'bistro', 'cafe'],
  ],
  [Place(), ['visit', 'travel', 'hike', 'museum', 'park', 'city']],
  [Show(), ['watch', 'show', 'series', 'movie', 'film', 'episode']],
  [Article(), ['article', 'read', 'essay', 'blog', 'paper']],
]

/**
 * Maps a classifier string onto the Category ADT.
 * Wasm adapters and the deterministic classifier share this door.
 */
export const mapClassifierOutput = (label: string): Category => {
  const tag = pipeLower(label)
  if (tag === 'recipe') {
    return Recipe()
  }
  if (tag === 'restaurant') {
    return Restaurant()
  }
  if (tag === 'place') {
    return Place()
  }
  if (tag === 'show') {
    return Show()
  }
  if (tag === 'article') {
    return Article()
  }
  return Other()
}

const pipeLower = (text: string): string => Str.toLowerCase(text)

/** Deterministic local classifier. Same Category ADT as a wasm model. */
export const classifyDeterministic = (text: string): Category => {
  const query = pipeLower(text)
  const hit = Array.findFirst(KEYWORDS, ([, words]) =>
    words.some(word => query.includes(word)),
  )
  if (Option.isSome(hit)) {
    return hit.value[0]
  }
  return Other()
}
