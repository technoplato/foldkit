import { Array, Match as M, Option, Schema as S } from 'effect'
import { type Document, type Html, html } from 'foldkit/html'
import {
  ClickedDismissTriageCandidate,
  ClickedPromoteTriageCandidate,
  type Destination,
  DismissedIssueDetail,
  type IssueDetailState,
  type IssuesState,
  type Message,
  type Model,
  SelectedIssue,
  SelectedIssuePriority,
  SelectedIssueProduct,
  SubmittedIssue,
  UpdatedIssueDetails,
  UpdatedIssueTitle,
  destinationForModel,
  interactionsForModel,
} from 'issues-core-example'

import { IssuePriority } from '@foldkit/instant-tools/issues'
import { Button, Input, Select, Textarea } from '@foldkit/ui'

const buttonClass =
  'rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 hover:text-stone-950'
const secondaryButtonClass =
  'rounded-full border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:border-stone-500'
const fieldClass =
  'w-full rounded-xl border border-stone-300 bg-white px-3 py-2 outline-none focus:border-amber-500'
const priorities: ReadonlyArray<typeof IssuePriority.Type> = [
  'P0',
  'P1',
  'P2',
  'P3',
  'P4',
]

const button = (label: string, message: Message, secondary = false): Html => {
  const h = html<Message>()
  return Button.view({
    onClick: message,
    toView: attributes =>
      h.button(
        [
          ...attributes.button,
          h.Class(secondary ? secondaryButtonClass : buttonClass),
        ],
        [label],
      ),
  })
}

const issueList = (state: IssuesState): Html => {
  const h = html<Message>()
  return M.value(state).pipe(
    M.withReturnType<Html>(),
    M.tagsExhaustive({
      LoadingIssues: () => h.p([], ['Observing Issues…']),
      FailedIssues: ({ reason }) =>
        h.p([h.Role('alert'), h.Class('text-red-700')], [reason]),
      LoadedIssues: ({ issues }) =>
        h.div(
          [h.Class('grid gap-3')],
          Array.map(issues, issue =>
            h.button(
              [
                h.Key(issue.id),
                h.Class(
                  'grid gap-2 rounded-2xl border border-stone-200 bg-white p-5 text-left shadow-sm hover:border-amber-400',
                ),
                h.OnClick(SelectedIssue.make({ issueId: issue.id })),
              ],
              [
                h.span(
                  [h.Class('font-mono text-xs text-amber-700')],
                  [`${issue.priority} · ${issue.id}`],
                ),
                h.strong([h.Class('text-lg')], [issue.title]),
                h.span(
                  [h.Class('text-sm text-stone-500')],
                  [
                    `${issue.product._tag} · ${issue.product.name} · ${issue.status}`,
                  ],
                ),
              ],
            ),
          ),
        ),
    }),
  )
}

const issueDetail = (state: IssueDetailState): Html => {
  const h = html<Message>()
  const back = button('← All issues', DismissedIssueDetail.make({}), true)
  return M.value(state).pipe(
    M.withReturnType<Html>(),
    M.tagsExhaustive({
      NotObservingIssue: () =>
        h.section([], [back, h.p([], ['Not observing'])]),
      LoadingIssue: () => h.section([], [back, h.p([], ['Observing issue…'])]),
      FailedIssue: ({ reason }) =>
        h.section(
          [],
          [back, h.p([h.Role('alert'), h.Class('text-red-700')], [reason])],
        ),
      LoadedIssue: ({ issue }) =>
        Option.match(issue, {
          onNone: () => h.section([], [back, h.h2([], ['Issue not found'])]),
          onSome: observed =>
            h.article(
              [h.Class('grid gap-4 rounded-3xl bg-white p-7 shadow-sm')],
              [
                back,
                h.p(
                  [h.Class('font-mono text-xs text-amber-700')],
                  [`${observed.priority} · ${observed.id}`],
                ),
                h.h2([h.Class('text-3xl font-semibold')], [observed.title]),
                h.p([h.Class('leading-7 text-stone-700')], [observed.details]),
                h.p(
                  [h.Class('text-sm text-stone-500')],
                  [
                    `${observed.product._tag} · ${observed.product.name} · ${observed.status}`,
                  ],
                ),
              ],
            ),
        }),
    }),
  )
}

