import { Option } from 'effect'
import { Scene } from 'foldkit'
import { describe, test } from 'vitest'

import { FetchMe } from './command'
import {
  friendModelAt,
  loadingModelAt,
  ownerModelAt,
  unmeasuredUnderstanding,
} from './main.fixtures'
import { FailedFetchMe } from './message'
import { MeData, UnderstandingData } from './model'
import { update } from './update'
import { view } from './view/index'

describe('your page', () => {
  test('home names who is signed in and links their areas at proficient', () => {
    Scene.scene(
      { update, view },
      Scene.with(ownerModelAt('/')),
      Scene.expect(Scene.role('heading', { name: 'Your page' })).toExist(),
      Scene.expect(Scene.text('Signed in as owner@example.com')).toExist(),
      Scene.expect(
        Scene.role('link', { name: '2 of 3 areas at proficient' }),
      ).toExist(),
    )
  })

  test('home says plainly when the user has no understanding profile yet', () => {
    Scene.scene(
      { update, view },
      Scene.with(friendModelAt('/')),
      Scene.expect(Scene.text('Signed in as friend@example.com')).toExist(),
      Scene.expect(Scene.text('No understanding profile yet.')).toExist(),
    )
  })

  test('the understanding page leads with the areas at proficient, then each area by its newest rating, then the count after each rating', () => {
    Scene.scene(
      { update, view },
      Scene.with(ownerModelAt('/understanding')),
      Scene.expect(Scene.role('heading', { name: 'Understanding' })).toExist(),
      Scene.expect(Scene.text('2 of 3')).toExist(),
      Scene.expect(Scene.text('Area three')).toExist(),
      Scene.expect(Scene.text('2 of 10')).toExist(),
      Scene.expect(Scene.text('Not proficient')).toExist(),
      Scene.expect(Scene.text('1 of 2')).toExist(),
    )
  })

  test('the understanding page of a user with no profile says so plainly', () => {
    Scene.scene(
      { update, view },
      Scene.with(friendModelAt('/understanding')),
      Scene.expect(Scene.role('heading', { name: 'Understanding' })).toExist(),
      Scene.expect(
        Scene.text('You have no understanding profile yet.'),
      ).toExist(),
    )
  })

  test('an understanding count nobody measured says why', () => {
    Scene.scene(
      { update, view },
      Scene.with({
        ...ownerModelAt('/understanding'),
        understanding: UnderstandingData.Success({
          data: Option.some(unmeasuredUnderstanding),
        }),
      }),
      Scene.expect(
        Scene.text('Not measured: no profile on the laptop'),
      ).toExist(),
    )
  })

  test('says it is loading before the origin says who is signed in', () => {
    Scene.scene(
      { update, view },
      Scene.with(loadingModelAt('/')),
      Scene.expect(Scene.text('Loading your page…')).toExist(),
    )
  })

  test('says why when the page did not load, and can try again', () => {
    Scene.scene(
      { update, view },
      Scene.with({
        ...loadingModelAt('/'),
        me: MeData.Failure({ error: '/data/me.json answered HTTP 404' }),
      }),
      Scene.expect(Scene.text('Your page did not load.')).toExist(),
      Scene.click(Scene.role('button', { name: 'Try again' })),
      Scene.Command.resolve(FetchMe, FailedFetchMe({ error: 'still 404' })),
      Scene.expect(Scene.text('still 404')).toExist(),
    )
  })
})
