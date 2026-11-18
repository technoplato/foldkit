import { Option } from 'effect'
import { Story } from 'foldkit'
import { fromString } from 'foldkit/url'
import { expect, test } from 'vitest'

import { FetchMe, FetchUnderstanding } from './command'
import { init } from './init'
import {
  friendMe,
  loadingModelAt,
  ownerMe,
  ownerModelAt,
  sampleUnderstanding,
} from './main.fixtures'
import {
  ClickedReload,
  FailedFetchMe,
  FailedFetchUnderstanding,
  SucceededFetchMe,
  SucceededFetchUnderstanding,
} from './message'
import { update } from './update'

test('the page first asks the origin who is signed in, and nothing else', () => {
  const [model, commands] = init(
    Option.getOrThrow(fromString('https://me.example/understanding')),
  )
  expect(model.me._tag).toBe('Loading')
  expect(model.understanding._tag).toBe('Idle')
  expect(commands.map(command => command.name)).toStrictEqual([FetchMe.name])
})

test('a user whose folder holds an understanding profile loads it', () => {
  Story.story(
    update,
    Story.with(loadingModelAt('/')),
    Story.message(SucceededFetchMe({ me: ownerMe })),
    Story.model(model => {
      expect(model.me._tag).toBe('Success')
      expect(model.understanding._tag).toBe('Loading')
    }),
    Story.Command.expectHas(FetchUnderstanding),
    Story.Command.resolve(
      FetchUnderstanding,
      SucceededFetchUnderstanding({ understanding: sampleUnderstanding }),
    ),
    Story.model(model => {
      expect(model.understanding).toStrictEqual({
        _tag: 'Success',
        data: Option.some(sampleUnderstanding),
      })
    }),
  )
})

test('a user with no profile is told so, and nothing is fetched for them', () => {
  Story.story(
    update,
    Story.with(loadingModelAt('/')),
    Story.message(SucceededFetchMe({ me: friendMe })),
    Story.model(model => {
      expect(model.understanding).toStrictEqual({
        _tag: 'Success',
        data: Option.none(),
      })
    }),
    Story.Command.expectNone(),
  )
})

test('a failed first load of who is signed in says why', () => {
  Story.story(
    update,
    Story.with(loadingModelAt('/')),
    Story.message(FailedFetchMe({ error: '/data/me.json answered HTTP 404' })),
    Story.model(model => {
      expect(model.me._tag).toBe('Failure')
      expect(model.understanding._tag).toBe('Idle')
    }),
  )
})

test('a failed load of the profile says why, and a failed reload keeps what was shown', () => {
  Story.story(
    update,
    Story.with(loadingModelAt('/')),
    Story.message(SucceededFetchMe({ me: ownerMe })),
    Story.Command.resolve(
      FetchUnderstanding,
      FailedFetchUnderstanding({ error: 'offline' }),
    ),
    Story.model(model => {
      expect(model.understanding._tag).toBe('Failure')
    }),
  )
  Story.story(
    update,
    Story.with(ownerModelAt('/understanding')),
    Story.message(ClickedReload()),
    Story.model(model => {
      expect(model.me._tag).toBe('Refreshing')
    }),
    Story.Command.expectHas(FetchMe),
    Story.Command.resolve(FetchMe, FailedFetchMe({ error: 'offline' })),
    Story.model(model => {
      expect(model.me._tag).toBe('Stale')
      expect(model.understanding._tag).toBe('Success')
    }),
  )
})

test('a reload that answers asks for the profile again', () => {
  Story.story(
    update,
    Story.with(ownerModelAt('/understanding')),
    Story.message(ClickedReload()),
    Story.Command.resolve(FetchMe, SucceededFetchMe({ me: ownerMe })),
    Story.model(model => {
      expect(model.understanding._tag).toBe('Refreshing')
    }),
    Story.Command.resolve(
      FetchUnderstanding,
      SucceededFetchUnderstanding({ understanding: sampleUnderstanding }),
    ),
    Story.model(model => {
      expect(model.understanding._tag).toBe('Success')
    }),
  )
})