const fileIssue = (model: Model): Html => {
  const h = html<Message>()
  const productEntries =
    model.products._tag === 'LoadedProducts' ? model.products.products : []
  return h.section(
    [h.Class('grid gap-5 rounded-3xl bg-white p-7 shadow-sm')],
    [
      button('← All issues', DismissedIssueDetail.make({}), true),
      h.h2([h.Class('text-3xl font-semibold')], ['File an issue']),
      h.form(
        [h.Class('grid gap-5'), h.OnSubmit(SubmittedIssue.make({}))],
        [
          Input.view({
            id: 'issue-title',
            onInput: value => UpdatedIssueTitle.make({ value }),
            value: model.draft.title,
            toView: attributes =>
              h.label(
                [h.Class('grid gap-2')],
                [
                  h.span([], ['Title']),
                  h.input([...attributes.input, h.Class(fieldClass)]),
                ],
              ),
          }),
          Select.view({
            id: 'issue-product',
            onChange: productId => SelectedIssueProduct.make({ productId }),
            value: model.draft.productId,
            toView: attributes =>
              h.label(
                [h.Class('grid gap-2')],
                [
                  h.span([], ['Application or Library']),
                  h.select(
                    [...attributes.select, h.Class(fieldClass)],
                    Array.map(productEntries, entry =>
                      h.option(
                        [h.Key(entry.product.id), h.Value(entry.product.id)],
                        [`${entry.product._tag} · ${entry.product.name}`],
                      ),
                    ),
                  ),
                ],
              ),
          }),
          Select.view({
            id: 'issue-priority',
            onChange: value =>
              SelectedIssuePriority.make({
                priority: S.decodeUnknownSync(IssuePriority)(value),
              }),
            value: model.draft.priority,
            toView: attributes =>
              h.label(
                [h.Class('grid gap-2')],
                [
                  h.span([], ['Priority']),
                  h.select(
                    [...attributes.select, h.Class(fieldClass)],
                    Array.map(priorities, priority =>
                      h.option(
                        [h.Key(priority), h.Value(priority)],
                        [priority],
                      ),
                    ),
                  ),
                ],
              ),
          }),
          Textarea.view({
            id: 'issue-details',
            onInput: value => UpdatedIssueDetails.make({ value }),
            value: model.draft.details,
            toView: attributes =>
              h.label(
                [h.Class('grid gap-2')],
                [
                  h.span([], ['Details']),
                  h.textarea(
                    [...attributes.textarea, h.Class(`${fieldClass} min-h-32`)],
                    [],
                  ),
                ],
              ),
          }),
          model.draftState._tag === 'FailedIssueDraft'
            ? h.p(
                [h.Role('alert'), h.Class('text-red-700')],
                [model.draftState.reason],
              )
            : h.empty,
          Button.view({
            type: 'submit',
            isDisabled: model.draftState._tag === 'SavingIssueDraft',
            toView: attributes =>
              h.button(
                [...attributes.button, h.Class(buttonClass)],
                [
                  model.draftState._tag === 'SavingIssueDraft'
                    ? 'Saving…'
                    : 'File issue',
                ],
              ),
          }),
        ],
      ),
    ],
  )
}

const destinationView = (destination: Destination, model: Model): Html => {
  const h = html<Message>()
  return M.value(destination).pipe(
    M.withReturnType<Html>(),
    M.tagsExhaustive({
      IssueListDestination: ({ state }) => issueList(state),
      IssueDetailDestination: ({ state }) => issueDetail(state),
      FileIssueDestination: () => fileIssue(model),
      TriageInboxDestination: ({ state }) =>
        h.section(
          [h.Class('grid gap-4 rounded-3xl bg-white p-7 shadow-sm')],
          [
            button('← All issues', DismissedIssueDetail.make({}), true),
            h.h2([h.Class('text-3xl font-semibold')], ['Triage inbox']),
            h.p(
              [],
              ['Transcript-derived candidates remain drafts until promoted.'],
            ),
            state._tag === 'LoadedTriageCandidates'
              ? h.div(
                  [h.Class('grid gap-3')],
                  Array.map(state.candidates, candidate =>
                    h.article(
                      [
                        h.Id(candidate.segment.id),
                        h.Key(candidate.id),
                        h.Class(
                          'grid gap-3 rounded-2xl border border-stone-200 p-5',
                        ),
                      ],
                      [
                        h.p(
                          [h.Class('font-mono text-xs text-amber-700')],
                          [
                            `${candidate.status} · ${candidate.suggestedPriority}`,
                          ],
                        ),
                        h.strong([], [candidate.suggestedTitle]),
                        h.p([], [candidate.segment.transcript]),
                        Option.isSome(candidate.segment.publicUrl)
                          ? h.a(
                              [h.Href(candidate.segment.publicUrl.value)],
                              ['Share segment'],
                            )
                          : h.empty,
                        candidate.status === 'Draft'
                          ? h.div(
                              [h.Class('flex gap-2')],
                              [
                                button(
                                  'Promote to Issue',
                                  ClickedPromoteTriageCandidate.make({
                                    candidateId: candidate.id,
                                  }),
                                ),
                                button(
                                  'Dismiss',
                                  ClickedDismissTriageCandidate.make({
                                    candidateId: candidate.id,
                                  }),
                                  true,
                                ),
                              ],
                            )
                          : h.empty,
                      ],
                    ),
                  ),
                )
              : h.p([], [state._tag]),
          ],
        ),
    }),
  )
}

/** Renders every Issue Tracker destination through Foldkit HTML. */
export const view = (model: Model): Document => {
  const h = html<Message>()
  const interactions = interactionsForModel(model)
  return {
    title: 'Issue Tracker · Foldkit',
    body: h.main(
      [h.Class('mx-auto grid min-h-screen max-w-4xl gap-8 px-5 py-12')],
      [
        h.header(
          [h.Class('grid gap-3')],
          [
            h.p(
              [
                h.Class(
                  'font-mono text-xs uppercase tracking-widest text-amber-700',
                ),
              ],
              ['Foldkit Program · Foldkit HTML Client'],
            ),
            h.div(
              [h.Class('flex flex-wrap items-end justify-between gap-4')],
              [
                h.div(
                  [],
                  [
                    h.h1(
                      [h.Class('text-5xl font-semibold tracking-tight')],
                      ['Issues'],
                    ),
                    h.p(
                      [h.Class('mt-2 text-stone-500')],
                      ['One navigation model across every host.'],
                    ),
                  ],
                ),
                h.nav(
                  [h.AriaLabel('Issue actions'), h.Class('flex gap-2')],
                  Array.map(interactions, interaction =>
                    interaction.token === 'file' ||
                    interaction.token === 'triage'
                      ? button(interaction.label, interaction.message)
                      : h.empty,
                  ),
                ),
              ],
            ),
          ],
        ),
        destinationView(destinationForModel(model), model),
      ],
    ),
  }
}
