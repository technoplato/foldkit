import {
  type ArchiveStatus,
  ClickedArchive,
  type Message,
  type Model,
  SubmittedArchiveUrl,
  UpdatedUrlDraft,
} from 'archiver-core-example'
import { Array, Match as M } from 'effect'
import { Document, html } from 'foldkit/html'

import { Button, Input } from '@foldkit/ui'

/** Renders the Archiver shelf with Foldkit HTML. */
export const view = (model: Model): Document => {
  const h = html<Message>()
  return {
    title: 'Archiver',
    body: h.main(
      [h.Class('min-h-screen bg-white text-gray-900 p-6 max-w-xl mx-auto')],
      [
        h.h1([h.Class('text-3xl font-bold mb-4')], ['Archiver']),
        h.p(
          [h.Class('text-gray-600 mb-6')],
          ['Paste an Instagram, TikTok, or YouTube URL to archive it.'],
        ),
        urlFormView(model.urlDraft),
        archiveListView(model),
      ],
    ),
  }
}

const urlFormView = (urlDraft: string) => {
  const h = html<Message>()
  return h.form(
    [h.Class('flex flex-col gap-3 mb-8'), h.OnSubmit(SubmittedArchiveUrl())],
    [
      Input.view<Message>({
        id: 'archive-url',
        value: urlDraft,
        onInput: value => UpdatedUrlDraft({ value }),
        toView: attributes =>
          h.div(
            [h.Class('flex flex-col gap-1')],
            [
              h.label([...attributes.label], ['Source URL']),
              h.input([
                ...attributes.input,
                h.Class('border border-gray-300 rounded px-3 py-2 bg-white'),
                h.Placeholder('https://'),
              ]),
            ],
          ),
      }),
      Button.view<Message>({
        onClick: SubmittedArchiveUrl(),
        toView: attributes =>
          h.button(
            [...attributes.button, h.Class(buttonStyle), h.Type('submit')],
            ['Archive'],
          ),
      }),
    ],
  )
}

const archiveListView = (model: Model) => {
  const h = html<Message>()
  return Array.match(model.archives, {
    onEmpty: () => h.p([h.Class('text-gray-500')], ['No archives yet.']),
    onNonEmpty: archives =>
      h.ul(
        [h.Class('flex flex-col gap-2')],
        archives.map(archive =>
          h.keyed('li')(
            archive.id,
            [h.Class('border border-gray-200 rounded p-3 flex flex-col gap-1')],
            [
              h.button(
                [
                  h.Class('text-left font-medium'),
                  h.OnClick(ClickedArchive({ id: archive.id })),
                  h.Type('button'),
                ],
                [archive.title],
              ),
              h.span(
                [h.Class('text-sm text-gray-500')],
                [statusLabel(archive.status)],
              ),
            ],
          ),
        ),
      ),
  })
}

const statusLabel = (status: ArchiveStatus): string =>
  M.value(status).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      QueuedArchive: () => 'Queued',
      ReadyArchive: () => 'Ready',
      FailedArchive: () => 'Failed',
    }),
  )

const buttonStyle = 'bg-black text-white hover:bg-gray-700 px-4 py-2 transition'
