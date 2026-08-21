import { Option, Result } from 'effect'

import { type Message, OpenedNavigation } from './message.js'
import { type Model, itemById } from './model.js'
import { navigationTargetToPath, pathToNavigationTarget } from './route.js'

/** Resolves one portable URI into exactly one OpenedNavigation Message. */
export const resolveNavigationCarrier = (
  model: Model,
  destinationUri: string,
): Result.Result<Message, string> => {
  const target = pathToNavigationTarget(destinationUri)
  const canonical = navigationTargetToPath(target)
  const allowed =
    target._tag === 'ShelfTarget'
      ? destinationUri === '/' ||
        destinationUri === '/shelf' ||
        destinationUri === canonical
      : target._tag === 'BookBothTarget'
        ? destinationUri === canonical ||
          destinationUri === `/book/${target.itemId}/both`
        : target._tag === 'NoteShareTarget'
          ? destinationUri === canonical ||
            destinationUri === `/n/${target.noteId}` ||
            destinationUri.startsWith(`/n/${target.noteId}?`)
          : destinationUri === canonical
  if (!allowed) {
    return Result.fail(canonical)
  }
  if (
    (target._tag === 'BookTitleTarget' ||
      target._tag === 'BookTextTarget' ||
      target._tag === 'BookAudioTarget' ||
      target._tag === 'BookBothTarget') &&
    Option.isNone(itemById(model.items, target.itemId))
  ) {
    return Result.fail(canonical)
  }
  return Result.succeed(OpenedNavigation({ target }))
}
