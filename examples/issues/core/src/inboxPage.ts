import { Array, Match as M, Option } from 'effect'
import {
  Button,
  Column,
  List,
  type ListItem,
  Row,
  Text,
  type UiNode,
} from 'foldkit/renderers'

import { whenLabel } from './clock.js'
import {
  type InboxFilter,
  type InboxItem,
  inboxItemsOf,
  itemsOfKind,
} from './inbox.js'
import { IssueDetail, type Model } from './model.js'
import { navigationToPath } from './route.js'

type PaintedRow = Readonly<{ when: string; row: ListItem }>

const paintedRows = new WeakMap<InboxItem, PaintedRow>()

/**
 * One line of the inbox, a link to its Issue. Built once per item and words
 * of how long ago it was, so a live change builds the rows it brought and a
 * minute's clock builds only the rows whose words moved.
 */
const inboxRowOf = (item: InboxItem, when: string): ListItem => {
  const painted = paintedRows.get(item)
  if (painted !== undefined && painted.when === when) {
    return painted.row
  } else {
    const row: ListItem = {
      href: navigationToPath(IssueDetail.make({ issueId: item.issue.id })),
      key: item.key,
      lines: [
        `#${item.issue.id}`,
        item.kind,
        item.words,
        ...Option.toArray(item.maybeWho),
        when,
      ],
      title: item.issue.title,
    }
    paintedRows.set(item, { row, when })
    return row
  }
}

const FILTERS: ReadonlyArray<readonly [InboxFilter, string, string]> = [
  ['All', 'inbox:all', 'All'],
  ['Status', 'inbox:status', 'Status'],
  ['Claim', 'inbox:claim', 'Claims'],
  ['Mention', 'inbox:mention', 'Mentions'],
]

const filterButtons = (chosen: InboxFilter): ReadonlyArray<UiNode> =>
  Array.map(FILTERS, ([filter, token, label]) =>
    Button({
      label,
      token,
      variant: filter === chosen ? 'Primary' : 'Ghost',
    }),
  )

const changeCountWords = (count: number): string =>
  count === 1 ? '1 change' : `${count.toLocaleString('en-US')} changes`

/**
 * The inbox: every status change, claim and mention the Issues hold, newest
 * first, each a link to its Issue, read from the catalog as it is now.
 */
export const inboxNodes = (
  model: Model,
  filter: InboxFilter,
): ReadonlyArray<UiNode> =>
  M.value(model.issues).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      LoadingIssues: () => [Text('Inbox'), Text('Observing…')],
      FailedIssues: ({ reason }) => [Text('Inbox'), Text(reason)],
      LoadedIssues: ({ issues }) => {
        const items = itemsOfKind(inboxItemsOf(issues), filter)
        return [
          Column(
            { gap: 1 },
            Text('Inbox', { emphasis: 'Headline' }),
            Row({ gap: 1 }, ...filterButtons(filter)),
            Text(changeCountWords(items.length)),
            List({
              items: Array.map(items, item =>
                inboxRowOf(
                  item,
                  whenLabel(
                    item.atMs,
                    model.clock.nowMs,
                    model.clock.offsetMinutes,
                  ),
                ),
              ),
              label: 'Inbox',
            }),
          ),
        ]
      },
    }),
  )
