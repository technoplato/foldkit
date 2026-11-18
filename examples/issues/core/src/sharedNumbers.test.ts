import { Array, Option } from 'effect'
import { type ReferencePart, textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  IssueMention,
  UriReference,
} from '@foldkit/instant-tools/issues'

import { modelForNavigation } from './init.js'
import { ObservedIssues } from './message.js'
import { issuesScreen } from './program.js'
import { pathToNavigation } from './route.js'
import { update } from './update.js'

const FIRST = '11111111-1111-4111-8111-111111111111'
const SECOND = '22222222-2222-4222-8222-222222222222'

const issueQuoting = (id: string, quote: string): Issue =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs: 1_000,
    details: '',
    id,
    issueType: Option.none(),
    mentions: [
      IssueMention.make({
        capturedAtMs: Option.none(),
        directQuote: Option.some(quote),
        id: `mention-${id}`,
        issueId: id,
        reporter: Option.none(),
        source: UriReference.make({ value: `https://example.com/${id}` }),
      }),
    ],
    priority: 'P2',
    product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
    projectId: Option.none(),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status: 'Open',
    successCriteria: [],
    title: `Issue ${id}`,
    updatedAtMs: 1_000,
    viewerURL: Option.none(),
    workLog: [],
  })

describe('a Recording number two Recordings share', () => {
  it('says which Recordings have it on its page, and links each', () => {
    const [model] = update(
      modelForNavigation(pathToNavigation('/recordings/20')),
      ObservedIssues.make({
        issues: [
          issueQuoting('100', `Recording 020 (${FIRST}) #4`),
          issueQuoting('101', `Recording 20 (${SECOND}) #9`),
        ],
      }),
    )
    const screen = issuesScreen(model)

    expect(Array.map(textsOf(screen), text => text.content)).toContainEqual(
      expect.stringContaining('Recording 20 is the number of 2 Recordings'),
    )
    const hrefs = Array.flatMap(textsOf(screen), text =>
      Array.flatMap(text.parts ?? [], part =>
        part._tag === 'Reference' ? [(part as ReferencePart).href] : [],
      ),
    )
    expect(hrefs).toContain(`/recordings/${FIRST}`)
    expect(hrefs).toContain(`/recordings/${SECOND}`)
  })
})
