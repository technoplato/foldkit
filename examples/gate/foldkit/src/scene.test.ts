import { Scene } from 'foldkit'
import {
  ReadOrigin,
  SucceededReadOrigin,
  failedBadGatewayModel,
  failedInvalidModel,
  failedUnreachableModel,
  readModel,
  readingModel,
  sampleRemainingMessages,
  sampleRemainingRate,
  unreadModel,
  update,
} from 'gate-core-example'
import { describe, test } from 'vitest'

import { view } from './index.js'

describe('Gate Foldkit view', () => {
  test('unread offers Refresh, which reads the origin', () => {
    Scene.scene(
      { update, view },
      Scene.with(unreadModel),
      Scene.expect(Scene.text('Gate')).toExist(),
      Scene.expect(Scene.text('Unread')).toExist(),
      Scene.expect(Scene.role('button', { name: 'Refresh' })).toExist(),
      Scene.click(Scene.role('button', { name: 'Refresh' })),
      Scene.Command.expectHas(ReadOrigin),
      Scene.Command.resolve(
        ReadOrigin,
        SucceededReadOrigin({
          rate: sampleRemainingRate,
          messages: sampleRemainingMessages,
        }),
      ),
      Scene.expect(
        Scene.text('Rate remaining 40 of 60 resets 60000'),
      ).toExist(),
      Scene.expect(
        Scene.text('Messages remaining 10 of 20 resets 86400000'),
      ).toExist(),
      Scene.expect(Scene.role('button', { name: 'Refresh' })).toExist(),
    )
  })

  test('hides Refresh while Reading', () => {
    Scene.scene(
      { update, view },
      Scene.with(readingModel),
      Scene.expect(Scene.text('Reading')).toExist(),
      Scene.expect(Scene.role('button', { name: 'Refresh' })).toBeAbsent(),
    )
  })

  test('paints every Failed reason and Read quotas', () => {
    Scene.scene(
      { update, view },
      Scene.with(failedBadGatewayModel),
      Scene.expect(Scene.text('Bad gateway')).toExist(),
    )
    Scene.scene(
      { update, view },
      Scene.with(failedUnreachableModel),
      Scene.expect(Scene.text('Unreachable')).toExist(),
    )
    Scene.scene(
      { update, view },
      Scene.with(failedInvalidModel),
      Scene.expect(Scene.text('Invalid')).toExist(),
    )
    Scene.scene(
      { update, view },
      Scene.with(readModel),
      Scene.expect(
        Scene.text('Rate remaining 40 of 60 resets 60000'),
      ).toExist(),
    )
  })
})
