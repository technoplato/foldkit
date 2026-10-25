import { Option } from 'effect'
import { Scene } from 'foldkit'
import { evo } from 'foldkit/struct'
import { fromString } from 'foldkit/url'
import { describe, test } from 'vitest'
import {
  type Model,
  Questions,
  modelForRoute,
  update,
  urlToScribeRoute,
} from 'words-core-example'

import { questionsPage } from './questions.js'

const recordingID = '3b1d645a-cef4-4ba6-9acd-c52583ade335'
const threadID = '95585d86-642f-5a53-b5e4-542f40b7c27b'
const proximityText =
  'What proximity APIs does iOS have, to tell how far the phone is from his AirPods?'
const buildText = 'Which Scribe build is running on his iPhone?'

const proximity: Questions.Model.Question = {
  id: '85e1d773-77b3-5c9a-9266-793fbfdd5f2b',
  text: proximityText,
  askedBy: 'Michael',
  maybeAskerName: Option.none(),
  isLearning: true,
  status: 'Answered',
  maybeRecordingID: Option.some(recordingID),
  askedAtMs: 1_792_932_969_000,
  maybeNote: Option.none(),
  issueNumbers: [1176],
  stretches: [
    {
      recordingID,
      segmentID: '53116f05-ac09-4eb2-9df4-8acffd3276cc',
      firstLineIndex: 56,
      lastLineIndex: 59,
      startSeconds: 2368.72,
      startedAtMs: 1_792_932_969_000,
      quote: `"Wonder if there's any way to detect proximity." "to airpods."`,
      role: 'Asked',
    },
  ],
  answers: [
    {
      id: 'f094c911-01ea-5964-99a5-57ed3d5d6224',
      answeredBy: 'Agent',
      answererName: 'claude-code-2',
      text: 'Best fit: Nearby Interaction, the ultra-wideband chip.\n\nRougher: Bluetooth signal strength.',
      maybeThreadID: Option.some(threadID),
      maybeUrl: Option.none(),
      answeredAtMs: 1_792_933_031_975,
      stretches: [],
    },
  ],
  topics: [{ path: 'scribe/recording/live', title: 'Live capture' }],
}

const build: Questions.Model.Question = {
  ...proximity,
  id: '4e740f44-7fba-5a34-a531-a6cbb76f328c',
  text: buildText,
  isLearning: false,
  status: 'Open',
  askedAtMs: 1_792_939_000_000,
  issueNumbers: [],
  stretches: [],
  answers: [],
  topics: [],
}

const questionsModel = (
  state: Questions.Model.QuestionsState,
  url = 'https://words.pisspoursoftware.xyz/questions',
): Model =>
  evo(modelForRoute(urlToScribeRoute(Option.getOrThrow(fromString(url)))), {
    questions: questions => evo(questions, { state: () => state }),
  })

const loaded = (unreadableCount = 0): Questions.Model.QuestionsState =>
  Questions.Model.LoadedQuestions({
    questions: [proximity, build],
    unreadableCount,
  })

describe('the questions page', () => {
  test('lists his questions with his words linked to their lines and each answer linked to its thread', () => {
    Scene.scene(
      { update, view: questionsPage },
      Scene.with(questionsModel(loaded())),
      Scene.expect(Scene.role('heading', { name: 'Questions' })).toExist(),
      Scene.expect(Scene.role('heading', { name: proximityText })).toExist(),
      Scene.expect(Scene.role('heading', { name: buildText })).toExist(),
      Scene.expect(
        Scene.text(
          `Wonder if there's any way to detect proximity. to airpods.`,
        ),
      ).toExist(),
      Scene.expect(
        Scene.selector(
          `a[href="/recording/${recordingID}/section/53116f05-ac09-4eb2-9df4-8acffd3276cc?t=2368.72"]`,
        ),
      ).toExist(),
      Scene.expect(Scene.text('Asked at #56-59', { exact: false })).toExist(),
      Scene.expect(
        Scene.text('Best fit: Nearby Interaction, the ultra-wideband chip.'),
      ).toExist(),
      Scene.expect(Scene.text('Rougher: Bluetooth signal strength.')).toExist(),
      Scene.expect(Scene.role('link', { name: 'Open the thread' })).toHaveAttr(
        'href',
        `/recording/${recordingID}/thread/${threadID}`,
      ),
      Scene.expect(Scene.role('link', { name: 'Live capture' })).toHaveAttr(
        'href',
        '/questions?q=Live+capture',
      ),
      Scene.expect(Scene.role('link', { name: '#1176' })).toHaveAttr(
        'href',
        'https://issues.pisspoursoftware.xyz/issues/1176',
      ),
      Scene.expect(Scene.text('To Learn', { exact: false })).toExist(),
      Scene.expect(Scene.text('No answer kept yet.')).toExist(),
      Scene.expect(Scene.text('2 questions')).toExist(),
    )
  })

  test('a search finds a question by his words or its answer; the filters list the ones to learn from or the open ones', () => {
    Scene.scene(
      { update, view: questionsPage },
      Scene.with(questionsModel(loaded())),
      Scene.type(
        Scene.role('searchbox', { name: 'Search Questions' }),
        'wideband',
      ),
      Scene.expect(Scene.role('heading', { name: proximityText })).toExist(),
      Scene.expect(Scene.role('heading', { name: buildText })).toBeAbsent(),
      Scene.type(Scene.role('searchbox', { name: 'Search Questions' }), ''),
      Scene.click(Scene.role('button', { name: 'Open 1' })),
      Scene.expect(Scene.role('heading', { name: buildText })).toExist(),
      Scene.expect(Scene.role('heading', { name: proximityText })).toBeAbsent(),
      Scene.click(Scene.role('button', { name: 'To Learn 1' })),
      Scene.expect(Scene.role('heading', { name: proximityText })).toExist(),
      Scene.expect(Scene.role('heading', { name: buildText })).toBeAbsent(),
    )
  })

  test('a link with q opens the page searched', () => {
    Scene.scene(
      { update, view: questionsPage },
      Scene.with(
        questionsModel(
          loaded(),
          'https://words.pisspoursoftware.xyz/questions?q=airpods',
        ),
      ),
      Scene.expect(Scene.role('heading', { name: proximityText })).toExist(),
      Scene.expect(Scene.role('heading', { name: buildText })).toBeAbsent(),
    )
  })

  test('says how many rows could not be read, and why nothing loaded', () => {
    Scene.scene(
      { update, view: questionsPage },
      Scene.with(questionsModel(loaded(2))),
      Scene.expect(Scene.text('2 questions could not be read.')).toExist(),
    )
    Scene.scene(
      { update, view: questionsPage },
      Scene.with(
        questionsModel(
          Questions.Model.FailedQuestions({
            reason:
              'Your questions did not load. The network connection dropped.',
          }),
        ),
      ),
      Scene.expect(
        Scene.text('Your questions did not load', { exact: false }),
      ).toExist(),
    )
    Scene.scene(
      { update, view: questionsPage },
      Scene.with(
        questionsModel(
          Questions.Model.LoadedQuestions({
            questions: [],
            unreadableCount: 0,
          }),
        ),
      ),
      Scene.expect(Scene.text('No questions here yet')).toExist(),
    )
  })
})
