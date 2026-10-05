import { Array } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  type AppliedAudibleImport,
  DEMO_BOOK_IDS,
  type LibrarySnapshot,
  emptyJournal,
  planFromSnapshot,
} from '../audibleImport.node.js'
import { PlannedInLibrary, PlannedNew, PlannedSkip } from './libraryImport.js'
import { importSummaryOf, plannedTitlesOf } from './scribeImport.node.js'
import { Asin } from './title.js'

const owner = { id: 'owner-made-up-1', email: 'listener@example.invalid' }

const nowMs = Date.UTC(2026, 9, 4)

const itemOf = (
  asin: string,
  title: string,
  more: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> => ({
  asin,
  title,
  authors: [{ name: 'Mara Linden' }],
  narrators: [{ name: 'Ezra Vale' }],
  series: [],
  publisher_name: 'Made-Up Press',
  release_date: '2021-05-04',
  runtime_length_min: 60,
  purchase_date: '2026-09-01T00:00:00Z',
  language: 'english',
  content_type: 'Product',
  content_delivery_type: 'SinglePartBook',
  status: 'Active',
  origin_type: 'Purchase',
  is_ayce: false,
  is_adult_product: false,
  ...more,
})

const library = {
  items: [
    itemOf('B0FAKE0001', 'The Quiet Orchard'),
    itemOf('B0FAKE0002', 'Paper Boats', {
      origin_type: 'AudibleComplimentaryOriginal',
    }),
    itemOf('B0FAKE0003', 'The Long Way to Noon', { is_adult_product: true }),
    itemOf('B0FAKEPOD1', 'The Made-Up Hour', {
      content_type: 'Podcast',
      content_delivery_type: 'PodcastParent',
    }),
    itemOf('B0FAKEPLUS', 'Borrowed Light', {
      is_ayce: true,
      origin_type: 'AudibleChannels',
    }),
    itemOf('B002V0RAUU', 'A New Earth', {
      authors: [{ name: 'Eckhart Tolle' }],
    }),
    itemOf('B0FAKEKIND', 'Kindred', {
      authors: [{ name: 'Octavia E. Butler' }],
    }),
  ],
}

const snapshot: LibrarySnapshot = {
  books: [
    {
      id: 'book-a-new-earth',
      fields: {
        title: 'A New Earth',
        identifiersJSON: JSON.stringify([
          { kind: 'asin', value: 'B002V0RAUU' },
        ]),
      },
      authors: [{ id: 'author-tolle', name: 'Eckhart Tolle' }],
      narrators: [],
      items: [{ id: 'item-a-new-earth', fields: {}, links: {} }],
      coverIDs: [],
      hasCoverBytes: false,
      audioRenditionIDs: [],
      chapterCount: 3,
    },
    {
      id: DEMO_BOOK_IDS[0] ?? 'no-demo-book',
      fields: { title: 'Kindred' },
      authors: [{ id: 'author-butler', name: 'Octavia E. Butler' }],
      narrators: [],
      items: [],
      coverIDs: [],
      hasCoverBytes: false,
      audioRenditionIDs: [],
      chapterCount: 1,
    },
  ],
  authors: [
    { id: 'author-tolle', name: 'Eckhart Tolle' },
    { id: 'author-butler', name: 'Octavia E. Butler' },
  ],
  narrators: [],
  shelves: [],
  rows: {},
  itemCount: 1,
}

const details = Array.map(['B0FAKE0001', 'B0FAKE0002', 'B0FAKE0003'], asin => ({
  asin,
  chapters: [
    { title: 'One', startMs: 0, lengthMs: 1_800_000 },
    { title: 'Two', startMs: 1_800_000, lengthMs: 1_800_000 },
  ],
  runtimeMs: 3_600_000,
}))

const plan = planFromSnapshot({ library, owner, snapshot, nowMs, details })

describe('the Scribe importer as Books shows it', () => {
  it('lists new titles with their marks, the one on the shelf, and why the rest are skipped, a sample book among them', () => {
    expect(plannedTitlesOf(plan)).toEqual([
      PlannedNew({ asin: Asin.make('B0FAKE0001'), marks: [] }),
      PlannedNew({ asin: Asin.make('B0FAKE0002'), marks: ['Free'] }),
      PlannedNew({ asin: Asin.make('B0FAKE0003'), marks: ['Explicit'] }),
      PlannedSkip({ asin: Asin.make('B0FAKEPOD1'), kind: 'Podcast' }),
      PlannedSkip({ asin: Asin.make('B0FAKEPLUS'), kind: 'AudiblePlusLoan' }),
      PlannedInLibrary({ asin: Asin.make('B002V0RAUU'), marks: [] }),
      PlannedSkip({ asin: Asin.make('B0FAKEKIND'), kind: 'SampleMatch' }),
    ])
  })

  it('gives each new title the chapters the helper read', () => {
    expect(
      Array.map(
        Array.filter(plan.titles, title => title.action === 'create'),
        title => [title.asin, title.chapters],
      ),
    ).toEqual([
      ['B0FAKE0001', 2],
      ['B0FAKE0002', 2],
      ['B0FAKE0003', 2],
    ])
  })

  it('sums up what was added, matched, marked, skipped, and left out', () => {
    const chosen = planFromSnapshot({
      library,
      owner,
      snapshot,
      nowMs,
      details,
      asins: ['B0FAKE0001', 'B0FAKE0002', 'B0FAKE0003', 'B002V0RAUU'],
    })
    const applied: AppliedAudibleImport = {
      ok: false,
      writes: 12,
      guestReads: 0,
      journal: emptyJournal(owner.id),
      titles: [
        {
          asin: 'B0FAKE0001',
          title: 'The Quiet Orchard',
          action: 'create',
          ok: true,
          problems: [],
        },
        {
          asin: 'B0FAKE0002',
          title: 'Paper Boats',
          action: 'create',
          ok: false,
          problems: ['its cover did not upload'],
        },
        {
          asin: 'B0FAKE0003',
          title: 'The Long Way to Noon',
          action: 'create',
          ok: false,
          problems: ['its book is not readable as the owner'],
        },
        ...Array.map(
          Array.filter(chosen.titles, title => title.asin === 'B002V0RAUU'),
          title => ({
            asin: 'B002V0RAUU',
            title: 'A New Earth',
            action: title.action,
            ok: true,
            problems: [],
          }),
        ),
      ],
    }
    expect(importSummaryOf(chosen, applied)).toEqual({
      added: 2,
      matched: 1,
      notAdded: [
        {
          asin: 'B0FAKE0003',
          name: 'The Long Way to Noon',
          reason: 'its book is not readable as the owner',
        },
      ],
      marked: [{ mark: 'Free', count: 1 }],
      leftOut: ['Publisher', 'ReleaseDate'],
    })
  })
})
