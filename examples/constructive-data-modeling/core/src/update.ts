import { Match as M } from 'effect'
import type * as Command from 'foldkit/command'
import { evo } from 'foldkit/struct'

import {
  locationForPlaybackSeconds,
  locationForSlideId,
  locationKey,
  nearestPageForChooserScope,
  nextLocation,
  nextPageForChooserScope,
  previousLocation,
  previousPageForChooserScope,
} from './deck.js'
import type { Message } from './message.js'
import {
  AuthoredPageLocation,
  LandmarkPages,
  type Model,
  PageChooserClosed,
  PageChooserOpen,
  type RevealPage,
  VideoPlaybackControl,
} from './model.js'

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]

const closePageChooser = (model: Model): Model =>
  evo(model, { pageChooser: () => PageChooserClosed() })

/** Applies one host-neutral deck Message. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      AdvancedPage: ({ origin }) => [
        evo(model, {
          lastControl: () => origin,
          location: nextLocation,
          pageChooser: () => PageChooserClosed(),
        }),
        [],
      ],
      RewoundPage: ({ origin }) => [
        evo(model, {
          lastControl: () => origin,
          location: previousLocation,
          pageChooser: () => PageChooserClosed(),
        }),
        [],
      ],
      SelectedRevealPage: ({ origin, page }) => [
        evo(model, {
          lastControl: () => origin,
          location: () => AuthoredPageLocation({ page }),
          pageChooser: () => PageChooserClosed(),
        }),
        [],
      ],
      SelectedSlide: ({ origin, slideId }) => [
        evo(model, {
          lastControl: () => origin,
          location: () => locationForSlideId(slideId),
          pageChooser: () => PageChooserClosed(),
        }),
        [],
      ],
      ObservedPlayback: ({ seconds }) => {
        const nextLocation = locationForPlaybackSeconds(seconds)
        return locationKey(nextLocation) === locationKey(model.location)
          ? [model, []]
          : [
              evo(model, {
                lastControl: () => VideoPlaybackControl(),
                location: () => nextLocation,
              }),
              [],
            ]
      },
      OpenedPageChooser: ({ origin }) => {
        const scope = LandmarkPages()
        const currentPage = M.value(model.location).pipe(
          M.withReturnType<RevealPage>(),
          M.tagsExhaustive({
            AuthoredPageLocation: ({ page }) => page,
            QuestionAnswerLocation: () => 158,
          }),
        )
        return [
          evo(model, {
            pageChooser: () =>
              PageChooserOpen({
                origin,
                scope,
                selectedPage: nearestPageForChooserScope(currentPage, scope),
              }),
          }),
          [],
        ]
      },
      ChangedPageChooserScope: ({ scope }) =>
        M.value(model.pageChooser).pipe(
          M.withReturnType<UpdateReturn>(),
          M.tagsExhaustive({
            PageChooserClosed: () => [model, []],
            PageChooserOpen: ({ origin, selectedPage }) => [
              evo(model, {
                pageChooser: () =>
                  PageChooserOpen({
                    origin,
                    scope,
                    selectedPage: nearestPageForChooserScope(
                      selectedPage,
                      scope,
                    ),
                  }),
              }),
              [],
            ],
          }),
        ),
      ChosePageChooserTarget: ({ page }) =>
        M.value(model.pageChooser).pipe(
          M.withReturnType<UpdateReturn>(),
          M.tagsExhaustive({
            PageChooserClosed: () => [model, []],
            PageChooserOpen: ({ origin, scope }) => [
              evo(model, {
                pageChooser: () =>
                  PageChooserOpen({ origin, scope, selectedPage: page }),
              }),
              [],
            ],
          }),
        ),
      AdvancedPageChooserSelection: () =>
        M.value(model.pageChooser).pipe(
          M.withReturnType<UpdateReturn>(),
          M.tagsExhaustive({
            PageChooserClosed: () => [model, []],
            PageChooserOpen: ({ origin, scope, selectedPage }) => [
              evo(model, {
                pageChooser: () =>
                  PageChooserOpen({
                    origin,
                    scope,
                    selectedPage: nextPageForChooserScope(selectedPage, scope),
                  }),
              }),
              [],
            ],
          }),
        ),
      RewoundPageChooserSelection: () =>
        M.value(model.pageChooser).pipe(
          M.withReturnType<UpdateReturn>(),
          M.tagsExhaustive({
            PageChooserClosed: () => [model, []],
            PageChooserOpen: ({ origin, scope, selectedPage }) => [
              evo(model, {
                pageChooser: () =>
                  PageChooserOpen({
                    origin,
                    scope,
                    selectedPage: previousPageForChooserScope(
                      selectedPage,
                      scope,
                    ),
                  }),
              }),
              [],
            ],
          }),
        ),
      ConfirmedPageChooser: () =>
        M.value(model.pageChooser).pipe(
          M.withReturnType<UpdateReturn>(),
          M.tagsExhaustive({
            PageChooserClosed: () => [model, []],
            PageChooserOpen: ({ origin, selectedPage }) => [
              evo(model, {
                lastControl: () => origin,
                location: () => AuthoredPageLocation({ page: selectedPage }),
                pageChooser: () => PageChooserClosed(),
              }),
              [],
            ],
          }),
        ),
      CancelledPageChooser: () => [closePageChooser(model), []],
    }),
  )
