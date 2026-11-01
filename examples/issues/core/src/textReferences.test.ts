import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { type TextPiece, readTextReferences } from './textReferences.js'

const referencesIn = (text: string) =>
  Array.flatMap(readTextReferences(text), piece =>
    piece._tag === 'Referenced' ? [piece] : [],
  )

const wordsOf = (pieces: ReadonlyArray<TextPiece>): string =>
  Array.join(
    Array.map(pieces, piece => piece.text),
    '',
  )

describe('readTextReferences', () => {
  it('keeps every character of the text, in order', () => {
    const text =
      'Fixed by #1358 at commit 5b89a496e in build 218; see https://words.pisspoursoftware.xyz/recording/faa684c2-34e4-47e5-8f9b-3b2196da9463/section/8d70b597-a775-41d8-b688-a08f722a87b2?t=14287.00.'
    expect(wordsOf(readTextReferences(text))).toBe(text)
  })

  it('reads an Issue number of three or four digits, never a line range or a list number', () => {
    expect(
      Array.map(referencesIn('Related: #041, #174 and #1358.'), piece =>
        piece.reference._tag === 'IssueNumber' ? piece.reference.issueId : '',
      ),
    ).toEqual(['041', '174', '1358'])
    expect(referencesIn('rule #3 and lines #313-314')).toEqual([])
  })

  it('reads an Issue page link as that Issue', () => {
    const [piece] = referencesIn(
      'Viewer: https://issues.knophy.com/issues/689 now.',
    )
    expect(piece?.reference).toEqual({ _tag: 'IssueNumber', issueId: '689' })
    expect(piece?.text).toBe('https://issues.knophy.com/issues/689')
  })

  it('reads a Recording and its lines, with or without its id in parentheses', () => {
    const [plain, withId] = referencesIn(
      'Said in Recording 208 #2724-2737, then Recording 322 (44b6f249-8e0a-4cb6-b54e-4d1a1100d6b3) #493.',
    )
    expect(plain?.reference).toEqual({
      _tag: 'RecordingLines',
      recordingNumber: 208,
      maybeRecordingId: Option.none(),
      maybeLineRange: Option.some({ first: 2724, last: 2737 }),
    })
    expect(withId?.reference).toEqual({
      _tag: 'RecordingLines',
      recordingNumber: 322,
      maybeRecordingId: Option.some('44b6f249-8e0a-4cb6-b54e-4d1a1100d6b3'),
      maybeLineRange: Option.some({ first: 493, last: 493 }),
    })
  })

  it('reads a line range after a Recording as more lines of that Recording', () => {
    const pieces = referencesIn(
      'Recording 208 #2724-2725 and later #2735-2737.',
    )
    expect(Array.map(pieces, piece => piece.reference)).toEqual([
      {
        _tag: 'RecordingLines',
        recordingNumber: 208,
        maybeRecordingId: Option.none(),
        maybeLineRange: Option.some({ first: 2724, last: 2725 }),
      },
      {
        _tag: 'RecordingLines',
        recordingNumber: 208,
        maybeRecordingId: Option.none(),
        maybeLineRange: Option.some({ first: 2735, last: 2737 }),
      },
    ])
  })

  it('reads a words deep link with its recording, line and time', () => {
    const [piece] = referencesIn(
      'Deep link: https://words.knophy.com/recording/faa684c2-34e4-47e5-8f9b-3b2196da9463/section/574c0938-6063-4eba-a718-ee56bfcf9c46?t=16171.68.',
    )
    expect(piece?.reference).toEqual({
      _tag: 'WordsLink',
      url: 'https://words.pisspoursoftware.xyz/recording/faa684c2-34e4-47e5-8f9b-3b2196da9463/section/574c0938-6063-4eba-a718-ee56bfcf9c46?t=16171.68',
      recordingId: 'faa684c2-34e4-47e5-8f9b-3b2196da9463',
      maybeSectionId: Option.some('574c0938-6063-4eba-a718-ee56bfcf9c46'),
      maybeAtSeconds: Option.some(16171.68),
    })
  })

  it('reads a link on og as the same words page: og only previews it', () => {
    const [piece] = referencesIn(
      'Deep link: https://og.pisspoursoftware.xyz/recording/faa684c2-34e4-47e5-8f9b-3b2196da9463/section/574c0938-6063-4eba-a718-ee56bfcf9c46?t=16171.68.',
    )
    expect(piece?.reference).toEqual({
      _tag: 'WordsLink',
      url: 'https://words.pisspoursoftware.xyz/recording/faa684c2-34e4-47e5-8f9b-3b2196da9463/section/574c0938-6063-4eba-a718-ee56bfcf9c46?t=16171.68',
      recordingId: 'faa684c2-34e4-47e5-8f9b-3b2196da9463',
      maybeSectionId: Option.some('574c0938-6063-4eba-a718-ee56bfcf9c46'),
      maybeAtSeconds: Option.some(16171.68),
    })
  })

  it('reads an Issue link on og as that Issue', () => {
    const [piece] = referencesIn(
      'Filed as https://og.pisspoursoftware.xyz/issues/689 now.',
    )
    expect(piece?.reference).toEqual({ _tag: 'IssueNumber', issueId: '689' })
  })

  it('reads a Markdown link by its label and its address', () => {
    const [piece] = referencesIn(
      'He said [#2735](https://words.pisspoursoftware.xyz/recording/faa684c2-34e4-47e5-8f9b-3b2196da9463/section/8d70b597-a775-41d8-b688-a08f722a87b2?t=14287.00) twice.',
    )
    expect(piece?.text).toBe(
      '[#2735](https://words.pisspoursoftware.xyz/recording/faa684c2-34e4-47e5-8f9b-3b2196da9463/section/8d70b597-a775-41d8-b688-a08f722a87b2?t=14287.00)',
    )
    expect(piece?.maybeLabel).toEqual(Option.some('#2735'))
    expect(piece?.reference._tag).toBe('WordsLink')
  })

  it('reads a commit where the words say so or its length does, and an eight-character id never as one', () => {
    const shas = Array.flatMap(
      referencesIn(
        'red 9be70b4a8, green e9c4aa53f, landed f9ac958b0 on technoplato/main; app e7c49961 and recording faa684c2 are not commits; 6bee2358de4a2c55607adfa2c45a6242f23d08ac is.',
      ),
      piece =>
        piece.reference._tag === 'CommitSha' ? [piece.reference.sha] : [],
    )
    expect(shas).toEqual([
      '9be70b4a8',
      'e9c4aa53f',
      'f9ac958b0',
      '6bee2358de4a2c55607adfa2c45a6242f23d08ac',
    ])
  })

  it('reads an agent by its harness and name, never a file path', () => {
    const agents = Array.map(
      referencesIn(
        'Claimed by claude-code/issues-linear-1538@ld, released by issues/working-sync; started by tools/agent-run. Not issues/662/shot.png.',
      ),
      piece =>
        piece.reference._tag === 'AgentName' ? piece.reference.agentId : '',
    )
    expect(agents).toEqual([
      'claude-code/issues-linear-1538@ld',
      'issues/working-sync',
      'tools/agent-run',
    ])
  })

  it('reads a build by its number, and an app build by its version and number', () => {
    expect(
      Array.map(
        referencesIn('In build 102, then Vakyume 0.1 (217) on TestFlight.'),
        piece => piece.reference,
      ),
    ).toEqual([
      {
        _tag: 'BuildNumber',
        maybeApp: Option.none(),
        maybeVersion: Option.none(),
        number: '102',
      },
      {
        _tag: 'BuildNumber',
        maybeApp: Option.some('Vakyume'),
        maybeVersion: Option.some('0.1'),
        number: '217',
      },
    ])
  })

  it('reads a timestamp, a chat session, a raw id and any other link', () => {
    const references = Array.map(
      referencesIn(
        'At 2026-10-11T10:41:09.240Z in Claude Code session c863fc6a-8ae7-4eca-8838-49cc9408897c (https://claude.ai/code/session_017ajoqHh25HBjgwKzBknpLt), message 82fc7bc4-3fb8-47f9-93de-90ec9d004131; docs https://www.instantdb.com/docs/auth.',
      ),
      piece => piece.reference._tag,
    )
    expect(references).toEqual([
      'Timestamp',
      'ChatSession',
      'ChatSession',
      'RawId',
      'WebLink',
    ])
  })

  it('names the ids the words around them name', () => {
    const references = Array.map(
      referencesIn(
        'Recording 023 = 52e9a666-e30d-4978-9fab-39834bcc64ab; Recording 199 #475 (segment 1bbe1ef8-698b-435d-a73b-96e926deb11e). Lines: #261 41953b55-fcda-4cbe-805c-5bb8160352f1. Recording 0ae6b994-bd97-4508-b1d9-739853817d2b. Saved in ~/.codex/visualizations/2026/08/14/01a00071-f1c1-7193-adcd-3bc9f30b5f95/report.html.',
      ),
      piece => piece.reference,
    )
    expect(references).toEqual([
      {
        _tag: 'RecordingLines',
        recordingNumber: 23,
        maybeRecordingId: Option.some('52e9a666-e30d-4978-9fab-39834bcc64ab'),
        maybeLineRange: Option.none(),
      },
      {
        _tag: 'RecordingLines',
        recordingNumber: 199,
        maybeRecordingId: Option.none(),
        maybeLineRange: Option.some({ first: 475, last: 475 }),
      },
      {
        _tag: 'SegmentId',
        segmentId: '1bbe1ef8-698b-435d-a73b-96e926deb11e',
        maybeLine: Option.none(),
        maybeRecordingNumber: Option.some(199),
        maybeRecordingId: Option.none(),
      },
      {
        _tag: 'SegmentId',
        segmentId: '41953b55-fcda-4cbe-805c-5bb8160352f1',
        maybeLine: Option.some(261),
        maybeRecordingNumber: Option.some(199),
        maybeRecordingId: Option.none(),
      },
      {
        _tag: 'RecordingId',
        recordingId: '0ae6b994-bd97-4508-b1d9-739853817d2b',
      },
      {
        _tag: 'FilePath',
        path: '~/.codex/visualizations/2026/08/14/01a00071-f1c1-7193-adcd-3bc9f30b5f95/report.html',
      },
    ])
  })
})

describe('an id no word announces', () => {
  const referenceIn = (text: string) =>
    Array.map(referencesIn(text), piece => piece.reference)

  it('reads a short commit id on its own as a commit', () => {
    expect(referenceIn('The pin moved to f9ac958b0, then back.')).toEqual([
      { _tag: 'CommitSha', sha: 'f9ac958b0' },
    ])
  })

  it('reads an eight-character id as an id, not a commit', () => {
    expect(referenceIn('Proved on bd40c50a first.')).toEqual([
      { _tag: 'RawId', id: 'bd40c50a' },
    ])
  })

  it('reads a longer id that no commit has the length of as an id', () => {
    expect(referenceIn('Subagent a9ddbc23c5ec94095 stopped.')).toEqual([
      { _tag: 'RawId', id: 'a9ddbc23c5ec94095' },
    ])
  })

  it('leaves plain words and numbers as words', () => {
    expect(referenceIn('The decade 1234567 ended, abcdefg too.')).toEqual([])
    expect(referenceIn('A path docs/f9ac958b0 and x-f9ac958b0 stay.')).toEqual(
      [],
    )
  })
})
