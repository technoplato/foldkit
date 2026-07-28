import {
  InitialControl,
  type Message,
  Model,
  SlideId,
} from 'constructive-data-modeling-core-example'
import { Option, Schema as S } from 'effect'
import { Runtime } from 'foldkit'

/** Selects a fresh start or a stable slide from a browser query string. */
export const startForSearch = (
  search: string,
): Runtime.ProgramStart<typeof Model.Type, Message> => {
  const encodedSlideId = new URLSearchParams(search).get('slide')
  const maybeSlideId = S.decodeUnknownOption(SlideId)(encodedSlideId)
  return Option.match(maybeSlideId, {
    onNone: () => Runtime.fresh(),
    onSome: currentSlideId =>
      Runtime.fromModel(
        Model.make({ currentSlideId, lastControl: InitialControl() }),
      ),
  })
}
