import {
  AuthoredPageLocation,
  type DeckLocation,
  InitialControl,
  type Message,
  Model,
  PageChooserClosed,
  QuestionAnswerLocation,
  RevealPage,
  SlideId,
  locationForSlideId,
} from 'constructive-data-modeling-core-example'
import { Option, Schema as S } from 'effect'
import { Runtime } from 'foldkit'

/** Decodes an exact authored page, Q&A tail, or legacy logical slide URL. */
export const locationForSearch = (
  search: string,
): Option.Option<DeckLocation> => {
  const parameters = new URLSearchParams(search)
  const encodedPage = parameters.get('page')
  if (encodedPage === 'q-and-a') {
    return Option.some(QuestionAnswerLocation())
  }

  const maybePage = Option.flatMap(Option.fromNullishOr(encodedPage), page =>
    S.decodeUnknownOption(RevealPage)(Number(page)),
  )
  if (Option.isSome(maybePage)) {
    return Option.some(AuthoredPageLocation({ page: maybePage.value }))
  }

  return Option.map(
    S.decodeUnknownOption(SlideId)(parameters.get('slide')),
    locationForSlideId,
  )
}

/** Selects a fresh start or an exact synchronized URL location. */
export const startForSearch = (
  search: string,
): Runtime.ProgramStart<typeof Model.Type, Message> =>
  Option.match(locationForSearch(search), {
    onNone: () => Runtime.fresh(),
    onSome: location =>
      Runtime.fromModel(
        Model.make({
          lastControl: InitialControl(),
          location,
          pageChooser: PageChooserClosed(),
        }),
      ),
  })
